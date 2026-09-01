import os
import uuid
import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, status
from app.database import get_db_connection
from app.security import get_current_user, require_role, log_audit
from app.models import ProductCreate, ProductUpdate

router = APIRouter(prefix="/api/products", tags=["Product Catalog & Inventory"])

@router.get("/")
def list_products(
    category_id: str = None, 
    store_id: str = None, 
    search: str = None, 
    status: str = None,
    min_price: float = None,
    max_price: float = None
):
    conn = get_db_connection()
    query = """
        SELECT p.*, s.store_name, s.slug as store_slug, s.address as store_address, s.city as store_city,
               s.latitude as store_lat, s.longitude as store_lng, s.logo_url as store_logo, s.banner_url as store_banner,
               c.name as category_name, sub.name as subcategory_name
        FROM products p
        JOIN stores s ON p.store_id = s.id
        JOIN categories c ON p.category_id = c.id
        LEFT JOIN subcategories sub ON p.subcategory_id = sub.id
        WHERE 1=1
    """
    params = []
    
    if category_id:
        query += " AND p.category_id = ?"
        params.append(category_id)
    if store_id:
        query += " AND p.store_id = ?"
        params.append(store_id)
    if status:
        query += " AND p.status = ?"
        params.append(status)
    else:
        # Default public listing hides disabled items
        query += " AND p.status != 'DISABLED'"
        
    if search:
        query += " AND (p.name LIKE ? OR p.description LIKE ? OR p.sku LIKE ? OR s.store_name LIKE ?)"
        term = f"%{search}%"
        params.extend([term, term, term, term])
        
    if min_price is not None:
        query += " AND p.price >= ?"
        params.append(min_price)
    if max_price is not None:
        query += " AND p.price <= ?"
        params.append(max_price)
        
    query += " ORDER BY p.created_at DESC"
    products = conn.execute(query, tuple(params)).fetchall()
    conn.close()
    
    return {"products": [dict(p) for p in products]}

@router.get("/{product_id}")
def get_product_details(product_id: str):
    conn = get_db_connection()
    prod = conn.execute("""
        SELECT p.*, s.store_name, s.slug as store_slug, s.address as store_address, c.name as category_name, sub.name as subcategory_name
        FROM products p
        JOIN stores s ON p.store_id = s.id
        JOIN categories c ON p.category_id = c.id
        LEFT JOIN subcategories sub ON p.subcategory_id = sub.id
        WHERE p.id = ?
    """, (product_id,)).fetchone()
    conn.close()
    
    if not prod:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")
    return {"product": dict(prod)}

@router.post("/")
def create_product(req: ProductCreate, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    
    # Check authorization & resolve store_id
    store_id = req.store_id
    if current_user["account_type"] == "VENDOR":
        v = conn.execute("SELECT id, kyc_status FROM vendors WHERE user_id = ?", (current_user["id"],)).fetchone()
        if not v or v["kyc_status"] != "APPROVED":
            conn.close()
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Vendor KYC must be approved before publishing products.")
        s = conn.execute("SELECT id FROM stores WHERE vendor_id = ?", (v["id"],)).fetchone()
        if not s:
            conn.close()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No store found for this vendor.")
        store_id = s["id"]
    elif current_user["account_type"] in ["ADMIN", "STAFF"]:
        if not store_id:
            conn.close()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="store_id is required when creating product as Admin.")
    else:
        conn.close()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Vendors and Admins can create products.")
        
    # Check Category exists and is active
    cat = conn.execute("SELECT id, name FROM categories WHERE id = ? AND is_active = 1", (req.category_id,)).fetchone()
    if not cat:
        conn.close()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or inactive category selected. Categories must be approved by Admin.")
    
    # Requirement 5 & 53: Product image verification with high-res fallback
    image_url = req.image_url.strip() if req.image_url and req.image_url.strip() else None
    if not image_url:
        cat_slug = (cat["name"] or "").lower()
        if "food" in cat_slug or "rest" in cat_slug or "shawarma" in cat_slug:
            image_url = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop"
        elif "build" in cat_slug or "cement" in cat_slug or "hard" in cat_slug:
            image_url = "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=600&auto=format&fit=crop"
        elif "tech" in cat_slug or "elect" in cat_slug or "phone" in cat_slug:
            image_url = "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop"
        elif "farm" in cat_slug or "agro" in cat_slug or "grain" in cat_slug:
            image_url = "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=600&auto=format&fit=crop"
        else:
            image_url = "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop"
        
    product_id = str(uuid.uuid4())
    product_ref = f"RP-PRD-{secrets.randbelow(900000)+100000}"
    
    if req.sku and req.sku.strip():
        sku = req.sku.strip()
        existing_sku = conn.execute("SELECT id FROM products WHERE sku = ?", (sku,)).fetchone()
        if existing_sku:
            # Auto-generate unique suffix or handle uniqueness
            sku = f"{sku}-{secrets.randbelow(900)+100}"
    else:
        sku = f"SKU-{secrets.token_hex(4).upper()}"
        
    now_iso = datetime.now(timezone.utc).isoformat()
    
    conn.execute("""
        INSERT INTO products (id, product_ref, store_id, category_id, subcategory_id, name, description, sku, price, discount_price, stock_qty, image_url, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
    """, (
        product_id,
        product_ref,
        store_id,
        req.category_id,
        req.subcategory_id,
        req.name,
        req.description or "",
        sku,
        req.price,
        req.discount_price,
        req.stock_qty,
        image_url,
        now_iso,
        now_iso
    ))
    
    conn.commit()
    conn.close()
    
    log_audit(
        actor_user=current_user,
        action="CREATE_PRODUCT",
        resource_type="products",
        resource_id=product_id,
        details={"name": req.name, "sku": sku, "price": req.price, "store_id": store_id, "image_url": req.image_url}
    )
    
    return {"success": True, "product_id": product_id, "product_ref": product_ref, "message": "Product created and published successfully."}

@router.put("/{product_id}")
def update_product(product_id: str, req: ProductUpdate, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    prod = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    if not prod:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")
        
    # Check ownership
    if current_user["account_type"] == "VENDOR":
        v = conn.execute("SELECT id FROM vendors WHERE user_id = ?", (current_user["id"],)).fetchone()
        s = conn.execute("SELECT id FROM stores WHERE vendor_id = ?", (v["id"],)).fetchone() if v else None
        if not s or prod["store_id"] != s["id"]:
            conn.close()
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only edit products from your own store.")
            
    now_iso = datetime.now(timezone.utc).isoformat()
    name = req.name if req.name is not None else prod["name"]
    price = req.price if req.price is not None else prod["price"]
    discount_price = req.discount_price if req.discount_price is not None else prod["discount_price"]
    stock_qty = req.stock_qty if req.stock_qty is not None else prod["stock_qty"]
    status_val = req.status if req.status is not None else prod["status"]
    cat_id = req.category_id if req.category_id is not None else prod["category_id"]
    desc = req.description if req.description is not None else prod["description"]
    img = req.image_url if req.image_url is not None else prod["image_url"]
    
    conn.execute("""
        UPDATE products
        SET name = ?, price = ?, discount_price = ?, stock_qty = ?, status = ?, category_id = ?, description = ?, image_url = ?, updated_at = ?
        WHERE id = ?
    """, (name, price, discount_price, stock_qty, status_val, cat_id, desc, img, now_iso, product_id))
    
    conn.commit()
    conn.close()
    
    log_audit(
        actor_user=current_user,
        action="UPDATE_PRODUCT",
        resource_type="products",
        resource_id=product_id,
        details={"before_price": prod["price"], "new_price": price, "before_stock": prod["stock_qty"], "new_stock": stock_qty}
    )
    
    return {"success": True, "message": "Product updated successfully."}

@router.delete("/{product_id}")
def delete_product(product_id: str, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    prod = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    if not prod:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")
        
    # Check ownership
    if current_user["account_type"] == "VENDOR":
        v = conn.execute("SELECT id FROM vendors WHERE user_id = ?", (current_user["id"],)).fetchone()
        s = conn.execute("SELECT id FROM stores WHERE vendor_id = ?", (v["id"],)).fetchone() if v else None
        if not s or prod["store_id"] != s["id"]:
            conn.close()
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only delete products from your own store.")
            
    conn.execute("DELETE FROM order_items WHERE product_id = ?", (product_id,))
    conn.execute("DELETE FROM products WHERE id = ?", (product_id,))
    conn.commit()
    conn.close()
    
    log_audit(
        actor_user=current_user,
        action="DELETE_PRODUCT",
        resource_type="products",
        resource_id=product_id,
        details={"deleted_product_name": prod["name"]}
    )
    
    return {"success": True, "message": "Product removed successfully."}

@router.post("/bulk-stock-price")
def bulk_update_products(payload: dict, current_user: dict = Depends(require_role(["ADMIN", "STAFF", "Super Admin", "Operations Manager", "Vendor", "VENDOR"]))):
    """
    Bulk update price adjustments (percentage / fixed), stock adjustments, and status toggles.
    """
    product_ids = payload.get("product_ids", [])
    action = payload.get("action") # PERCENT_INCREASE, PERCENT_DECREASE, FIXED_INCREASE, FIXED_DECREASE, SET_PRICE, SET_STOCK, ENABLE, DISABLE, OUT_OF_STOCK, DELETE
    value = float(payload.get("value", 0))
    updates = payload.get("updates", []) # Optional direct update list
    
    conn = get_db_connection()
    now_iso = datetime.now(timezone.utc).isoformat()
    count = 0
    
    if product_ids and action:
        for p_id in product_ids:
            prod = conn.execute("SELECT * FROM products WHERE id = ?", (p_id,)).fetchone()
            if not prod:
                continue
                
            cur_price = prod["price"]
            cur_stock = prod["stock_qty"]
            
            if action == "PERCENT_INCREASE":
                new_price = round(cur_price * (1.0 + (value / 100.0)), 2)
                conn.execute("UPDATE products SET price = ?, updated_at = ? WHERE id = ?", (new_price, now_iso, p_id))
            elif action == "PERCENT_DECREASE":
                new_price = max(100.0, round(cur_price * (1.0 - (value / 100.0)), 2))
                conn.execute("UPDATE products SET price = ?, updated_at = ? WHERE id = ?", (new_price, now_iso, p_id))
            elif action == "FIXED_INCREASE":
                new_price = cur_price + value
                conn.execute("UPDATE products SET price = ?, updated_at = ? WHERE id = ?", (new_price, now_iso, p_id))
            elif action == "FIXED_DECREASE":
                new_price = max(100.0, cur_price - value)
                conn.execute("UPDATE products SET price = ?, updated_at = ? WHERE id = ?", (new_price, now_iso, p_id))
            elif action == "SET_PRICE":
                new_price = max(100.0, value)
                conn.execute("UPDATE products SET price = ?, updated_at = ? WHERE id = ?", (new_price, now_iso, p_id))
            elif action == "SET_STOCK":
                new_stock = max(0, int(value))
                conn.execute("UPDATE products SET stock_qty = ?, updated_at = ? WHERE id = ?", (new_stock, now_iso, p_id))
            elif action == "ENABLE":
                conn.execute("UPDATE products SET status = 'ACTIVE', updated_at = ? WHERE id = ?", (now_iso, p_id))
            elif action == "DISABLE":
                conn.execute("UPDATE products SET status = 'DISABLED', updated_at = ? WHERE id = ?", (now_iso, p_id))
            elif action == "OUT_OF_STOCK":
                conn.execute("UPDATE products SET stock_qty = 0, status = 'ACTIVE', updated_at = ? WHERE id = ?", (now_iso, p_id))
            elif action == "DELETE":
                conn.execute("DELETE FROM order_items WHERE product_id = ?", (p_id,))
                conn.execute("DELETE FROM products WHERE id = ?", (p_id,))
            count += 1
    elif updates:
        for u in updates:
            p_id = u.get("product_id")
            if p_id:
                conn.execute("""
                    UPDATE products
                    SET price = COALESCE(?, price),
                        stock_qty = COALESCE(?, stock_qty),
                        status = COALESCE(?, status),
                        image_url = COALESCE(?, image_url),
                        updated_at = ?
                    WHERE id = ?
                """, (u.get("price"), u.get("stock_qty"), u.get("status"), u.get("image_url"), now_iso, p_id))
                count += 1
    else:
        conn.close()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No valid product IDs or action provided.")
        
    conn.commit()
    conn.close()
    
    log_audit(
        actor_user=current_user,
        action="BULK_UPDATE_PRODUCTS",
        resource_type="products",
        details={"count": count, "action": action, "value": value}
    )
    
    return {"success": True, "message": f"Successfully updated {count} product(s).", "count": count}

@router.post("/upload-image")
def upload_and_compress_product_image(payload: dict, current_user: dict = Depends(get_current_user)):
    """
    Accepts base64/data URI image, compresses down to small KB while retaining high quality,
    saves to static uploads, and returns the public asset URL.
    """
    import base64
    import io
    from PIL import Image

    image_data = payload.get("image_data") or payload.get("image_base64")
    if not image_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No image data provided.")

    if "," in image_data:
        # Strip data URL header (e.g. data:image/png;base64,...)
        image_data = image_data.split(",", 1)[1]

    try:
        raw_bytes = base64.b64decode(image_data)
        img = Image.open(io.BytesIO(raw_bytes))

        # Convert RGBA / P mode to RGB for clean JPEG saving
        if img.mode in ("RGBA", "P", "LA"):
            background = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "RGBA":
                background.paste(img, mask=img.split()[3])
            else:
                background.paste(img.convert("RGBA"), mask=img.convert("RGBA").split()[3])
            img = background
        elif img.mode != "RGB":
            img = img.convert("RGB")

        # Downscale if wider or taller than 800px preserving aspect ratio
        max_dim = 800
        if img.width > max_dim or img.height > max_dim:
            img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)

        # Compress to JPEG with quality=82 (keeps high fidelity, outputs small KB ~ 30-90 KB)
        output_io = io.BytesIO()
        img.save(output_io, format="JPEG", quality=82, optimize=True)
        compressed_bytes = output_io.getvalue()
        file_size_kb = round(len(compressed_bytes) / 1024, 1)

        upload_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static", "uploads", "products")
        os.makedirs(upload_dir, exist_ok=True)

        filename = f"prod_{secrets.token_hex(8)}.jpg"
        filepath = os.path.join(upload_dir, filename)

        with open(filepath, "wb") as f:
            f.write(compressed_bytes)

        return {
            "success": True,
            "url": f"/static/uploads/products/{filename}",
            "filename": filename,
            "size_kb": file_size_kb,
            "original_size_kb": round(len(raw_bytes) / 1024, 1),
            "message": f"Image compressed to {file_size_kb} KB with high quality."
        }
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Image processing failed: {str(e)}")

