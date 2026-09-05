import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, status
from app.database import get_db_connection
from app.security import get_current_user, require_role, log_audit

router = APIRouter(prefix="/api/vendors", tags=["Vendor & Store Operations"])

@router.get("/")
def list_vendors(kyc_status: str = None, current_user: dict = Depends(require_role(["ADMIN", "STAFF", "Super Admin", "Vendor Manager", "Operations Manager"]))):
    conn = get_db_connection()
    query = """
        SELECT v.*, u.full_name, u.email, u.phone, u.status as account_status, s.id as store_id, s.store_name, s.slug, s.is_active as store_active
        FROM vendors v
        JOIN users u ON v.user_id = u.id
        LEFT JOIN stores s ON s.vendor_id = v.id
        WHERE 1=1
    """
    params = []
    if kyc_status:
        query += " AND v.kyc_status = ?"
        params.append(kyc_status)
        
    query += " ORDER BY v.created_at DESC"
    rows = conn.execute(query, tuple(params)).fetchall()
    conn.close()
    
    return {"vendors": [dict(r) for r in rows]}

@router.get("/kyc/queue")
def get_kyc_review_queue(current_user: dict = Depends(require_role(["ADMIN", "STAFF", "Super Admin", "Vendor Manager"]))):
    conn = get_db_connection()
    rows = conn.execute("""
        SELECT v.*, u.full_name, u.email, u.phone, s.store_name, s.category
        FROM vendors v
        JOIN users u ON v.user_id = u.id
        LEFT JOIN stores s ON s.vendor_id = v.id
        WHERE v.kyc_status IN ('PENDING', 'UNDER_REVIEW')
        ORDER BY v.created_at ASC
    """).fetchall()
    conn.close()
    return {"queue": [dict(r) for r in rows]}

@router.post("/{vendor_id}/kyc-decision")
def kyc_decision(vendor_id: str, payload: dict, current_user: dict = Depends(require_role(["ADMIN", "Super Admin", "Vendor Manager"]))):
    decision = payload.get("decision") # APPROVED, REJECTED, UNDER_REVIEW
    notes = payload.get("notes", "")
    
    if decision not in ["APPROVED", "REJECTED", "UNDER_REVIEW"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Decision must be APPROVED, REJECTED, or UNDER_REVIEW.")
        
    conn = get_db_connection()
    vendor = conn.execute("SELECT * FROM vendors WHERE id = ?", (vendor_id,)).fetchone()
    if not vendor:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found.")
        
    now_iso = datetime.now(timezone.utc).isoformat()
    conn.execute("""
        UPDATE vendors
        SET kyc_status = ?, kyc_notes = ?, updated_at = ?
        WHERE id = ?
    """, (decision, notes, now_iso, vendor_id))
    
    # If approved, ensure store is active
    if decision == "APPROVED":
        conn.execute("UPDATE stores SET is_active = 1, updated_at = ? WHERE vendor_id = ?", (now_iso, vendor_id))
    elif decision == "REJECTED":
        conn.execute("UPDATE stores SET is_active = 0, updated_at = ? WHERE vendor_id = ?", (now_iso, vendor_id))
        
    conn.commit()
    conn.close()
    
    log_audit(
        actor_user=current_user,
        action=f"KYC_DECISION_{decision}",
        resource_type="vendors",
        resource_id=vendor_id,
        details={"vendor_id": vendor_id, "decision": decision, "notes": notes}
    )
    
    return {"success": True, "message": f"Vendor KYC marked as {decision}."}

@router.get("/store/profile")
def get_vendor_store_profile(current_user: dict = Depends(get_current_user)):
    """
    Vendor retrieves their own store profile.
    """
    if current_user["account_type"] != "VENDOR":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only vendors can access store profile.")
        
    conn = get_db_connection()
    vendor = conn.execute("SELECT * FROM vendors WHERE user_id = ?", (current_user["id"],)).fetchone()
    if not vendor:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor record not found.")
        
    store = conn.execute("SELECT * FROM stores WHERE vendor_id = ?", (vendor["id"],)).fetchone()
    products_count = conn.execute("SELECT COUNT(*) as count FROM products WHERE store_id = ?", (store["id"],)).fetchone()["count"] if store else 0
    orders_count = conn.execute("SELECT COUNT(*) as count FROM orders WHERE store_id = ?", (store["id"],)).fetchone()["count"] if store else 0
    
    conn.close()
    return {
        "vendor": dict(vendor),
        "store": dict(store) if store else None,
        "metrics": {
            "products_count": products_count,
            "orders_count": orders_count
        }
    }

@router.put("/store/profile")
def update_vendor_store_profile(payload: dict, current_user: dict = Depends(get_current_user)):
    if current_user["account_type"] != "VENDOR":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only vendors can update store profile.")
        
    conn = get_db_connection()
    vendor = conn.execute("SELECT * FROM vendors WHERE user_id = ?", (current_user["id"],)).fetchone()
    if not vendor:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor record not found.")
        
    store = conn.execute("SELECT * FROM stores WHERE vendor_id = ?", (vendor["id"],)).fetchone()
    if not store:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store record not found.")
        
    now_iso = datetime.now(timezone.utc).isoformat()
    store_name = payload.get("store_name", store["store_name"])
    description = payload.get("description", store["description"])
    address = payload.get("address", store["address"])
    
    conn.execute("""
        UPDATE stores
        SET store_name = ?, description = ?, address = ?, updated_at = ?
        WHERE id = ?
    """, (store_name, description, address, now_iso, store["id"]))
    
    conn.commit()
    conn.close()
    
    return {"success": True, "message": "Store profile updated successfully."}

@router.post("/kyc/documents")
def update_vendor_kyc_documents(payload: dict, current_user: dict = Depends(get_current_user)):
    """
    Vendor uploads or updates their CAC, National ID, Utility bill, and business credentials.
    """
    conn = get_db_connection()
    vendor = conn.execute("SELECT id FROM vendors WHERE user_id = ?", (current_user["id"],)).fetchone()
    if not vendor:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor record not found.")
        
    now_iso = datetime.now(timezone.utc).isoformat()
    cac = payload.get("cac_doc_url")
    id_card = payload.get("id_card_url")
    utility = payload.get("utility_bill_url")
    step = payload.get("onboarding_step", 4)
    
    conn.execute("""
        UPDATE vendors
        SET cac_doc_url = COALESCE(?, cac_doc_url),
            id_card_url = COALESCE(?, id_card_url),
            utility_bill_url = COALESCE(?, utility_bill_url),
            onboarding_step = ?,
            kyc_status = CASE WHEN kyc_status = 'REJECTED' THEN 'PENDING' ELSE kyc_status END,
            updated_at = ?
        WHERE id = ?
    """, (cac, id_card, utility, step, now_iso, vendor["id"]))
    
    conn.commit()
    conn.close()
    
    log_audit(
        actor_user=current_user,
        action="UPDATE_KYC_DOCUMENTS",
        resource_type="vendors",
        resource_id=vendor["id"],
        details={"cac": cac, "id_card": id_card, "utility": utility}
    )
    
    return {"success": True, "message": "KYC documents submitted for verification."}

@router.get("/store-by-slug/{slug}")
def get_store_by_slug(slug: str):
    """
    Public browsable store page with products.
    """
    conn = get_db_connection()
    store = conn.execute("""
        SELECT s.*, v.business_name, v.business_type, v.kyc_status
        FROM stores s
        JOIN vendors v ON s.vendor_id = v.id
        WHERE s.slug = ?
    """, (slug,)).fetchone()
    
    if not store:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found.")
        
    products = conn.execute("""
        SELECT p.*, c.name as category_name
        FROM products p
        JOIN categories c ON p.category_id = c.id
        WHERE p.store_id = ? AND p.status = 'ACTIVE'
        ORDER BY p.created_at DESC
    """, (store["id"],)).fetchall()
    
    conn.close()
    return {
        "store": dict(store),
        "products": [dict(p) for p in products]
    }


@router.get("/low-stock-alert")
def get_vendor_low_stock_alerts(current_user: dict = Depends(get_current_user)):
    """
    Vendor Inventory Low-Stock Alert:
    Returns any product for the vendor's store with stock_qty <= 5.
    """
    if current_user.get("account_type") != "VENDOR":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only vendors can check low-stock alerts.")
    
    conn = get_db_connection()
    vendor = conn.execute("SELECT id FROM vendors WHERE user_id = ?", (current_user["id"],)).fetchone()
    if not vendor:
        conn.close()
        return {"success": True, "low_stock_count": 0, "products": []}
        
    store = conn.execute("SELECT id, store_name FROM stores WHERE vendor_id = ?", (vendor["id"],)).fetchone()
    if not store:
        conn.close()
        return {"success": True, "low_stock_count": 0, "products": []}

    rows = conn.execute("""
        SELECT p.id, p.name, p.sku, p.price, p.stock_qty, p.image_url, c.name as category_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.store_id = ? AND p.stock_qty <= 5 AND p.status != 'DISABLED'
        ORDER BY p.stock_qty ASC
    """, (store["id"],)).fetchall()
    conn.close()

    return {
        "success": True,
        "store_id": store["id"],
        "store_name": store["store_name"],
        "low_stock_count": len(rows),
        "products": [dict(r) for r in rows]
    }


@router.put("/operating-hours")
def update_store_operating_hours(payload: dict, current_user: dict = Depends(get_current_user)):
    """
    Vendor Operating Hours & Scheduled Auto-Pause (Prayer / Night Times):
    Allows vendor to set opening_time (e.g. '08:00'), closing_time (e.g. '20:00'), and is_auto_closed.
    """
    if current_user.get("account_type") != "VENDOR":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only vendors can update operating hours.")

    opening_time = str(payload.get("opening_time", "08:00")).strip()
    closing_time = str(payload.get("closing_time", "20:00")).strip()
    is_auto_closed = 1 if payload.get("is_auto_closed") in [True, 1, "1"] else 0

    conn = get_db_connection()
    vendor = conn.execute("SELECT id FROM vendors WHERE user_id = ?", (current_user["id"],)).fetchone()
    if not vendor:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor record not found.")

    store = conn.execute("SELECT id, store_name FROM stores WHERE vendor_id = ?", (vendor["id"],)).fetchone()
    if not store:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store record not found.")

    now_iso = datetime.now(timezone.utc).isoformat()
    conn.execute("""
        UPDATE stores
        SET opening_time = ?,
            closing_time = ?,
            is_auto_closed = ?,
            updated_at = ?
        WHERE id = ?
    """, (opening_time, closing_time, is_auto_closed, now_iso, store["id"]))

    conn.commit()
    conn.close()

    status_str = "Paused / Closed for Prayer or Night" if is_auto_closed else f"Open ({opening_time} - {closing_time})"
    return {
        "success": True,
        "store_id": store["id"],
        "opening_time": opening_time,
        "closing_time": closing_time,
        "is_auto_closed": bool(is_auto_closed),
        "status_label": status_str,
        "message": f"Operating hours updated: {status_str}."
    }


