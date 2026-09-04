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

def compute_scored_riders(conn, order_id: str):
    ord_row = conn.execute("SELECT o.*, s.latitude as store_lat, s.longitude as store_lng, s.store_name FROM orders o JOIN stores s ON o.store_id = s.id WHERE o.id = ?", (order_id,)).fetchone()
    if not ord_row:
        return None, False, "MOTORCYCLE / TRICYCLE", []
        
    store_lat = ord_row["store_lat"] or 12.9908
    store_lng = ord_row["store_lng"] or 7.6018
    
    # Check order items to detect heavy/bulky cargo
    items = conn.execute("SELECT * FROM order_items WHERE order_id = ?", (order_id,)).fetchall()
    heavy_keywords = ["cement", "block", "blocks", "steel", "rod", "iron", "sandcrete", "hectare", "land", "ton", "tonne", "generator", "machinery"]
    
    is_heavy_cargo = False
    for it in items:
        p_name = (it["product_name"] or "").lower()
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
    
    scored_riders = []
    for r in riders:
        r_lat = r["current_lat"] or 12.9820
        r_lng = r["current_lng"] or 7.5950
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
            status_score = 12 # Offline feature phone rider
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
        
    return ord_row, is_heavy_cargo, required_vehicle, scored_riders

def execute_rider_assignment(conn, order_id: str, rider_id: str, actor_id: str, actor_role: str, notes: str):
    ord_row = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    rider_row = conn.execute("SELECT r.*, u.full_name FROM riders r JOIN users u ON r.user_id = u.id WHERE r.id = ?", (rider_id,)).fetchone()
    if not ord_row or not rider_row:
        return False, "Order or Rider not found"
        
    now_iso = datetime.now(timezone.utc).isoformat()
    prev_rider_id = ord_row["rider_id"]
    is_reassignment = bool(prev_rider_id and prev_rider_id != rider_id)
    
    if is_reassignment:
        conn.execute("UPDATE riders SET operational_status = 'AVAILABLE', updated_at = ? WHERE id = ?", (now_iso, prev_rider_id))
        
    conn.execute("UPDATE orders SET rider_id = ?, status = 'ASSIGNED', updated_at = ? WHERE id = ?", (rider_id, now_iso, order_id))
    conn.execute("UPDATE riders SET operational_status = 'ON_DELIVERY', updated_at = ? WHERE id = ?", (now_iso, rider_id))
    conn.execute("UPDATE financial_settlements SET rider_id = ? WHERE order_id = ?", (rider_id, order_id))
    
    action_label = "Reassigned" if is_reassignment else "Assigned"
    conn.execute("""
        INSERT INTO order_timeline (id, order_id, from_status, to_status, actor_id, actor_role, notes, timestamp)
        VALUES (?, ?, ?, 'ASSIGNED', ?, ?, ?, ?)
    """, (str(uuid.uuid4()), order_id, ord_row["status"], actor_id, actor_role, f"{action_label} to nearest available rider {rider_row['full_name']} ({rider_row['rider_ref']}). {notes}", now_iso))
    conn.commit()
    return True, f"Rider {rider_row['full_name']} assigned to Order {ord_row['order_ref']}."

@router.get("/recommendations/{order_id}")
def recommend_riders_for_order(order_id: str, current_user: dict = Depends(require_role(["ADMIN", "STAFF", "Super Admin", "Operations Manager", "Dispatcher"]))):
    """
    Intelligent dispatch algorithm scoring riders based on proximity, availability, and vehicle suitability.
    """
    conn = get_db_connection()
    ord_row, is_heavy_cargo, required_vehicle, scored_riders = compute_scored_riders(conn, order_id)
    conn.close()
    
    if not ord_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")
        
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
    success, msg = execute_rider_assignment(conn, order_id, rider_id, current_user["id"], "Admin / Dispatcher", notes)
    conn.close()
    
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg)
        
    log_audit(
        actor_user=current_user,
        action="ASSIGN_RIDER_DISPATCH",
        resource_type="orders",
        resource_id=order_id,
        details={"rider_id": rider_id, "notes": notes}
    )
    
    return {"success": True, "message": msg}

@router.post("/auto-assign/{order_id}")
def auto_assign_nearest_rider(order_id: str, current_user: dict = Depends(require_role(["ADMIN", "STAFF", "Super Admin", "Operations Manager", "Dispatcher"]))):
    """
    Automatically finds the nearest available/best-match rider for an order and assigns them immediately.
    """
    conn = get_db_connection()
    ord_row, is_heavy_cargo, req_veh, scored_riders = compute_scored_riders(conn, order_id)
    if not ord_row:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")
        
    if not scored_riders:
        conn.close()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active riders registered in fleet.")
        
    # Prefer an available rider if one is nearby; otherwise take the top scored
    avail = [r for r in scored_riders if r["operational_status"] == "AVAILABLE"]
    target_rider = avail[0] if avail else scored_riders[0]
    
    success, msg = execute_rider_assignment(
        conn, order_id, target_rider["rider_id"],
        current_user["id"], "Auto-Dispatch Proximity Engine",
        f"Nearest rider matched automatically ({target_rider['distance_km']} km from vendor, Proximity Score: {target_rider['recommendation_score']}/100)"
    )
    conn.close()
    
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)
        
    log_audit(
        actor_user=current_user,
        action="AUTO_ASSIGN_RIDER",
        resource_type="orders",
        resource_id=order_id,
        details={"rider_id": target_rider["rider_id"], "rider_name": target_rider["full_name"], "distance_km": target_rider["distance_km"]}
    )
    
    return {
        "success": True,
        "message": f"⚡ Order {ord_row['order_ref']} auto-assigned to nearest courier: {target_rider['full_name']} ({target_rider['distance_km']} km away)",
        "rider": target_rider
    }

@router.post("/auto-assign-all")
def auto_assign_all_pending_orders(current_user: dict = Depends(require_role(["ADMIN", "STAFF", "Super Admin", "Operations Manager", "Dispatcher"]))):
    """
    Batch auto-assigns all pending orders awaiting dispatch to their respective nearest couriers.
    """
    conn = get_db_connection()
    pending = conn.execute("SELECT id, order_ref FROM orders WHERE status IN ('NEW', 'CONFIRMED') AND (rider_id IS NULL OR rider_id = '') ORDER BY created_at ASC").fetchall()
    
    assigned_count = 0
    assigned_records = []
    
    for p in pending:
        ord_row, is_heavy, req_v, scored_riders = compute_scored_riders(conn, p["id"])
        if not scored_riders:
            continue
        avail = [r for r in scored_riders if r["operational_status"] == "AVAILABLE"]
        target = avail[0] if avail else scored_riders[0]
        success, msg = execute_rider_assignment(
            conn, p["id"], target["rider_id"],
            current_user["id"], "Batch Auto-Dispatch Engine",
            f"Batch matched nearest rider ({target['distance_km']} km away)"
        )
        if success:
            assigned_count += 1
            assigned_records.append({"order_ref": p["order_ref"], "rider": target["full_name"], "distance_km": target["distance_km"]})
            
    conn.close()
    return {
        "success": True,
        "assigned_count": assigned_count,
        "details": assigned_records,
        "message": f"⚡ Successfully auto-assigned {assigned_count} pending orders to their nearest couriers!"
    }

@router.get("/customer-call-setting")
def get_customer_call_setting():
    """
    Returns whether customers are permitted to call riders directly or must contact Dispatch Support.
    """
    conn = get_db_connection()
    row = conn.execute("SELECT value FROM system_settings WHERE key = 'allow_customer_call_rider'").fetchone()
    conn.close()
    enabled = (row["value"] == "true") if row else False
    return {
        "allow_customer_call_rider": enabled,
        "policy": "Rider calls direct" if enabled else "Strict Privacy: Customer calls RushPoint Dispatch Support"
    }

@router.post("/customer-call-setting")
def update_customer_call_setting(payload: dict, current_user: dict = Depends(require_role(["ADMIN", "STAFF", "Super Admin", "Operations Manager", "Dispatcher"]))):
    """
    Admin toggle: Allow customers to call riders directly during heavy workload / overload periods.
    """
    enabled = bool(payload.get("enabled", False))
    val_str = "true" if enabled else "false"
    now_iso = datetime.now(timezone.utc).isoformat()
    conn = get_db_connection()
    conn.execute("""
        INSERT INTO system_settings (key, value, description, updated_at)
        VALUES ('allow_customer_call_rider', ?, 'Allow customers to directly call couriers during heavy workload', ?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
    """, (val_str, now_iso))
    conn.commit()
    conn.close()
    
    log_audit(
        actor_user=current_user,
        action="UPDATE_CUSTOMER_CALL_POLICY",
        resource_type="system_settings",
        resource_id="allow_customer_call_rider",
        details={"enabled": enabled}
    )
    
    status_text = "ENABLED (Customers can call riders directly)" if enabled else "DISABLED (Strict Privacy: Customers contact Dispatch Support)"
    return {"success": True, "allow_customer_call_rider": enabled, "message": f"Customer-Courier Direct Calling is now {status_text}."}
