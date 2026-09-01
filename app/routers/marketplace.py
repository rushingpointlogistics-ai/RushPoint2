import uuid
import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, status
from app.database import get_db_connection
from app.security import get_current_user
from app.models import CheckoutRequest

router = APIRouter(prefix="/api/marketplace", tags=["Customer Marketplace & Checkout"])

@router.get("/stores")
def list_marketplace_stores(category: str = None, search: str = None):
    conn = get_db_connection()
    query = """
        SELECT s.*, v.business_name, v.commission_rate,
               (SELECT COUNT(*) FROM products p WHERE p.store_id = s.id AND p.status != 'DISABLED') as total_products
        FROM stores s
        JOIN vendors v ON s.vendor_id = v.id
        WHERE s.is_active = 1 AND v.kyc_status = 'APPROVED'
    """
    params = []
    if category:
        query += " AND s.category = ?"
        params.append(category)
    if search:
        query += " AND (s.store_name LIKE ? OR s.description LIKE ? OR s.city LIKE ?)"
        term = f"%{search}%"
        params.extend([term, term, term])
        
    query += " ORDER BY s.store_name ASC"
    stores = conn.execute(query, tuple(params)).fetchall()
    conn.close()
    
    return {"stores": [dict(s) for s in stores]}

@router.get("/stores/{store_id}")
def get_store_marketplace_details(store_id: str):
    conn = get_db_connection()
    store = conn.execute("""
        SELECT s.*, v.business_name, v.business_type
        FROM stores s
        JOIN vendors v ON s.vendor_id = v.id
        WHERE s.id = ?
    """, (store_id,)).fetchone()
    
    if not store:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found.")
        
    products = conn.execute("""
        SELECT p.*, c.name as category_name
        FROM products p
        JOIN categories c ON p.category_id = c.id
        WHERE p.store_id = ? AND p.status = 'ACTIVE'
        ORDER BY p.name ASC
    """, (store_id,)).fetchall()
    conn.close()
    
    return {
        "store": dict(store),
        "products": [dict(p) for p in products]
    }

def calculate_intelligent_delivery_fee(items_data: list, base_delivery_fee: float = 1200.0, custom_store_fee: float = None) -> dict:
    """
    Internal Free AI Rule-Based Cargo & Weight Delivery Engine:
    - Same-Vendor Multi-Item Rule: Buying multiple minor items or multiple bags of standard goods (e.g., 5 bags of sugar, rice, groceries) from the same shop = FLAT single delivery fee (₦0 extra delivery increment).
    - Heavy / Bulky Goods (cement, blocks, steel, iron, sandcrete, generators, heavy machinery):
      -> Base Heavy Surcharge +₦1,500 + ₦500/additional heavy item.
      -> Automatic vehicle requirement: TRICYCLE (Cargo Keke) / Van.
    - Custom Store Fee: If admin configured a custom delivery fee for a specific vendor stall, it overrides global base fee.
    """
    effective_base_fee = float(custom_store_fee) if custom_store_fee is not None and custom_store_fee > 0 else base_delivery_fee
    total_qty = sum(it.get("quantity", 1) for it in items_data)
    heavy_count = 0
    standard_count = 0
    
    heavy_keywords = ["cement", "block", "blocks", "steel", "rod", "iron", "sandcrete", "hectare", "land", "ton", "tonne", "generator", "machinery", "heavy machinery", "concrete"]
    
    for it in items_data:
        name_lower = (it.get("name") or it.get("product_name") or "").lower()
        desc_lower = (it.get("description") or "").lower()
        cat_id = (it.get("category_id") or "").lower()
        qty = it.get("quantity", 1)
        
        is_heavy = cat_id in ["cat-build", "cat-land"] or any(k in name_lower or k in desc_lower for k in heavy_keywords)
        
        if is_heavy:
            heavy_count += qty
        else:
            standard_count += qty
            
    heavy_surcharge = 0.0
    recommended_vehicle = "MOTORCYCLE"
    cargo_class = "STANDARD"
    
    if heavy_count > 0:
        cargo_class = "HEAVY_BULKY"
        recommended_vehicle = "TRICYCLE" # Requires Keke Cargo / Tricycle Van
        heavy_surcharge = 1500.0 + (max(0, heavy_count - 1) * 500.0)
    elif standard_count > 15:
        # Huge bulk quantity requires tricycle for physical capacity
        cargo_class = "HIGH_VOLUME_BULK"
        recommended_vehicle = "TRICYCLE"
        heavy_surcharge = 800.0
    else:
        # Standard multiple items/bags from same vendor (e.g. 5 bags of sugar, groceries) have 0% delivery increment!
        cargo_class = "SAME_VENDOR_COMBINED"
        recommended_vehicle = "MOTORCYCLE"
        heavy_surcharge = 0.0

    total_delivery_fee = effective_base_fee + heavy_surcharge
    
    return {
        "base_delivery_fee": effective_base_fee,
        "is_custom_vendor_fee": custom_store_fee is not None and custom_store_fee > 0,
        "heavy_surcharge": heavy_surcharge,
        "same_vendor_discount_applied": standard_count > 1 and heavy_count == 0,
        "total_delivery_fee": round(total_delivery_fee, 2),
        "recommended_vehicle": recommended_vehicle,
        "cargo_class": cargo_class,
        "heavy_count": heavy_count,
        "standard_count": standard_count,
        "total_quantity": total_qty
    }

@router.post("/recalculate-cart")
@router.post("/cart/recalculate")
def recalculate_cart(payload: dict):
    """
    Backend validation & recalculation of cart pricing with intelligent dynamic delivery fee.
    """
    items = payload.get("items", [])
    store_id = payload.get("store_id")
    if not items:
        return {"subtotal": 0.0, "delivery_fee": 0.0, "platform_fee": 0.0, "total_amount": 0.0, "items": [], "delivery_breakdown": {}}
        
    conn = get_db_connection()
    validated_items = []
    subtotal = 0.0
    
    for it in items:
        p_id = it.get("product_id")
        qty = max(1, int(it.get("quantity", 1)))
        prod = conn.execute("SELECT * FROM products WHERE id = ?", (p_id,)).fetchone()
        if prod and prod["status"] == "ACTIVE":
            unit_price = prod["discount_price"] if prod["discount_price"] and prod["discount_price"] > 0 else prod["price"]
            line_total = unit_price * qty
            subtotal += line_total
            validated_items.append({
                "product_id": prod["id"],
                "name": prod["name"],
                "store_id": prod["store_id"],
                "category_id": prod["category_id"],
                "description": prod["description"],
                "unit_price": unit_price,
                "quantity": qty,
                "total_price": line_total,
                "image_url": prod["image_url"],
                "stock_available": prod["stock_qty"]
            })
            if not store_id:
                store_id = prod["store_id"]
            
    # Base delivery fee from system settings or default
    base_fee_row = conn.execute("SELECT value FROM system_settings WHERE key = 'base_delivery_fee'").fetchone()
    base_delivery_fee = float(base_fee_row["value"]) if base_fee_row else 1200.0
    
    # Check custom store delivery fee
    custom_store_fee = None
    if store_id:
        st_row = conn.execute("SELECT custom_delivery_fee FROM stores WHERE id = ?", (store_id,)).fetchone()
        if st_row and st_row["custom_delivery_fee"]:
            custom_store_fee = float(st_row["custom_delivery_fee"])
            
    delivery_info = calculate_intelligent_delivery_fee(validated_items, base_delivery_fee, custom_store_fee)
    delivery_fee = delivery_info["total_delivery_fee"]
    platform_fee = 150.0
    total_amount = subtotal + delivery_fee + platform_fee
    
    conn.close()
    return {
        "subtotal": round(subtotal, 2),
        "delivery_fee": round(delivery_fee, 2),
        "platform_fee": round(platform_fee, 2),
        "total_amount": round(total_amount, 2),
        "items": validated_items,
        "delivery_breakdown": delivery_info
    }

@router.post("/orders")
@router.post("/checkout")
@router.post("/orders/checkout")
def place_order(req: CheckoutRequest, current_user: dict = Depends(get_current_user)):
    """
    Executes order checkout, validates inventory, reserves payment from Customer Wallet,
    and initializes the 11-stage order lifecycle with dynamic weight-based delivery fees.
    """
    if not req.items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cart cannot be empty.")
        
    conn = get_db_connection()
    store_row = conn.execute("SELECT s.*, v.id as vendor_id, v.commission_rate FROM stores s JOIN vendors v ON s.vendor_id = v.id WHERE s.id = ?", (req.store_id,)).fetchone()
    if not store_row or not store_row["is_active"]:
        conn.close()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Store is currently unavailable.")
    store = dict(store_row)
        
    # Recalculate accurately on backend
    subtotal = 0.0
    order_items_to_insert = []
    raw_items_for_calc = []
    
    for it in req.items:
        prod = conn.execute("SELECT * FROM products WHERE id = ? AND store_id = ?", (it.product_id, req.store_id)).fetchone()
        if not prod or prod["status"] != "ACTIVE":
            conn.close()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Product is no longer available.")
        if prod["stock_qty"] < it.quantity:
            conn.close()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Insufficient stock for '{prod['name']}'. Available: {prod['stock_qty']}")
            
        unit_price = prod["discount_price"] if prod["discount_price"] and prod["discount_price"] > 0 else prod["price"]
        line_total = unit_price * it.quantity
        subtotal += line_total
        
        item_dict = {
            "product_id": prod["id"],
            "product_name": prod["name"],
            "name": prod["name"],
            "category_id": prod["category_id"],
            "description": prod["description"],
            "unit_price": unit_price,
            "quantity": it.quantity,
            "total_price": line_total
        }
        order_items_to_insert.append(item_dict)
        raw_items_for_calc.append(item_dict)
        
    base_fee_row = conn.execute("SELECT value FROM system_settings WHERE key = 'base_delivery_fee'").fetchone()
    base_delivery_fee = float(base_fee_row["value"]) if base_fee_row else 1200.0
    custom_store_fee = float(store["custom_delivery_fee"]) if store.get("custom_delivery_fee") else None
    delivery_calc = calculate_intelligent_delivery_fee(raw_items_for_calc, base_delivery_fee, custom_store_fee)
    delivery_fee = delivery_calc["total_delivery_fee"]
    platform_fee = 150.0
    total_amount = subtotal + delivery_fee + platform_fee
    
    # Check Customer Wallet Balance
    wallet = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (current_user["id"],)).fetchone()
    if not wallet or wallet["balance"] < total_amount:
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail=f"Insufficient wallet funds. Required: ₦{total_amount:,.2f}, Current Balance: ₦{wallet['balance'] if wallet else 0.0:,.2f}. Please top up your wallet."
        )
        
    order_id = str(uuid.uuid4())
    order_ref = f"RP-ORD-{secrets.randbelow(900000) + 100000}"
    pod_otp = f"{secrets.randbelow(9000) + 1000}" # 4-digit security code
    now_iso = datetime.now(timezone.utc).isoformat()
    
    # 1. Payment Processing (Flutterwave vs RP Wallet)
    is_flutterwave = (req.payment_method or "").upper() in ["FLUTTERWAVE", "CARD", "FLW_DEMO"]
    
    if is_flutterwave:
        # Paid via Flutterwave Gateway (Simulated Instant Clearance)
        payment_method_label = "FLUTTERWAVE"
    else:
        # Paid via RushingPoint Customer Wallet
        payment_method_label = "RP_WALLET"
        wallet = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (current_user["id"],)).fetchone()
        if not wallet or wallet["balance"] < total_amount:
            conn.close()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail=f"Insufficient wallet funds. Required: ₦{total_amount:,.2f}, Current Balance: ₦{wallet['balance'] if wallet else 0.0:,.2f}. Please top up or pay with Flutterwave."
            )
        new_balance = wallet["balance"] - total_amount
        conn.execute("UPDATE wallets SET balance = ?, updated_at = ? WHERE id = ?", (new_balance, now_iso, wallet["id"]))
        conn.execute("""
            INSERT INTO wallet_transactions (id, wallet_id, user_id, reference, type, amount, description, running_balance, created_at)
            VALUES (?, ?, ?, ?, 'DEBIT', ?, ?, ?, ?)
        """, (str(uuid.uuid4()), wallet["id"], current_user["id"], f"RP-TXN-PAY-{order_ref}", total_amount, f"Payment for Order {order_ref}", new_balance, now_iso))

    # 2. INSTANT VENDOR PAYOUT (Vendor gets 100% of their assigned product price without losing commission)
    vendor = conn.execute("SELECT user_id FROM vendors WHERE id = ?", (store["vendor_id"],)).fetchone()
    if vendor:
        v_wallet = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (vendor["user_id"],)).fetchone()
        if not v_wallet:
            v_wallet_id = str(uuid.uuid4())
            conn.execute("INSERT INTO wallets (id, user_id, balance, currency, updated_at) VALUES (?, ?, ?, 'NGN', ?)", (v_wallet_id, vendor["user_id"], subtotal, now_iso))
            v_new_bal = subtotal
        else:
            v_wallet_id = v_wallet["id"]
            v_new_bal = v_wallet["balance"] + subtotal
            conn.execute("UPDATE wallets SET balance = ?, updated_at = ? WHERE id = ?", (v_new_bal, now_iso, v_wallet["id"]))
            
        conn.execute("""
            INSERT INTO wallet_transactions (id, wallet_id, user_id, reference, type, amount, description, running_balance, created_at)
            VALUES (?, ?, ?, ?, 'CREDIT', ?, ?, ?, ?)
        """, (str(uuid.uuid4()), v_wallet_id, vendor["user_id"], f"RP-TXN-VND-{order_ref}", subtotal, f"Instant Product Sale Revenue for Order {order_ref} (100% Product Price)", v_new_bal, now_iso))

    # 3. DELIVERY MONEY GOES TO ADMIN ESCROW WALLET UNTIL DELIVERY
    admin_user = conn.execute("SELECT id FROM users WHERE account_type = 'ADMIN' LIMIT 1").fetchone()
    delivery_holding = delivery_fee + platform_fee
    if admin_user:
        adm_wallet = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (admin_user["id"],)).fetchone()
        if adm_wallet:
            adm_new_bal = adm_wallet["balance"] + delivery_holding
            conn.execute("UPDATE wallets SET balance = ?, updated_at = ? WHERE id = ?", (adm_new_bal, now_iso, adm_wallet["id"]))
            conn.execute("""
                INSERT INTO wallet_transactions (id, wallet_id, user_id, reference, type, amount, description, running_balance, created_at)
                VALUES (?, ?, ?, ?, 'CREDIT', ?, ?, ?, ?)
            """, (str(uuid.uuid4()), adm_wallet["id"], admin_user["id"], f"RP-TXN-ADM-ESCROW-{order_ref}", delivery_holding, f"Delivery Fee & Platform Escrow for Order {order_ref}", adm_new_bal, now_iso))

    # 4. Create Order Record
    conn.execute("""
        INSERT INTO orders (id, order_ref, customer_id, store_id, subtotal, delivery_fee, platform_fee, total_amount, delivery_address, delivery_lat, delivery_lng, customer_phone, payment_method, payment_status, status, pod_otp, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PAID', 'NEW', ?, ?, ?)
    """, (
        order_id,
        order_ref,
        current_user["id"],
        req.store_id,
        subtotal,
        delivery_fee,
        platform_fee,
        total_amount,
        req.delivery_address,
        req.delivery_lat or 6.5244,
        req.delivery_lng or 3.3792,
        req.customer_phone or (current_user["phone"] if "phone" in current_user.keys() else ""),
        payment_method_label,
        pod_otp,
        now_iso,
        now_iso
    ))
    
    # 5. Insert Order Items & Deduct Stock
    for itm in order_items_to_insert:
        conn.execute("""
            INSERT INTO order_items (id, order_id, product_id, product_name, unit_price, quantity, total_price)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (str(uuid.uuid4()), order_id, itm["product_id"], itm["product_name"], itm["unit_price"], itm["quantity"], itm["total_price"]))
        
        conn.execute("""
            UPDATE products
            SET stock_qty = stock_qty - ?,
                updated_at = ?
            WHERE id = ?
        """, (itm["quantity"], now_iso, itm["product_id"]))
        
    # 6. Record Initial Order Timeline
    conn.execute("""
        INSERT INTO order_timeline (id, order_id, from_status, to_status, actor_id, actor_role, notes, timestamp)
        VALUES (?, ?, NULL, 'NEW', ?, 'Customer', ?, ?)
    """, (str(uuid.uuid4()), order_id, current_user["id"], f"Order placed and paid via {payment_method_label}. Vendor credited 100% product value (₦{subtotal:,.2f}). Delivery fee held in Admin Escrow.", now_iso))
    
    # 7. Initialize 4-Way Financial Settlement Ledger
    rider_split = round(delivery_fee * 0.80, 2) # 80% of delivery fee for partner riders
    platform_net = round(total_amount - subtotal - rider_split, 2)
    
    settlement_id = str(uuid.uuid4())
    settlement_ref = f"RP-SETTLE-{secrets.randbelow(900000)+100000}"
    conn.execute("""
        INSERT INTO financial_settlements (id, settlement_ref, order_id, customer_id, vendor_id, rider_id, total_customer_paid, vendor_amount, rider_earnings, platform_revenue, status, created_at)
        VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 'ESCROW_HELD', ?)
    """, (
        settlement_id,
        settlement_ref,
        order_id,
        current_user["id"],
        store["vendor_id"],
        total_amount,
        subtotal,
        rider_split,
        platform_net,
        now_iso
    ))
    
    conn.commit()
    conn.close()
    
    return {
        "success": True,
        "message": f"Order {order_ref} placed successfully via {payment_method_label}!",
        "order_id": order_id,
        "order_ref": order_ref,
        "total_amount": total_amount,
        "vendor_credited": subtotal,
        "delivery_held_by_admin": delivery_holding,
        "payment_gateway": payment_method_label,
        "pod_otp": pod_otp,
        "status": "NEW"
    }
