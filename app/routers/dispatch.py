import math
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, status
from app.database import get_db_connection
from app.security import get_current_user, require_role, log_audit

router = APIRouter(prefix="/api/dispatch", tags=["Dispatch & Rider Recommendation Engine"])

def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0 # Earth radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 2)

@router.get("/recommendations/{order_id}")
def recommend_riders_for_order(order_id: str, current_user: dict = Depends(require_role(["ADMIN", "STAFF", "Super Admin", "Operations Manager", "Dispatcher"]))):
    """
    Intelligent dispatch algorithm scoring riders based on:
    1. Direct proximity / Haversine distance to pickup vendor store
    2. Operational status (AVAILABLE scored highest)
    3. Cargo Weight & Vehicle Suitability:
       - Heavy/Bulky goods (cement, blocks, steel, hectares) -> TRICYCLE (Keke Cargo) / VAN given top priority.
       - Minor/Standard goods -> MOTORCYCLE / TRICYCLE.
    4. Driver rating and trip experience
    """
    conn = get_db_connection()
    ord_row = conn.execute("SELECT o.*, s.latitude as store_lat, s.longitude as store_lng, s.store_name FROM orders o JOIN stores s ON o.store_id = s.id WHERE o.id = ?", (order_id,)).fetchone()
    if not ord_row:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")
        
    store_lat = ord_row["store_lat"] or 6.5244
    store_lng = ord_row["store_lng"] or 3.3792
    
    # Check order items to detect heavy/bulky cargo
    items = conn.execute("SELECT * FROM order_items WHERE order_id = ?", (order_id,)).fetchall()
    heavy_keywords = ["cement", "block", "blocks", "steel", "rod", "iron", "sandcrete", "hectare", "land", "ton", "tonne", "generator", "machinery"]
    
    is_heavy_cargo = False
    total_items_count = 0
    for it in items:
        p_name = (it["product_name"] or "").lower()
        qty = it["quantity"] or 1
        total_items_count += qty
        if any(k in p_name for k in heavy_keywords):
            is_heavy_cargo = True
            
    if ord_row["delivery_fee"] and ord_row["delivery_fee"] >= 2500.0:
        is_heavy_cargo = True
        
    required_vehicle = "TRICYCLE (Cargo Keke / Van)" if is_heavy_cargo else "MOTORCYCLE / TRICYCLE"
    
    # Fetch active riders (both online and offline feature-phone riders who can be called by Admin)
    riders = conn.execute("""
        SELECT r.*, u.full_name, u.phone
        FROM riders r
        JOIN users u ON r.user_id = u.id
        WHERE u.status = 'ACTIVE'
    """).fetchall()
    conn.close()
    
    scored_riders = []
    for r in riders:
        r_lat = r["current_lat"] or 6.5244
        r_lng = r["current_lng"] or 3.3792
        dist_km = calculate_haversine_distance(store_lat, store_lng, r_lat, r_lng)
        vtype = (r["vehicle_type"] or "MOTORCYCLE").upper()
        op_status = r["operational_status"] or "OFFLINE"
        
        # 1. Proximity score (0 - 45)
        dist_score = max(0, 45 - (dist_km * 3.5))
        
        # 2. Availability score (0 - 25)
        if op_status == "AVAILABLE":
            status_score = 25
            status_label = "AVAILABLE"
        elif op_status == "ON_DELIVERY":
            status_score = 8
            status_label = "ON_DELIVERY"
        else:
            status_score = 12 # Offline feature phone rider can be called directly
            status_label = "OFFLINE (Call to Dispatch)"
        
        # 3. Rating score (0 - 15)
        rating_score = min(15, (r["rating"] or 5.0) * 3)
        
        # 4. Vehicle Suitability Score (0 - 25)
        vehicle_score = 0
        suitability_warning = ""
        is_tricycle_or_van = vtype in ["TRICYCLE", "CARGO_TRICYCLE", "KEKE", "VAN", "CAR"]
        
        if is_heavy_cargo:
            if is_tricycle_or_van:
                vehicle_score = 25 # Perfect match for heavy cargo
            else:
                vehicle_score = -20 # Motorcycle penalty for heavy materials
                suitability_warning = "⚠️ Motorcycle cannot carry heavy construction/bulk materials safely (Tricycle Required)"
        else:
            if vtype == "MOTORCYCLE":
                vehicle_score = 20 # Agile bike for light fast delivery
            else:
                vehicle_score = 15 # Tricycle can also carry standard goods
                
        total_score = max(5.0, round(dist_score + status_score + rating_score + vehicle_score, 1))
        
        scored_riders.append({
            "rider_id": r["id"],
            "rider_ref": r["rider_ref"],
            "full_name": r["full_name"],
            "phone": r["phone"],
            "rider_type": r["rider_type"],
            "vehicle_type": r["vehicle_type"],
            "plate_number": r["plate_number"],
            "operational_status": op_status,
            "status_label": status_label,
            "is_offline": op_status == "OFFLINE",
            "distance_km": dist_km,
            "rating": r["rating"],
            "total_deliveries": r["total_deliveries"],
            "recommendation_score": total_score,
            "suitability_warning": suitability_warning,
            "is_best_match": False
        })
        
    # Sort descending by score
    scored_riders.sort(key=lambda x: x["recommendation_score"], reverse=True)
    if scored_riders:
        scored_riders[0]["is_best_match"] = True
        
    return {
        "order_id": order_id,
        "order_ref": ord_row["order_ref"],
        "store_name": ord_row["store_name"],
        "is_heavy_cargo": is_heavy_cargo,
        "required_vehicle": required_vehicle,
        "recommendations": scored_riders
    }

@router.post("/assign")
def assign_rider_to_order(payload: dict, current_user: dict = Depends(require_role(["ADMIN", "STAFF", "Super Admin", "Operations Manager", "Dispatcher"]))):
    order_id = payload.get("order_id")
    rider_id = payload.get("rider_id")
    notes = payload.get("notes", "Assigned via Dispatch Control")
    
    if not order_id or not rider_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="order_id and rider_id are required.")
        
    conn = get_db_connection()
    ord_row = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    rider_row = conn.execute("SELECT r.*, u.full_name FROM riders r JOIN users u ON r.user_id = u.id WHERE r.id = ?", (rider_id,)).fetchone()
    
    if not ord_row:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")
    if not rider_row:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rider not found.")
        
    now_iso = datetime.now(timezone.utc).isoformat()
    
    # Check if there is an existing assigned rider being reassigned
    prev_rider_id = ord_row["rider_id"]
    is_reassignment = bool(prev_rider_id and prev_rider_id != rider_id)
    
    if is_reassignment:
        # Free the previous rider back to AVAILABLE status
        conn.execute("""
            UPDATE riders
            SET operational_status = 'AVAILABLE',
                updated_at = ?
            WHERE id = ?
        """, (now_iso, prev_rider_id))
    
    # 1. Update Order with new rider and status ASSIGNED
    conn.execute("""
        UPDATE orders
        SET rider_id = ?,
            status = 'ASSIGNED',
            updated_at = ?
        WHERE id = ?
    """, (rider_id, now_iso, order_id))
    
    # 2. Update Rider status to ON_DELIVERY
    conn.execute("""
        UPDATE riders
        SET operational_status = 'ON_DELIVERY',
            updated_at = ?
        WHERE id = ?
    """, (now_iso, rider_id))
    
    # 3. Update Financial Settlement with rider_id
    conn.execute("UPDATE financial_settlements SET rider_id = ? WHERE order_id = ?", (rider_id, order_id))
    
    # 4. Record Timeline
    action_label = "Reassigned" if is_reassignment else "Assigned"
    conn.execute("""
        INSERT INTO order_timeline (id, order_id, from_status, to_status, actor_id, actor_role, notes, timestamp)
        VALUES (?, ?, ?, 'ASSIGNED', ?, 'Admin / Dispatcher', ?, ?)
    """, (str(uuid.uuid4()), order_id, ord_row["status"], current_user["id"], f"{action_label} to nearest available rider {rider_row['full_name']} ({rider_row['rider_ref']}). {notes}", now_iso))
    
    conn.commit()
    conn.close()
    
    log_audit(
        actor_user=current_user,
        action="REASSIGN_RIDER_DISPATCH" if is_reassignment else "ASSIGN_RIDER_DISPATCH",
        resource_type="orders",
        resource_id=order_id,
        details={"order_ref": ord_row["order_ref"], "rider_id": rider_id, "rider_name": rider_row["full_name"], "is_reassignment": is_reassignment}
    )
    
    msg = f"Rider {rider_row['full_name']} successfully reassigned to Order {ord_row['order_ref']}." if is_reassignment else f"Rider {rider_row['full_name']} assigned to Order {ord_row['order_ref']} based on store proximity."
    return {"success": True, "message": msg}
