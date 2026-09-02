import uuid
import json
import secrets
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from typing import Optional, List
from app.database import get_db_connection
from app.security import get_current_user, require_role

router = APIRouter(prefix="/api/promos", tags=["Promos & Flash Sales"])

class CreatePromoRequest(BaseModel):
    title: str
    description: Optional[str] = ""
    promo_type: str = "PERCENTAGE_DISCOUNT" # PERCENTAGE_DISCOUNT, FIXED_DISCOUNT, FREE_DELIVERY, FLASH_SALE
    discount_value: float = 10.0 # 10% or 1000 NGN
    scope: str = "ALL" # ALL, SPECIFIC_VENDORS, SPECIFIC_PRODUCTS, SPECIFIC_CATEGORIES
    target_ids: Optional[List[str]] = []
    min_order_amount: float = 0.0
    max_discount_cap: Optional[float] = None
    applies_to_delivery: bool = False
    free_delivery: bool = False
    duration_hours: Optional[float] = 4.0 # e.g. 4 hours flash sale
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    banner_label: Optional[str] = "FLASH SALE ⚡"
    banner_color: Optional[str] = "#B91C1C"

class ApplyPromoRequest(BaseModel):
    promo_code_or_id: str
    store_id: Optional[str] = None
    subtotal: float
    delivery_fee: float
    items: Optional[List[dict]] = []

def is_promo_active(p: dict) -> bool:
    """Checks if promo is within its valid time window and active."""
    if p.get("status") != "ACTIVE":
        return False
    now = datetime.now(timezone.utc)
    try:
        st = datetime.fromisoformat(p["start_time"].replace("Z", "+00:00"))
        et = datetime.fromisoformat(p["end_time"].replace("Z", "+00:00"))
        return st <= now <= et
    except Exception:
        return False

@router.get("/active")
def get_active_promos():
    """
    Fetches all currently live flash sales and time-limited promos (Temu-style countdown).
    """
    conn = get_db_connection()
    now_iso = datetime.now(timezone.utc).isoformat()
    
    # Auto-expire outdated active promos
    conn.execute("""
        UPDATE promos SET status = 'EXPIRED', updated_at = ? 
        WHERE status = 'ACTIVE' AND end_time < ?
    """, (now_iso, now_iso))
    conn.commit()

    rows = conn.execute("""
        SELECT * FROM promos 
        WHERE status = 'ACTIVE' AND start_time <= ? AND end_time >= ?
        ORDER BY created_at DESC
    """, (now_iso, now_iso)).fetchall()
    conn.close()

    active = []
    now = datetime.now(timezone.utc)
    for r in rows:
        item = dict(r)
        try:
            et = datetime.fromisoformat(item["end_time"].replace("Z", "+00:00"))
            remaining_seconds = max(int((et - now).total_seconds()), 0)
            item["remaining_seconds"] = remaining_seconds
            item["remaining_formatted"] = f"{remaining_seconds // 3600:02d}:{(remaining_seconds % 3600) // 60:02d}:{remaining_seconds % 60:02d}"
        except Exception:
            item["remaining_seconds"] = 0
            item["remaining_formatted"] = "00:00:00"
        active.append(item)

    return {
        "success": True,
        "count": len(active),
        "promos": active
    }

@router.post("/apply")
def apply_promo(req: ApplyPromoRequest, current_user: dict = Depends(get_current_user)):
    """
    Calculates dynamic discount based on live promo rules, store scope, and time limits.
    """
    conn = get_db_connection()
    promo = conn.execute("""
        SELECT * FROM promos WHERE id = ? OR promo_ref = ? OR title = ?
    """, (req.promo_code_or_id, req.promo_code_or_id.upper(), req.promo_code_or_id)).fetchone()

    if not promo:
        conn.close()
        raise HTTPException(status_code=404, detail="Promo code not found.")
    
    p = dict(promo)
    if not is_promo_active(p):
        conn.close()
        raise HTTPException(status_code=400, detail="This promotion has expired or is not yet active.")

    # Check minimum order amount
    if req.subtotal < p["min_order_amount"]:
        conn.close()
        raise HTTPException(
            status_code=400, 
            detail=f"Order subtotal must be at least ₦{p['min_order_amount']:,.2f} to use this promo."
        )

    # Check user usage limit
    used_count = conn.execute("""
        SELECT COUNT(*) as cnt FROM promo_usages WHERE promo_id = ? AND user_id = ?
    """, (p["id"], current_user["id"])).fetchone()["cnt"]

    if used_count >= p["uses_per_user"]:
        conn.close()
        raise HTTPException(status_code=400, detail="You have already reached the maximum usage limit for this promo.")

    conn.close()

    # Calculate discount
    discount = 0.0
    discount_delivery = 0.0

    if p["promo_type"] == "FREE_DELIVERY" or p["free_delivery"]:
        discount_delivery = req.delivery_fee
    elif p["promo_type"] == "PERCENTAGE_DISCOUNT":
        discount = req.subtotal * (p["discount_value"] / 100.0)
        if p["max_discount_cap"] and discount > p["max_discount_cap"]:
            discount = p["max_discount_cap"]
    elif p["promo_type"] == "FIXED_DISCOUNT":
        discount = min(p["discount_value"], req.subtotal)

    if p.get("applies_to_delivery") and not discount_delivery:
        discount_delivery = min(req.delivery_fee * 0.5, req.delivery_fee)

    total_discount = round(discount + discount_delivery, 2)
    final_subtotal = max(round(req.subtotal - discount, 2), 0.0)
    final_delivery = max(round(req.delivery_fee - discount_delivery, 2), 0.0)
    final_total = round(final_subtotal + final_delivery + 150.0, 2) # Platform fee 150

    return {
        "success": True,
        "promo_id": p["id"],
        "promo_title": p["title"],
        "discount_applied": total_discount,
        "product_discount": round(discount, 2),
        "delivery_discount": round(discount_delivery, 2),
        "final_subtotal": final_subtotal,
        "final_delivery_fee": final_delivery,
        "final_total": final_total,
        "message": f"Promo '{p['title']}' applied successfully! You saved ₦{total_discount:,.2f} 🎉"
    }

# ==========================================
# ADMIN PROMO MANAGEMENT ENDPOINTS
# ==========================================
@router.post("/admin/create")
def admin_create_promo(req: CreatePromoRequest, current_user: dict = Depends(get_current_user)):
    """
    Admin creates a time-limited promo or flash sale (e.g. 4 hours, Black Friday).
    """
    if current_user["account_type"] != "ADMIN" and current_user.get("role_name") not in ["Super Admin", "Operations Manager"]:
        raise HTTPException(status_code=403, detail="Admin privileges required.")

    now = datetime.now(timezone.utc)
    if req.start_time:
        st = datetime.fromisoformat(req.start_time.replace("Z", "+00:00"))
    else:
        st = now

    if req.end_time:
        et = datetime.fromisoformat(req.end_time.replace("Z", "+00:00"))
    else:
        duration_hrs = req.duration_hours or 4.0
        et = st + timedelta(hours=duration_hrs)

    promo_id = str(uuid.uuid4())
    promo_ref = f"PROMO-{secrets.token_hex(3).upper()}"
    now_iso = now.isoformat()

    conn = get_db_connection()
    conn.execute("""
        INSERT INTO promos (
            id, promo_ref, title, description, promo_type, discount_value, scope, target_ids,
            min_order_amount, max_discount_cap, applies_to_delivery, free_delivery,
            status, start_time, end_time, banner_label, banner_color, countdown_visible,
            created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, 1, ?, ?, ?)
    """, (
        promo_id, promo_ref, req.title, req.description, req.promo_type, req.discount_value,
        req.scope, json.dumps(req.target_ids or []), req.min_order_amount, req.max_discount_cap,
        1 if req.applies_to_delivery else 0, 1 if req.free_delivery else 0,
        st.isoformat(), et.isoformat(), req.banner_label, req.banner_color,
        current_user["id"], now_iso, now_iso
    ))
    conn.commit()
    conn.close()

    duration_minutes = int((et - st).total_seconds() / 60)
    return {
        "success": True,
        "message": f"Promo '{req.title}' ({promo_ref}) created successfully for {duration_minutes // 60}h {duration_minutes % 60}m!",
        "promo_id": promo_id,
        "promo_ref": promo_ref,
        "start_time": st.isoformat(),
        "end_time": et.isoformat()
    }

@router.get("/admin/list")
def admin_list_promos(current_user: dict = Depends(get_current_user)):
    """Lists all promotions and flash sales with live usage statistics."""
    if current_user["account_type"] != "ADMIN" and current_user.get("role_name") not in ["Super Admin", "Operations Manager"]:
        raise HTTPException(status_code=403, detail="Admin privileges required.")

    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM promos ORDER BY created_at DESC").fetchall()
    conn.close()

    now = datetime.now(timezone.utc)
    promos_list = []
    for r in rows:
        item = dict(r)
        try:
            et = datetime.fromisoformat(item["end_time"].replace("Z", "+00:00"))
            st = datetime.fromisoformat(item["start_time"].replace("Z", "+00:00"))
            if item["status"] == "ACTIVE" and now > et:
                item["status"] = "EXPIRED"
            rem = max(int((et - now).total_seconds()), 0)
            item["remaining_seconds"] = rem
            item["is_live"] = item["status"] == "ACTIVE" and st <= now <= et
        except Exception:
            item["remaining_seconds"] = 0
            item["is_live"] = False
        promos_list.append(item)

    return {
        "success": True,
        "promos": promos_list
    }
