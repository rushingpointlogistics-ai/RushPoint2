import uuid
import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, status
from app.database import get_db_connection
from app.security import get_current_user
from app.models import LogisticsQuoteRequest

router = APIRouter(prefix="/api/logistics", tags=["Independent Logistics & Parcel Booking"])

@router.post("/quote")
def calculate_logistics_quote(req: LogisticsQuoteRequest):
    """
    Calculates instant quotes for external customer parcel delivery.
    """
    # Size multiplier
    multipliers = {
        "SMALL": 1.0,      # Documents, small phones
        "MEDIUM": 1.3,     # Clothes, electronics, shoes
        "LARGE": 1.8,      # Small appliances, bulk cartons
        "HEAVY": 2.5       # Machinery, furniture, heavy crates
    }
    multiplier = multipliers.get(req.package_size.upper(), 1.2)
    
    # Real OSRM Road Distance Calculation
    from app.services.routing_service import geocode_address, calculate_road_distance_and_fee
    p_loc = geocode_address(req.pickup_address or "Katsina Central Commercial Market")
    d_loc = geocode_address(req.dropoff_address or "Katsina City Gate")
    
    route_calc = calculate_road_distance_and_fee(
        origin_lat=p_loc["latitude"],
        origin_lon=p_loc["longitude"],
        dest_lat=d_loc["latitude"],
        dest_lon=d_loc["longitude"],
        cargo_weight_kg=2.0 if req.package_size == "SMALL" else (10.0 if req.package_size == "MEDIUM" else 25.0),
        vehicle_type="TRICYCLE" if req.package_size in ["LARGE", "HEAVY"] else "MOTORCYCLE"
    )
    
    estimated_distance_km = route_calc["distance_km"]
    base_fare = route_calc["pricing"]["base_fee"]
    per_km_rate = route_calc["pricing"]["per_km_rate"]
    estimated_total = round(route_calc["pricing"]["total_delivery_fee"] * multiplier, 2)
    
    return {
        "pickup_address": p_loc["formatted_address"],
        "dropoff_address": d_loc["formatted_address"],
        "package_size": req.package_size,
        "estimated_distance_km": estimated_distance_km,
        "distance_metres": route_calc["distance_metres"],
        "base_fare": base_fare,
        "per_km_rate": per_km_rate,
        "estimated_price": estimated_total,
        "estimated_time_mins": route_calc["estimated_duration_minutes"],
        "routing_engine": route_calc["engine"]
    }

@router.post("/book")
def book_independent_logistics(req: LogisticsQuoteRequest, current_user: dict = Depends(get_current_user)):
    """
    Books an independent parcel dispatch, reserves payment, and places into the dispatch queue.
    """
    multipliers = {"SMALL": 1.0, "MEDIUM": 1.3, "LARGE": 1.8, "HEAVY": 2.5}
    multiplier = multipliers.get(req.package_size.upper(), 1.2)
    
    from app.services.routing_service import geocode_address, calculate_road_distance_and_fee
    p_loc = geocode_address(req.pickup_address or "Katsina Central Commercial Market")
    d_loc = geocode_address(req.dropoff_address or "Katsina City Gate")
    
    route_calc = calculate_road_distance_and_fee(
        origin_lat=p_loc["latitude"],
        origin_lon=p_loc["longitude"],
        dest_lat=d_loc["latitude"],
        dest_lon=d_loc["longitude"],
        cargo_weight_kg=2.0 if req.package_size == "SMALL" else (10.0 if req.package_size == "MEDIUM" else 25.0),
        vehicle_type="TRICYCLE" if req.package_size in ["LARGE", "HEAVY"] else "MOTORCYCLE"
    )
    estimated_distance_km = route_calc["distance_km"]
    estimated_total = round(route_calc["pricing"]["total_delivery_fee"] * multiplier, 2)
    
    conn = get_db_connection()
    wallet = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (current_user["id"],)).fetchone()
    if not wallet or wallet["balance"] < estimated_total:
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient wallet balance. Required: ₦{estimated_total:,.2f}, Available: ₦{wallet['balance'] if wallet else 0.0:,.2f}."
        )
        
    req_id = str(uuid.uuid4())
    req_ref = f"RP-LOG-{secrets.randbelow(900000) + 100000}"
    now_iso = datetime.now(timezone.utc).isoformat()
    
    # 1. Deduct wallet
    new_bal = wallet["balance"] - estimated_total
    conn.execute("UPDATE wallets SET balance = ?, updated_at = ? WHERE id = ?", (new_bal, now_iso, wallet["id"]))
    conn.execute("""
        INSERT INTO wallet_transactions (id, wallet_id, user_id, reference, type, amount, description, running_balance, created_at)
        VALUES (?, ?, ?, ?, 'DEBIT', ?, ?, ?, ?)
    """, (str(uuid.uuid4()), wallet["id"], current_user["id"], f"RP-TXN-LOG-{req_ref}", estimated_total, f"Logistics Booking {req_ref}", new_bal, now_iso))
    
    # 2. Insert Logistics Request
    conn.execute("""
        INSERT INTO logistics_requests (id, request_ref, customer_id, item_description, package_size, pickup_address, pickup_contact, dropoff_address, dropoff_contact, distance_km, estimated_price, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PAID', ?, ?)
    """, (
        req_id,
        req_ref,
        current_user["id"],
        req.item_description,
        req.package_size,
        req.pickup_address,
        req.pickup_contact,
        req.dropoff_address,
        req.dropoff_contact,
        estimated_distance_km,
        estimated_total,
        now_iso,
        now_iso
    ))
    
    conn.commit()
    conn.close()
    
    return {
        "success": True,
        "message": "Independent logistics dispatch requested successfully!",
        "request_id": req_id,
        "request_ref": req_ref,
        "amount_paid": estimated_total,
        "status": "PAID"
    }

@router.get("/")
def list_logistics_requests(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    if current_user["account_type"] == "CUSTOMER":
        rows = conn.execute("SELECT * FROM logistics_requests WHERE customer_id = ? ORDER BY created_at DESC", (current_user["id"],)).fetchall()
    else:
        rows = conn.execute("""
            SELECT l.*, u.full_name as customer_name, u.phone as customer_phone, u_rid.full_name as rider_name
            FROM logistics_requests l
            JOIN users u ON l.customer_id = u.id
            LEFT JOIN riders r ON l.rider_id = r.id
            LEFT JOIN users u_rid ON r.user_id = u_rid.id
            ORDER BY l.created_at DESC
        """).fetchall()
        
    conn.close()
    return {"requests": [dict(r) for r in rows]}

# ----------------- PROOF OF PICKUP (Requirement 28) -----------------
@router.post("/{request_id}/verify-pickup")
def verify_logistics_pickup(request_id: str, payload: dict, current_user: dict = Depends(get_current_user)):
    """
    Rider verifies pickup from sender using 4-digit pickup OTP and optional photo.
    """
    entered_otp = str(payload.get("otp", "")).strip()
    photo_url = payload.get("photo_url", "")
    notes = payload.get("notes", "")
    
    conn = get_db_connection()
    log_req = conn.execute("SELECT * FROM logistics_requests WHERE id = ?", (request_id,)).fetchone()
    if not log_req:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Logistics request not found.")
        
    if log_req["pickup_otp"] and entered_otp != log_req["pickup_otp"]:
        conn.close()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Pickup OTP code.")
        
    now_iso = datetime.now(timezone.utc).isoformat()
    conn.execute("""
        UPDATE logistics_requests
        SET status = 'PICKED_UP',
            pickup_photo_url = ?,
            pickup_notes = ?,
            pickup_completed_at = ?,
            updated_at = ?
        WHERE id = ?
    """, (photo_url, notes, now_iso, now_iso, request_id))
    
    conn.commit()
    conn.close()
    
    return {"success": True, "message": "Proof of Pickup verified! Package is now in transit."}

# ----------------- ADMIN RIDER PAY TIMING TOGGLE (Requirement 29) -----------------
@router.post("/{request_id}/payout-timing")
def toggle_rider_payout_timing(request_id: str, payload: dict, current_user: dict = Depends(get_current_user)):
    """
    Admin controls whether rider is paid before or after delivery for this logistics parcel.
    """
    pay_before = 1 if payload.get("pay_before", False) else 0
    conn = get_db_connection()
    conn.execute("UPDATE logistics_requests SET pay_rider_before_delivery = ? WHERE id = ?", (pay_before, request_id))
    conn.commit()
    conn.close()
    return {"success": True, "pay_rider_before_delivery": pay_before, "message": "Payout timing policy updated."}

@router.post("/pay-waybill/{req_ref}")
def pay_waybill_invoice(req_ref: str, payload: dict = {}):
    """
    Public checkout endpoint for customers paying a generated waybill transport invoice.
    """
    conn = get_db_connection()
    req = conn.execute("SELECT * FROM logistics_requests WHERE request_ref = ?", (req_ref,)).fetchone()
    if not req:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Waybill invoice not found.")
        
    now_iso = datetime.now(timezone.utc).isoformat()
    payment_method = payload.get("payment_method", "FLUTTERWAVE_TRANSFER")
    
    conn.execute("UPDATE logistics_requests SET status = 'PAID', updated_at = ? WHERE id = ?", (now_iso, req["id"]))
    
    # Credit admin escrow wallet with transport fee
    admin_user = conn.execute("SELECT id FROM users WHERE account_type = 'ADMIN' LIMIT 1").fetchone()
    if admin_user:
        adm_wallet = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (admin_user["id"],)).fetchone()
        if adm_wallet:
            fee = req["estimated_price"] or 0.0
            new_bal = adm_wallet["balance"] + fee
            conn.execute("UPDATE wallets SET balance = ?, updated_at = ? WHERE id = ?", (new_bal, now_iso, adm_wallet["id"]))
            conn.execute("""
                INSERT INTO wallet_transactions (id, wallet_id, user_id, reference, type, amount, description, running_balance, created_at)
                VALUES (?, ?, ?, ?, 'CREDIT', ?, ?, ?, ?)
            """, (str(uuid.uuid4()), adm_wallet["id"], admin_user["id"], f"RP-TXN-WB-PAY-{req['request_ref']}", fee, f"Payment for Waybill Transport {req['request_ref']} ({payment_method})", new_bal, now_iso))
            
    conn.commit()
    conn.close()
    
    return {
        "success": True,
        "message": f"Waybill invoice {req['request_ref']} paid successfully via {payment_method}!",
        "status": "PAID",
        "amount": req["estimated_price"]
    }
