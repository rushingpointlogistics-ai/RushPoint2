import uuid
import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, status
from app.database import get_db_connection
from app.security import get_current_user, require_role, log_audit
from app.models import CategoryCreate, SubcategoryCreate

router = APIRouter(prefix="/api/categories", tags=["Categories & Subcategories"])

@router.get("/")
def list_categories(include_subcategories: bool = True):
    conn = get_db_connection()
    categories = conn.execute("SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC, name ASC").fetchall()
    
    result = []
    for cat in categories:
        c_dict = dict(cat)
        if include_subcategories:
            subs = conn.execute("SELECT * FROM subcategories WHERE category_id = ? AND is_active = 1", (cat["id"],)).fetchall()
            c_dict["subcategories"] = [dict(s) for s in subs]
            
        # Count products under this category
        p_count = conn.execute("SELECT COUNT(*) as count FROM products WHERE category_id = ? AND status != 'DISABLED'", (cat["id"],)).fetchone()["count"]
        c_dict["product_count"] = p_count
        result.append(c_dict)
        
    conn.close()
    return {"categories": result}

@router.post("/")
def create_category(req: CategoryCreate, current_user: dict = Depends(require_role(["ADMIN", "Super Admin", "Operations Manager"]))):
    """
    Exclusively controlled by Admin.
    """
    conn = get_db_connection()
    slug = req.slug or req.name.lower().replace(" ", "-").replace("&", "and")
    existing = conn.execute("SELECT id FROM categories WHERE name = ? OR slug = ?", (req.name, slug)).fetchone()
    if existing:
        conn.close()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Category name or slug already exists.")
        
    cat_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    
    conn.execute("""
        INSERT INTO categories (id, name, slug, icon, image_url, is_active, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
    """, (cat_id, req.name, slug, req.icon or "tag", req.image_url, req.sort_order or 0, now_iso, now_iso))
    
    conn.commit()
    conn.close()
    
    log_audit(
        actor_user=current_user,
        action="CREATE_CATEGORY",
        resource_type="categories",
        resource_id=cat_id,
        details={"name": req.name, "slug": slug}
    )
    
    return {"success": True, "category_id": cat_id, "name": req.name, "slug": slug}

@router.post("/{category_id}/subcategories")
def create_subcategory(category_id: str, req: SubcategoryCreate, current_user: dict = Depends(require_role(["ADMIN", "Super Admin", "Operations Manager"]))):
    conn = get_db_connection()
    cat = conn.execute("SELECT * FROM categories WHERE id = ?", (category_id,)).fetchone()
    if not cat:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent category not found.")
        
    sub_id = str(uuid.uuid4())
    slug = req.slug or req.name.lower().replace(" ", "-")
    now_iso = datetime.now(timezone.utc).isoformat()
    
    conn.execute("""
        INSERT INTO subcategories (id, category_id, name, slug, is_active, created_at)
        VALUES (?, ?, ?, ?, 1, ?)
    """, (sub_id, category_id, req.name, slug, now_iso))
    
    conn.commit()
    conn.close()
    
    log_audit(
        actor_user=current_user,
        action="CREATE_SUBCATEGORY",
        resource_type="subcategories",
        resource_id=sub_id,
        details={"parent_category": cat["name"], "subcategory_name": req.name}
    )
    
    return {"success": True, "subcategory_id": sub_id, "name": req.name}

@router.delete("/{category_id}")
def delete_category(category_id: str, force_reassign_to: str = None, current_user: dict = Depends(require_role(["ADMIN", "Super Admin"]))):
    """
    Prevents accidental category deletion if products exist.
    Admin must either reassign products or clean up beforehand.
    """
    conn = get_db_connection()
    cat = conn.execute("SELECT * FROM categories WHERE id = ?", (category_id,)).fetchone()
    if not cat:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")
        
    product_count = conn.execute("SELECT COUNT(*) as count FROM products WHERE category_id = ? AND status != 'DISABLED'", (category_id,)).fetchone()["count"]
    
    if product_count > 0:
        if not force_reassign_to:
            conn.close()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail=f"Safeguard triggered: Cannot delete category '{cat['name']}' because {product_count} active product(s) exist under it. Please reassign or disable the products first."
            )
        else:
            # Reassign products
            target = conn.execute("SELECT * FROM categories WHERE id = ?", (force_reassign_to,)).fetchone()
            if not target:
                conn.close()
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reassignment target category not found.")
            conn.execute("UPDATE products SET category_id = ? WHERE category_id = ?", (force_reassign_to, category_id))
            
@router.put("/{category_id}")
def update_category(category_id: str, payload: dict, current_user: dict = Depends(require_role(["ADMIN", "Super Admin", "Operations Manager"]))):
    """
    Admin updates category name, icon, image, sort order, and cascades updates if needed.
    """
    name = payload.get("name")
    icon = payload.get("icon")
    image_url = payload.get("image_url")
    sort_order = payload.get("sort_order")
    is_active = payload.get("is_active", 1)
    
    conn = get_db_connection()
    cat = conn.execute("SELECT * FROM categories WHERE id = ?", (category_id,)).fetchone()
    if not cat:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")
        
    now_iso = datetime.now(timezone.utc).isoformat()
    new_name = name or cat["name"]
    new_slug = payload.get("slug") or new_name.lower().replace(" ", "-").replace("&", "and")
    new_icon = icon if icon is not None else cat["icon"]
    new_image = image_url if image_url is not None else cat["image_url"]
    new_sort = sort_order if sort_order is not None else cat["sort_order"]
    
    conn.execute("""
        UPDATE categories
        SET name = ?, slug = ?, icon = ?, image_url = ?, sort_order = ?, is_active = ?, updated_at = ?
        WHERE id = ?
    """, (new_name, new_slug, new_icon, new_image, new_sort, is_active, now_iso, category_id))
    
    conn.commit()
    conn.close()
    
    log_audit(
        actor_user=current_user,
        action="UPDATE_CATEGORY",
        resource_type="categories",
        resource_id=category_id,
        details={"old_name": cat["name"], "new_name": new_name}
    )
    
    return {"success": True, "message": f"Category '{new_name}' updated successfully.", "category_id": category_id}

