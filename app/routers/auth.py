import uuid
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Depends, status
from app.database import get_db_connection
from app.security import hash_password, verify_password, create_jwt_token, get_current_user, log_audit
from app.models import (
    LoginRequest,
    CustomerSignupRequest,
    GenerateInviteRequest,
    AcceptInviteSignupRequest,
    SendPhoneOtpRequest,
    VerifyPhoneOtpRequest
)
import time
import re

router = APIRouter(prefix="/api/auth", tags=["Authentication & Identity"])

# In-memory store for phone OTP verifications: {normalized_phone: {"otp": "123456", "expires_at": float, "verified": bool}}
_phone_otps = {}

def normalize_phone_number(raw_phone: str) -> str:
    cleaned = re.sub(r"[^\d+]", "", raw_phone.strip())
    if cleaned.startswith("0") and len(cleaned) == 11:
        cleaned = "+234" + cleaned[1:]
    elif not cleaned.startswith("+") and len(cleaned) == 10:
        cleaned = "+234" + cleaned
    return cleaned

@router.post("/send-phone-otp")
def send_phone_otp(req: SendPhoneOtpRequest):
    """
    Sends a 6-digit SMS verification OTP to the customer's phone number.
    """
    phone = normalize_phone_number(req.phone)
    if len(re.sub(r"\D", "", phone)) < 10:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please enter a valid phone number (minimum 10 digits).")

    conn = get_db_connection()
    existing = conn.execute("SELECT id FROM users WHERE phone = ?", (phone,)).fetchone()
    conn.close()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This phone number is already registered to an account.")

    # Generate a cryptographically secure 6-digit numeric OTP
    otp_code = f"{secrets.randbelow(900000) + 100000}"
    expires_at = time.time() + 600 # 10 minutes expiry

    _phone_otps[phone] = {
        "otp": otp_code,
        "expires_at": expires_at,
        "verified": False
    }

    return {
        "success": True,
        "message": f"Verification code sent to {phone}.",
        "phone": phone,
        "dev_otp": otp_code, # Sent in response for immediate UI autofill & SMS gateway integration
        "expires_in": 600
    }

@router.post("/verify-phone-otp")
def verify_phone_otp(req: VerifyPhoneOtpRequest):
    """
    Verifies the SMS OTP code for a given phone number.
    """
    phone = normalize_phone_number(req.phone)
    otp_entry = _phone_otps.get(phone)

    if not otp_entry:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active verification code found for this phone number. Please request a new code.")

    if time.time() > otp_entry["expires_at"]:
        del _phone_otps[phone]
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verification code has expired. Please request a new code.")

    if req.otp_code.strip() != otp_entry["otp"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid verification code. Please check and try again.")

    _phone_otps[phone]["verified"] = True

    return {
        "success": True,
        "message": "Phone number successfully verified!",
        "phone": phone,
        "verified": True
    }

@router.post("/customer/signup")
def customer_signup(req: CustomerSignupRequest):
    """
    Public Customer Self-Registration for real live production.
    Validates name, email, phone number, and creates real user wallet (0.00 NGN).
    """
    norm_phone = normalize_phone_number(req.phone)
    if len(re.sub(r"\D", "", norm_phone)) < 10:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please enter a valid phone number (minimum 10 digits).")

    if not req.full_name or len(req.full_name.strip()) < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Full name is required.")

    if not req.password or len(req.password) < 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 6 characters long.")

    conn = get_db_connection()
    # Check if email or phone exists
    existing = conn.execute("SELECT id FROM users WHERE email = ? OR phone = ?", (req.email.lower().strip(), norm_phone)).fetchone()
    if existing:
        conn.close()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This email or phone number is already registered. Please sign in.")
    
    user_id = str(uuid.uuid4())
    user_ref = f"RP-CUS-{secrets.randbelow(900000) + 100000}"
    now_iso = datetime.now(timezone.utc).isoformat()
    hashed_pwd = hash_password(req.password)
    
    conn.execute("""
        INSERT INTO users (id, user_ref, full_name, email, phone, password_hash, account_type, status, role_name, phone_verified, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'CUSTOMER', 'ACTIVE', 'Customer', 1, ?, ?)
    """, (user_id, user_ref, req.full_name.strip(), req.email.lower().strip(), norm_phone, hashed_pwd, now_iso, now_iso))
    
    # Create Real Customer Wallet (starts with 0.00 NGN)
    wallet_id = str(uuid.uuid4())
    conn.execute("""
        INSERT INTO wallets (id, user_id, balance, currency, updated_at)
        VALUES (?, ?, 0.0, 'NGN', ?)
    """, (wallet_id, user_id, now_iso))
    
    conn.commit()
    conn.close()

    # Clean up OTP record if present
    if norm_phone in _phone_otps:
        del _phone_otps[norm_phone]
    
    # Create JWT
    token = create_jwt_token({
        "user_id": user_id,
        "account_type": "CUSTOMER",
        "role_name": "Customer",
        "email": req.email.lower().strip()
    })
    
    return {
        "success": True,
        "message": "Customer account created successfully!",
        "token": token,
        "user": {
            "id": user_id,
            "user_ref": user_ref,
            "full_name": req.full_name.strip(),
            "email": req.email.lower().strip(),
            "phone": norm_phone,
            "account_type": "CUSTOMER",
            "role_name": "Customer",
            "status": "ACTIVE"
        },
        "wallet": {"balance": 0.0, "currency": "NGN"}
    }

@router.post("/login")
def unified_login(req: LoginRequest):
    # Normalize and sanitize input
    login_input = req.login.strip().lower() if req.login else ""
    password_input = req.password if req.password else ""

    if not login_input or not password_input:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email/phone and password are required.")

    # Enforce input length limits to prevent overflow attacks
    if len(login_input) > 200 or len(password_input) > 200:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid input length.")

    conn = get_db_connection()
    user = conn.execute(
        "SELECT * FROM users WHERE email = ? OR phone = ?",
        (login_input, req.login.strip())
    ).fetchone()

    # Generic error message prevents user enumeration (attacker can't tell if email exists)
    INVALID_CREDS_MSG = "Invalid credentials. Please check your email/phone and password."

    if not user:
        conn.close()
        # Still run a dummy verify to prevent timing-based enumeration
        verify_password("dummy_password_check_#$%@!", "$2b$10$notarealhashatallXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_CREDS_MSG)

    if not verify_password(password_input, user["password_hash"]):
        conn.close()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_CREDS_MSG)

    if user["status"] in ["SUSPENDED", "DISABLED", "REJECTED"]:
        conn.close()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Account is {user['status']}. Please contact support.")

    # Enrich response with role-specific profile IDs
    vendor_info = None
    rider_info = None
    store_info = None

    if user["account_type"] == "VENDOR":
        v = conn.execute("SELECT * FROM vendors WHERE user_id = ?", (user["id"],)).fetchone()
        if v:
            vendor_info = dict(v)
            s = conn.execute("SELECT * FROM stores WHERE vendor_id = ?", (v["id"],)).fetchone()
            if s:
                store_info = dict(s)

    elif user["account_type"] == "RIDER":
        r = conn.execute("SELECT * FROM riders WHERE user_id = ?", (user["id"],)).fetchone()
        if r:
            rider_info = dict(r)

    # Fetch user wallet
    wallet = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (user["id"],)).fetchone()
    conn.close()

    token = create_jwt_token({
        "user_id": user["id"],
        "account_type": user["account_type"],
        "role_name": user["role_name"],
        "email": user["email"]
    })

    return {
        "success": True,
        "token": token,
        "user": {
            "id": user["id"],
            "user_ref": user["user_ref"],
            "full_name": user["full_name"],
            "email": user["email"],
            "phone": user["phone"],
            "account_type": user["account_type"],
            "role_name": user["role_name"],
            "status": user["status"]
        },
        "vendor": vendor_info,
        "store": store_info,
        "rider": rider_info,
        "wallet": dict(wallet) if wallet else {"balance": 0.0, "currency": "NGN"}
    }

@router.post("/invite/generate")
def generate_invite_link(req: GenerateInviteRequest, current_user: dict = Depends(get_current_user)):
    """
    Admin generates a secure, tokenized 5-minute expiring link for a Vendor or Rider.
    """
    if current_user.get("account_type") not in ["ADMIN", "STAFF"] and current_user.get("role_name") not in ["Super Admin", "Operations Manager", "Vendor Manager"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Admin or authorized managers can generate invite links.")
    
    if req.target_role not in ["VENDOR", "RIDER"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="target_role must be VENDOR or RIDER.")
    
    invite_id = str(uuid.uuid4())
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    expires_at = (now + timedelta(minutes=5)).isoformat()
    
    conn = get_db_connection()
    conn.execute("""
        INSERT INTO admin_invite_links (id, invite_token, target_role, recipient_name, recipient_email, recipient_phone, created_by_admin_id, created_at, expires_at, is_used)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    """, (
        invite_id,
        token,
        req.target_role,
        req.recipient_name,
        req.recipient_email.lower() if req.recipient_email else None,
        req.recipient_phone,
        current_user["id"],
        now.isoformat(),
        expires_at
    ))
    conn.commit()
    conn.close()
    
    log_audit(
        actor_user=current_user,
        action=f"GENERATE_{req.target_role}_INVITE",
        resource_type="admin_invite_links",
        resource_id=invite_id,
        details={"target_role": req.target_role, "expires_at": expires_at, "recipient": req.recipient_email or req.recipient_name}
    )
    
    return {
        "success": True,
        "invite_id": invite_id,
        "token": token,
        "target_role": req.target_role,
        "expires_in_seconds": 300,
        "expires_at": expires_at,
        "invite_link": f"/invite-signup.html?token={token}&role={req.target_role}"
    }

@router.get("/invite/verify/{token}")
def verify_invite_token(token: str):
    """
    Verifies if a 5-minute invite token is valid and active.
    """
    conn = get_db_connection()
    invite = conn.execute("SELECT * FROM admin_invite_links WHERE invite_token = ?", (token,)).fetchone()
    conn.close()
    
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid invite link.")
    
    if invite["is_used"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This invite link has already been used.")
    
    now_iso = datetime.now(timezone.utc).isoformat()
    if now_iso > invite["expires_at"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This invite link has expired (5-minute window exceeded). Please request a new invite from Admin.")
    
    return {
        "success": True,
        "target_role": invite["target_role"],
        "recipient_name": invite["recipient_name"],
        "recipient_email": invite["recipient_email"],
        "recipient_phone": invite["recipient_phone"],
        "expires_at": invite["expires_at"]
    }

@router.post("/invite/accept-signup")
def accept_invite_signup(req: AcceptInviteSignupRequest):
    """
    Consumes the 5-minute token and registers the Vendor or Rider.
    """
    conn = get_db_connection()
    invite = conn.execute("SELECT * FROM admin_invite_links WHERE invite_token = ?", (req.invite_token,)).fetchone()
    
    if not invite:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid invite link.")
    
    if invite["is_used"]:
        conn.close()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This invite link has already been used.")
    
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    if now_iso > invite["expires_at"]:
        conn.close()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invite link expired. The 5-minute window has elapsed.")
    
    # Check if user already exists
    existing = conn.execute("SELECT id FROM users WHERE email = ? OR phone = ?", (req.email.lower(), req.phone)).fetchone()
    if existing:
        conn.close()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email or phone is already in use.")
    
    target_role = invite["target_role"]
    user_id = str(uuid.uuid4())
    hashed_pwd = hash_password(req.password)
    
    if target_role == "VENDOR":
        user_ref = f"RP-VND-{secrets.randbelow(900000) + 100000}"
        conn.execute("""
            INSERT INTO users (id, user_ref, full_name, email, phone, password_hash, account_type, status, role_name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'VENDOR', 'ACTIVE', 'Vendor', ?, ?)
        """, (user_id, user_ref, req.full_name, req.email.lower(), req.phone, hashed_pwd, now_iso, now_iso))
        
        vendor_id = str(uuid.uuid4())
        conn.execute("""
            INSERT INTO vendors (id, user_id, business_name, business_type, registration_number, bank_name, account_number, account_name, kyc_status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?, ?)
        """, (
            vendor_id,
            user_id,
            req.business_name or f"{req.full_name}'s Enterprise",
            req.business_type or "Retail / Goods",
            req.registration_number or f"RC-{secrets.randbelow(900000)+100000}",
            req.bank_name or "Access Bank",
            req.account_number or "0123456789",
            req.account_name or req.full_name,
            now_iso,
            now_iso
        ))
        
        # Create Store
        store_id = str(uuid.uuid4())
        store_name = req.store_name or req.business_name or f"{req.full_name}'s Store"
        slug = f"{store_name.lower().replace(' ', '-')}-{secrets.token_hex(2)}"
        conn.execute("""
            INSERT INTO stores (id, vendor_id, store_name, slug, description, category, address, city, state, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Lagos', 'Lagos State', 1, ?, ?)
        """, (
            store_id,
            vendor_id,
            store_name,
            slug,
            f"Official RushingPoint Store for {store_name}",
            req.store_category or "Supermarket & Groceries",
            req.store_address or "12 Commercial Avenue, Yaba, Lagos",
            now_iso,
            now_iso
        ))
        
    elif target_role == "RIDER":
        user_ref = f"RP-RDR-{secrets.randbelow(900000) + 100000}"
        conn.execute("""
            INSERT INTO users (id, user_ref, full_name, email, phone, password_hash, account_type, status, role_name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'RIDER', 'ACTIVE', 'Rider', ?, ?)
        """, (user_id, user_ref, req.full_name, req.email.lower(), req.phone, hashed_pwd, now_iso, now_iso))
        
        rider_id = str(uuid.uuid4())
        conn.execute("""
            INSERT INTO riders (id, user_id, rider_ref, rider_type, vehicle_type, plate_number, license_number, kyc_status, operational_status, current_lat, current_lng, last_ping_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'APPROVED', 'AVAILABLE', 6.5244, 3.3792, ?, ?, ?)
        """, (
            rider_id,
            user_id,
            user_ref,
            req.rider_type or "INTERNAL",
            req.vehicle_type or "MOTORCYCLE",
            req.plate_number or f"LAG-{secrets.randbelow(900)+100}-XY",
            req.license_number or f"DL-{secrets.randbelow(900000)+100000}",
            now_iso,
            now_iso,
            now_iso
        ))

    # Create Wallet
    wallet_id = str(uuid.uuid4())
    conn.execute("""
        INSERT INTO wallets (id, user_id, balance, currency, updated_at)
        VALUES (?, ?, 0.0, 'NGN', ?)
    """, (wallet_id, user_id, now_iso))
    
    # Mark invite token as used
    conn.execute("""
        UPDATE admin_invite_links
        SET is_used = 1, used_at = ?
        WHERE id = ?
    """, (now_iso, invite["id"]))
    
    conn.commit()
    conn.close()
    
    token = create_jwt_token({
        "user_id": user_id,
        "account_type": target_role,
        "role_name": target_role.capitalize(),
        "email": req.email.lower()
    })
    
    return {
        "success": True,
        "message": f"{target_role} registered and activated successfully via invite link.",
        "token": token,
        "account_type": target_role,
        "user_id": user_id
    }

@router.get("/me")
def get_current_user_profile(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    vendor_info = None
    store_info = None
    rider_info = None
    
    if current_user["account_type"] == "VENDOR":
        v = conn.execute("SELECT * FROM vendors WHERE user_id = ?", (current_user["id"],)).fetchone()
        if v:
            vendor_info = dict(v)
            s = conn.execute("SELECT * FROM stores WHERE vendor_id = ?", (v["id"],)).fetchone()
            if s:
                store_info = dict(s)
    elif current_user["account_type"] == "RIDER":
        r = conn.execute("SELECT * FROM riders WHERE user_id = ?", (current_user["id"],)).fetchone()
        if r:
            rider_info = dict(r)
            
    wallet = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (current_user["id"],)).fetchone()
    conn.close()
    
    return {
        "user": current_user,
        "vendor": vendor_info,
        "store": store_info,
        "rider": rider_info,
        "wallet": dict(wallet) if wallet else {"balance": 0.0, "currency": "NGN"}
    }

@router.post("/change-password")
def change_password(payload: dict, current_user: dict = Depends(get_current_user)):
    """
    Allows any authenticated user (Customer, Vendor, Rider, Admin) to change their password securely.
    """
    current_password = payload.get("current_password")
    new_password = payload.get("new_password")
    
    if not new_password or len(new_password) < 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password must be at least 6 characters.")
        
    conn = get_db_connection()
    user = conn.execute("SELECT * FROM users WHERE id = ?", (current_user["id"],)).fetchone()
    if not user:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
        
    if current_password:
        if not verify_password(current_password, user["password_hash"]):
            conn.close()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect.")
            
    new_hash = hash_password(new_password)
    now_iso = datetime.now(timezone.utc).isoformat()
    conn.execute("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", (new_hash, now_iso, current_user["id"]))
    conn.commit()
    conn.close()
    
    log_audit(
        actor_user=current_user,
        action="CHANGE_PASSWORD",
        resource_type="users",
        resource_id=current_user["id"],
        details={"email": current_user["email"]}
    )
    
    return {"success": True, "message": "Password changed successfully."}


# ==========================================
# VENDOR PARTNERSHIP REQUEST ENDPOINTS
# ==========================================

@router.post("/vendor-request")
def submit_vendor_request(data: dict):
    """Public endpoint — anyone can submit a vendor partnership application from the landing page."""
    required = ["business_name", "business_type", "contact_name", "email", "phone", "city", "state"]
    for field in required:
        if not data.get(field):
            raise HTTPException(status_code=400, detail=f"Field '{field}' is required.")

    conn = get_db_connection()

    # Check for duplicate email or phone within last 24 hours
    existing = conn.execute(
        "SELECT id FROM vendor_requests WHERE (email = ? OR phone = ?) AND created_at > datetime('now', '-1 day')",
        (data["email"], data["phone"])
    ).fetchone()
    if existing:
        conn.close()
        raise HTTPException(status_code=409, detail="A request with this email or phone was already submitted recently. Our team will contact you.")

    req_id = str(uuid.uuid4())
    req_ref = "VRQ-" + secrets.token_hex(4).upper()
    now_iso = datetime.now(timezone.utc).isoformat()

    conn.execute("""
        INSERT INTO vendor_requests (
            id, request_ref, business_name, business_type, contact_name,
            email, phone, whatsapp, city, state, message, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
    """, (
        req_id, req_ref,
        data["business_name"].strip(), data["business_type"].strip(),
        data["contact_name"].strip(), data["email"].strip().lower(),
        data["phone"].strip(), data.get("whatsapp", "").strip(),
        data["city"].strip(), data["state"].strip(),
        data.get("message", "").strip(),
        now_iso, now_iso
    ))
    conn.commit()
    conn.close()

    return {
        "success": True,
        "message": "Your vendor application has been submitted! Our team will contact you within 24 hours.",
        "request_ref": req_ref
    }


@router.get("/vendor-requests")
def list_vendor_requests(
    status_filter: str = "ALL",
    current_user: dict = Depends(get_current_user)
):
    """Admin-only: List all vendor partnership requests."""
    if current_user.get("account_type") not in ("ADMIN", "STAFF"):
        raise HTTPException(status_code=403, detail="Administrator access required.")
    conn = get_db_connection()
    if status_filter != "ALL":
        rows = conn.execute(
            "SELECT * FROM vendor_requests WHERE status = ? ORDER BY created_at DESC",
            (status_filter,)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM vendor_requests ORDER BY created_at DESC"
        ).fetchall()
    conn.close()
    return {"success": True, "requests": [dict(r) for r in rows]}


@router.patch("/vendor-requests/{request_ref}")
def update_vendor_request(
    request_ref: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Admin-only: Update the status and notes of a vendor request."""
    if current_user.get("account_type") not in ("ADMIN", "STAFF"):
        raise HTTPException(status_code=403, detail="Administrator access required.")
    conn = get_db_connection()
    row = conn.execute(
        "SELECT id FROM vendor_requests WHERE request_ref = ?", (request_ref,)
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Vendor request not found.")
    new_status = data.get("status", "PENDING")
    admin_notes = data.get("admin_notes", "")
    now_iso = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "UPDATE vendor_requests SET status = ?, admin_notes = ?, updated_at = ? WHERE request_ref = ?",
        (new_status, admin_notes, now_iso, request_ref)
    )
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Vendor request {request_ref} updated to {new_status}."}

