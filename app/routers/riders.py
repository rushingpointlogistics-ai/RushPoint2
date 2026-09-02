from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, status
from app.database import get_db_connection
from app.security import get_current_user, require_role, log_audit

router = APIRouter(prefix="/api/riders", tags=["Rider Fleet & Telemetry"])

@router.get("/")
def list_riders(
    operational_status: str = None, 
    rider_type: str = None,
    current_user: dict = Depends(require_role(["ADMIN", "STAFF", "Super Admin", "Operations Manager", "Dispatcher"]))
):
    conn = get_db_connection()
    query = """
        SELECT r.*, u.full_name, u.email, u.phone, u.status as account_status
        FROM riders r
        JOIN users u ON r.user_id = u.id
        WHERE 1=1
    """
    params = []
    if operational_status:
        query += " AND r.operational_status = ?"
        params.append(operational_status)
    if rider_type:
        query += " AND r.rider_type = ?"
        params.append(rider_type)
        
    query += " ORDER BY r.rating DESC, r.total_deliveries DESC"
    riders = conn.execute(query, tuple(params)).fetchall()
    conn.close()
    
    return {"riders": [dict(r) for r in riders]}

@router.get("/profile")
def get_rider_profile(current_user: dict = Depends(get_current_user)):
    if current_user["account_type"] != "RIDER":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only riders can access this endpoint.")
        
    conn = get_db_connection()
    rider = conn.execute("SELECT * FROM riders WHERE user_id = ?", (current_user["id"],)).fetchone()
    if not rider:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rider record not found.")
        
    # Get active delivery if any
    active_order = conn.execute("""
        SELECT o.*, s.store_name, s.address as store_address, s.latitude as store_lat, s.longitude as store_lng,
               u.full_name as customer_name
        FROM orders o
        JOIN stores s ON o.store_id = s.id
        JOIN users u ON o.customer_id = u.id
        WHERE o.rider_id = ? AND o.status IN ('ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED')
        LIMIT 1
    """, (rider["id"],)).fetchone()
    
    wallet = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (current_user["id"],)).fetchone()
    conn.close()
    
    return {
        "rider": dict(rider),
        "active_order": dict(active_order) if active_order else None,
        "wallet": dict(wallet) if wallet else {"balance": 0.0, "currency": "NGN"}
    }

@router.post("/status-toggle")
def toggle_rider_operational_status(payload: dict, current_user: dict = Depends(get_current_user)):
    """
    Rider toggles between AVAILABLE and OFFLINE.
    """
    new_status = payload.get("status") # AVAILABLE, OFFLINE, APPROACHING_PICKUP, ON_DELIVERY, DELAYED_PROBLEM
    if new_status not in ["AVAILABLE", "OFFLINE", "APPROACHING_PICKUP", "ON_DELIVERY", "DELAYED_PROBLEM"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid operational status.")
        
    conn = get_db_connection()
    rider = conn.execute("SELECT * FROM riders WHERE user_id = ?", (current_user["id"],)).fetchone()
    if not rider:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rider record not found.")
        
    now_iso = datetime.now(timezone.utc).isoformat()
    conn.execute("UPDATE riders SET operational_status = ?, updated_at = ? WHERE id = ?", (new_status, now_iso, rider["id"]))
    conn.commit()
    conn.close()
    
    return {"success": True, "operational_status": new_status}

@router.post("/telemetry")
def update_rider_telemetry(payload: dict, current_user: dict = Depends(get_current_user)):
    """
    Rider mobile app updates GPS coordinates and timestamp.
    """
    lat = payload.get("lat")
    lng = payload.get("lng")
    
    if lat is None or lng is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="lat and lng are required.")
        
    conn = get_db_connection()
    rider = conn.execute("SELECT * FROM riders WHERE user_id = ?", (current_user["id"],)).fetchone()
    if not rider:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rider record not found.")
        
    now_iso = datetime.now(timezone.utc).isoformat()
    conn.execute("""
        UPDATE riders
        SET current_lat = ?, current_lng = ?, last_ping_at = ?, updated_at = ?
        WHERE id = ?
    """, (lat, lng, now_iso, now_iso, rider["id"]))
    conn.commit()
    conn.close()
    
    return {"success": True, "lat": lat, "lng": lng, "pinged_at": now_iso}

@router.get("/live-map")
def get_live_map_feed(current_user: dict = Depends(require_role(["ADMIN", "STAFF", "Super Admin", "Operations Manager", "Dispatcher"]))):
    """
    Live Operations Map data feed for Admin Dispatch Console (Requirements 32 & 33).
    Returns all riders with real-time GPS coordinates, vehicle type, and active delivery.
    """
    conn = get_db_connection()
    riders = conn.execute("""
        SELECT r.*, u.full_name, u.phone,
               o.id as active_order_id, o.order_ref, o.status as order_status,
               o.delivery_address, s.store_name, s.address as pickup_address
        FROM riders r
        JOIN users u ON r.user_id = u.id
        LEFT JOIN orders o ON o.rider_id = r.id AND o.status IN ('ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED')
        LEFT JOIN stores s ON o.store_id = s.id
        ORDER BY r.operational_status ASC
    """).fetchall()
    conn.close()
    
    return {"riders": [dict(r) for r in riders]}

@router.post("/kyc/documents")
def update_rider_kyc_documents(payload: dict, current_user: dict = Depends(get_current_user)):
    """
    Rider uploads driver's license, national ID, or profile photo.
    """
    conn = get_db_connection()
    rider = conn.execute("SELECT id FROM riders WHERE user_id = ?", (current_user["id"],)).fetchone()
    if not rider:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rider record not found.")
        
    now_iso = datetime.now(timezone.utc).isoformat()
    license_url = payload.get("driver_license_url")
    id_url = payload.get("national_id_url")
    photo_url = payload.get("profile_photo_url")
    
    conn.execute("""
        UPDATE riders
        SET driver_license_url = COALESCE(?, driver_license_url),
            national_id_url = COALESCE(?, national_id_url),
            profile_photo_url = COALESCE(?, profile_photo_url),
            updated_at = ?
        WHERE id = ?
    """, (license_url, id_url, photo_url, now_iso, rider["id"]))
    
    conn.commit()
    conn.close()
    
    return {"success": True, "message": "Rider KYC documents updated."}

@router.post("/{rider_id}/admin-status")
def update_rider_status_by_admin(rider_id: str, payload: dict, current_user: dict = Depends(require_role(["ADMIN", "Super Admin", "Operations Manager"]))):
    """
    Admin approves, suspends, activates, or rejects a rider.
    """
    kyc_status = payload.get("kyc_status") # APPROVED, PENDING, REJECTED, SUSPENDED
    conn = get_db_connection()
    rider = conn.execute("SELECT id, user_id FROM riders WHERE id = ?", (rider_id,)).fetchone()
    if not rider:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rider not found.")
        
    now_iso = datetime.now(timezone.utc).isoformat()
    conn.execute("UPDATE riders SET kyc_status = ?, updated_at = ? WHERE id = ?", (kyc_status, now_iso, rider_id))
    
    user_status = "ACTIVE" if kyc_status == "APPROVED" else ("SUSPENDED" if kyc_status == "SUSPENDED" else "PENDING")
    conn.execute("UPDATE users SET status = ?, updated_at = ? WHERE id = ?", (user_status, now_iso, rider["user_id"]))
    
    conn.commit()
    conn.close()
    
    log_audit(
        actor_user=current_user,
        action=f"RIDER_STATUS_{kyc_status}",
        resource_type="riders",
        resource_id=rider_id,
        details={"kyc_status": kyc_status}
    )
    
    return {"success": True, "message": f"Rider status updated to {kyc_status}."}


@router.get("/active-mission")
def get_active_mission(current_user: dict = Depends(get_current_user)):
    """
    Rider mobile endpoint to retrieve active dispatch mission.
    """
    conn = get_db_connection()
    rider = conn.execute("SELECT id FROM riders WHERE user_id = ?", (current_user["id"],)).fetchone()
    if not rider:
        conn.close()
        return {"mission": None}

    order = conn.execute("""
        SELECT o.id as order_id, o.order_ref, o.status, o.delivery_address, o.delivery_phone as customer_phone,
               o.total_amount, o.delivery_fee, o.pod_otp,
               s.store_name, s.address as store_address, s.latitude as store_lat, s.longitude as store_lon,
               ROUND(COALESCE(o.delivery_fee * 0.80, 800.0), 2) as rider_fee
        FROM orders o
        JOIN stores s ON o.store_id = s.id
        WHERE o.rider_id = ? AND o.status IN ('ASSIGNED', 'PREPARING', 'READY_FOR_PICKUP', 'DISPATCHED', 'PICKED_UP', 'IN_TRANSIT')
        ORDER BY o.created_at DESC LIMIT 1
    """, (rider["id"],)).fetchone()

    conn.close()
    return {"mission": dict(order) if order else None}


@router.get("/delivery-history")
def get_delivery_history(current_user: dict = Depends(get_current_user)):
    """
    Rider mobile endpoint for completed delivery missions.
    """
    conn = get_db_connection()
    rider = conn.execute("SELECT id FROM riders WHERE user_id = ?", (current_user["id"],)).fetchone()
    if not rider:
        conn.close()
        return {"deliveries": []}

    deliveries = conn.execute("""
        SELECT o.id, o.order_ref, o.delivery_address, o.status, o.total_amount,
               ROUND(COALESCE(o.delivery_fee * 0.80, 800.0), 2) as rider_fee,
               o.updated_at as completed_at
        FROM orders o
        WHERE o.rider_id = ? AND o.status = 'DELIVERED'
        ORDER BY o.updated_at DESC LIMIT 20
    """, (rider["id"],)).fetchall()

    conn.close()
    return {"deliveries": [dict(d) for d in deliveries]}


@router.post("/update-mission/{order_id}")
def update_mission_status(order_id: str, payload: dict, current_user: dict = Depends(get_current_user)):
    """
    Rider updates mission status (DISPATCHED, PICKED_UP, IN_TRANSIT).
    """
    new_status = payload.get("status", "DISPATCHED")
    conn = get_db_connection()
    now_iso = datetime.now(timezone.utc).isoformat()
    conn.execute("UPDATE orders SET status = ?, updated_at = ? WHERE id = ? OR order_ref = ?", (new_status, now_iso, order_id, order_id))
    conn.commit()
    conn.close()
    return {"success": True, "status": new_status}


@router.post("/confirm-delivery")
def confirm_delivery_with_otp(payload: dict, current_user: dict = Depends(get_current_user)):
    """
    Rider enters Customer's 4-digit Delivery PIN (POD OTP) to complete mission, release escrow funds, and credit wallets.
    """
    order_id = payload.get("order_id")
    pod_otp = payload.get("pod_otp")

    if not order_id or not pod_otp:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="order_id and pod_otp required.")

    conn = get_db_connection()
    rider = conn.execute("SELECT id FROM riders WHERE user_id = ?", (current_user["id"],)).fetchone()
    order = conn.execute("SELECT * FROM orders WHERE (id = ? OR order_ref = ?)", (order_id, order_id)).fetchone()

    if not order:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")

    if str(order["pod_otp"]).strip() != str(pod_otp).strip():
        conn.close()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid 4-digit Delivery PIN.")

    now_iso = datetime.now(timezone.utc).isoformat()

    # Calculate earnings
    delivery_fee = float(order["delivery_fee"] or 1000.0)
    subtotal = float(order["subtotal_amount"] or 0.0)
    rider_earning = round(delivery_fee * 0.80, 2)
    vendor_earning = subtotal # 100% of product price to vendor

    # 1. Update order status
    conn.execute("UPDATE orders SET status = 'DELIVERED', payment_status = 'SETTLED', updated_at = ? WHERE id = ?", (now_iso, order["id"]))

    # 2. Credit Rider Wallet
    rider_wallet = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (current_user["id"],)).fetchone()
    if rider_wallet:
        new_bal = rider_wallet["balance"] + rider_earning
        conn.execute("UPDATE wallets SET balance = ?, updated_at = ? WHERE id = ?", (new_bal, now_iso, rider_wallet["id"]))
        conn.execute("""
            INSERT INTO wallet_transactions (id, wallet_id, user_id, reference, type, amount, description, running_balance, created_at)
            VALUES (?, ?, ?, ?, 'CREDIT', ?, 'Rider Delivery Payout (80% Split)', ?, ?)
        """, (str(uuid.uuid4()), rider_wallet["id"], current_user["id"], f"RP-RDR-{order['order_ref']}", rider_earning, new_bal, now_iso))

    # 3. Credit Vendor Wallet
    vendor_row = conn.execute("SELECT v.user_id FROM vendors v JOIN stores s ON s.vendor_id = v.id WHERE s.id = ?", (order["store_id"],)).fetchone()
    if vendor_row:
        v_wallet = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (vendor_row["user_id"],)).fetchone()
        if v_wallet:
            new_v_bal = v_wallet["balance"] + vendor_earning
            conn.execute("UPDATE wallets SET balance = ?, updated_at = ? WHERE id = ?", (new_v_bal, now_iso, v_wallet["id"]))
            conn.execute("""
                INSERT INTO wallet_transactions (id, wallet_id, user_id, reference, type, amount, description, running_balance, created_at)
                VALUES (?, ?, ?, ?, 'CREDIT', ?, 'Vendor Product Sales Settlement', ?, ?)
            """, (str(uuid.uuid4()), v_wallet["id"], vendor_row["user_id"], f"RP-VND-{order['order_ref']}", vendor_earning, new_v_bal, now_iso))

    conn.commit()
    conn.close()

    return {
        "success": True,
        "message": "Delivery verified successfully! Escrow released.",
        "rider_earning": rider_earning,
        "status": "DELIVERED"
    }


@router.post("/update-status")
def update_operational_status(payload: dict, current_user: dict = Depends(get_current_user)):
    """
    Rider toggles operational status (AVAILABLE / OFFLINE).
    """
    status_val = payload.get("operational_status", "AVAILABLE")
    conn = get_db_connection()
    now_iso = datetime.now(timezone.utc).isoformat()
    conn.execute("UPDATE riders SET operational_status = ?, updated_at = ? WHERE user_id = ?", (status_val, now_iso, current_user["id"]))
    conn.commit()
    conn.close()
    return {"success": True, "operational_status": status_val}
