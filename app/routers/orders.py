from app.routers.notifications import push_system_notification
import uuid
import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, status
from app.database import get_db_connection
from app.security import get_current_user, require_role, log_audit
from app.models import OrderStatusUpdate, PODVerificationRequest

router = APIRouter(prefix="/api/orders", tags=["Order Lifecycle & State Machine"])

VALID_TRANSITIONS = {
    "NEW": ["CONFIRMED", "CANCELLED"],
    "CONFIRMED": ["ASSIGNED", "CANCELLED"],
    "ASSIGNED": ["PICKED_UP", "CANCELLED", "RESCHEDULED"],
    "PICKED_UP": ["IN_TRANSIT", "CANCELLED", "FAILED"],
    "IN_TRANSIT": ["ARRIVED", "DELAYED_PROBLEM", "FAILED", "RETURNED"],
    "ARRIVED": ["DELIVERED", "FAILED", "RETURNED"],
    "DELIVERED": [],
    "CANCELLED": [],
    "FAILED": ["RESCHEDULED", "RETURNED"],
    "RETURNED": [],
    "RESCHEDULED": ["ASSIGNED", "CONFIRMED"]
}

@router.get("/")
def list_orders(
    status: str = None, 
    store_id: str = None, 
    rider_id: str = None, 
    customer_id: str = None,
    current_user: dict = Depends(get_current_user)
):
    conn = get_db_connection()
    query = """
        SELECT o.*, s.store_name, s.address as store_address, u.full_name as customer_name, r.rider_ref, ru.full_name as rider_name
        FROM orders o
        JOIN stores s ON o.store_id = s.id
        JOIN users u ON o.customer_id = u.id
        LEFT JOIN riders r ON o.rider_id = r.id
        LEFT JOIN users ru ON r.user_id = ru.id
        WHERE 1=1
    """
    params = []
    
    # Scoping by user role
    if current_user["account_type"] == "CUSTOMER":
        query += " AND o.customer_id = ?"
        params.append(current_user["id"])
    elif current_user["account_type"] == "VENDOR":
        v = conn.execute("SELECT id FROM vendors WHERE user_id = ?", (current_user["id"],)).fetchone()
        s = conn.execute("SELECT id FROM stores WHERE vendor_id = ?", (v["id"],)).fetchone() if v else None
        if s:
            query += " AND o.store_id = ?"
            params.append(s["id"])
    elif current_user["account_type"] == "RIDER":
        r = conn.execute("SELECT id FROM riders WHERE user_id = ?", (current_user["id"],)).fetchone()
        if r:
            query += " AND o.rider_id = ?"
            params.append(r["id"])
            
    # Explicit filters
    if status:
        query += " AND o.status = ?"
        params.append(status)
    if store_id:
        query += " AND o.store_id = ?"
        params.append(store_id)
        
    query += " ORDER BY o.created_at DESC"
    orders = conn.execute(query, tuple(params)).fetchall()
    
    user_type = current_user.get("account_type")
    result = []
    for ord_row in orders:
        o_dict = dict(ord_row)
        items = conn.execute("SELECT * FROM order_items WHERE order_id = ?", (ord_row["id"],)).fetchall()
        o_dict["items"] = [dict(it) for it in items]
        if user_type == "VENDOR":
            # Mask customer phone to prevent off-platform harassment/circumvention
            if o_dict.get("customer_phone"):
                raw_phone = o_dict["customer_phone"]
                o_dict["customer_phone"] = f"{raw_phone[:4]}****{raw_phone[-3:]}" if len(raw_phone) >= 7 else "****"
            o_dict["customer_contact_restricted"] = True
        result.append(o_dict)
        
    conn.close()
    return {"orders": result}

@router.get("/{order_id}")
def get_order_details(order_id: str, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    ord_row = conn.execute("""
        SELECT o.*, s.store_name, s.address as store_address, u.full_name as customer_name, u.email as customer_email,
               r.rider_ref, r.vehicle_type, r.plate_number, ru.full_name as rider_name, ru.phone as rider_phone
        FROM orders o
        JOIN stores s ON o.store_id = s.id
        JOIN users u ON o.customer_id = u.id
        LEFT JOIN riders r ON o.rider_id = r.id
        LEFT JOIN users ru ON r.user_id = ru.id
        WHERE o.id = ? OR o.order_ref = ?
    """, (order_id, order_id)).fetchone()
    
    if not ord_row:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")
        
    items = conn.execute("SELECT * FROM order_items WHERE order_id = ?", (ord_row["id"],)).fetchall()
    timeline = conn.execute("SELECT * FROM order_timeline WHERE order_id = ? ORDER BY timestamp ASC", (ord_row["id"],)).fetchall()
    settlement = conn.execute("SELECT * FROM financial_settlements WHERE order_id = ?", (ord_row["id"],)).fetchone()
    
    # Read customer-rider direct call policy setting
    call_setting_row = conn.execute("SELECT value FROM system_settings WHERE key = 'allow_customer_call_rider'").fetchone()
    allow_customer_call_rider = (call_setting_row["value"] == "true") if call_setting_row else False
    
    conn.close()
    
    order_data = dict(ord_row)
    user_type = current_user.get("account_type")
    order_data["allow_customer_call_rider"] = allow_customer_call_rider
    order_data["dispatch_support_phone"] = "+2348007874764" # 0800-RUSHPOINT
    
    # Strict Privacy Enforcement:
    # 1. Vendor cannot see customer phone or contact them directly
    if user_type == "VENDOR":
        if order_data.get("customer_phone"):
            raw_phone = order_data["customer_phone"]
            order_data["customer_phone"] = f"{raw_phone[:4]}****{raw_phone[-3:]}" if len(raw_phone) >= 7 else "****"
        order_data["customer_contact_restricted"] = True
        
    # 2. Customer cannot see rider phone unless Admin has explicitly enabled allow_customer_call_rider
    if user_type == "CUSTOMER":
        if not allow_customer_call_rider:
            order_data["rider_phone"] = None
            order_data["rider_call_restricted"] = True
    
    return {
        "order": order_data,
        "items": [dict(i) for i in items],
        "timeline": [dict(t) for t in timeline],
        "settlement": dict(settlement) if settlement else None
    }

@router.post("/{order_id}/transition")
def transition_order_status(order_id: str, req: OrderStatusUpdate, current_user: dict = Depends(get_current_user)):
    """
    Strict state-machine status progression with complete timeline recording.
    """
    conn = get_db_connection()
    ord_row = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    if not ord_row:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")
        
    current_status = ord_row["status"]
    new_status = req.status.upper()
    
    # Check if admin override or valid transition
    is_admin = current_user["account_type"] == "ADMIN" or current_user.get("role_name") in ["Super Admin", "Operations Manager", "Dispatcher"]
    valid_next = VALID_TRANSITIONS.get(current_status, [])
    
    if new_status not in valid_next and not is_admin:
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid state transition: Cannot move order from '{current_status}' to '{new_status}'. Allowed next states: {', '.join(valid_next)}"
        )
        
    now_iso = datetime.now(timezone.utc).isoformat()
    
    # Handle CANCELLATION & REFUND
    if new_status == "CANCELLED" and current_status != "CANCELLED":
        # Refund Customer Wallet
        wallet = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (ord_row["customer_id"],)).fetchone()
        if wallet:
            new_bal = wallet["balance"] + ord_row["total_amount"]
            conn.execute("UPDATE wallets SET balance = ?, updated_at = ? WHERE id = ?", (new_bal, now_iso, wallet["id"]))
            conn.execute("""
                INSERT INTO wallet_transactions (id, wallet_id, user_id, reference, type, amount, description, running_balance, created_at)
                VALUES (?, ?, ?, ?, 'REFUND', ?, ?, ?, ?)
            """, (str(uuid.uuid4()), wallet["id"], ord_row["customer_id"], f"RP-TXN-REFUND-{ord_row['order_ref']}", ord_row["total_amount"], f"Refund for Cancelled Order {ord_row['order_ref']}", new_bal, now_iso))
            
        # Reverse Financial Settlement
        conn.execute("UPDATE financial_settlements SET status = 'REFUNDED_REVERSED' WHERE order_id = ?", (order_id,))
        
        # Restore Product Stock
        items = conn.execute("SELECT product_id, quantity FROM order_items WHERE order_id = ?", (order_id,)).fetchall()
        for itm in items:
            conn.execute("UPDATE products SET stock_qty = stock_qty + ?, updated_at = ? WHERE id = ?", (itm["quantity"], now_iso, itm["product_id"]))
            
    # Update Order Status
    conn.execute("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?", (new_status, now_iso, order_id))
    
    # Record Timeline Event
    actor_label = current_user.get("role_name") or current_user["account_type"]
    conn.execute("""
        INSERT INTO order_timeline (id, order_id, from_status, to_status, actor_id, actor_role, notes, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (str(uuid.uuid4()), order_id, current_status, new_status, current_user["id"], actor_label, req.notes or f"Status changed to {new_status}", now_iso))
    
    # Push Real-Time Audio Notifications on Status Change
    try:
        sound = "arrival" if "ARRIVED" in new_status else ("success" if new_status == "DELIVERED" else "chime")
        status_msg = {
            "CONFIRMED": "Your order has been confirmed by the store.",
            "ASSIGNED": "A courier has been assigned to your order.",
            "PICKED_UP": "Rider has picked up your package from the store.",
            "IN_TRANSIT": "Your order is now in transit with the rider.",
            "ARRIVED": "Rider has arrived at the destination! Please prepare your 4-digit PIN.",
            "DELIVERED": "Order delivered successfully! Thank you for choosing RushPoint.",
            "CANCELLED": "Order was cancelled and payment refunded to your wallet."
        }.get(new_status, f"Order status is now {new_status}")

        push_system_notification(
            conn=conn,
            user_id=ord_row["customer_id"],
            title=f"📦 Order {new_status.replace('_', ' ')}",
            message=status_msg,
            category="ORDER",
            sound_type=sound,
            order_ref=ord_row["order_ref"]
        )
    except Exception:
        pass

    conn.commit()
    conn.close()
    
    return {"success": True, "message": f"Order {ord_row['order_ref']} status updated to {new_status}."}

@router.post("/{order_id}/verify-delivery")
def verify_proof_of_delivery(order_id: str, pod: PODVerificationRequest, current_user: dict = Depends(get_current_user)):
    """
    Rider / Dispatcher completes delivery with OTP verification, signature, photo, and triggers automated financial clearing.
    """
    conn = get_db_connection()
    ord_row = conn.execute("SELECT o.*, s.vendor_id FROM orders o JOIN stores s ON o.store_id = s.id WHERE o.id = ?", (order_id,)).fetchone()
    if not ord_row:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")
        
    if ord_row["status"] == "DELIVERED":
        conn.close()
        return {"success": True, "message": "Order is already marked as delivered."}
        
    # Verify OTP if provided
    if pod.otp and pod.otp.strip() != ord_row["pod_otp"]:
        conn.close()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect 4-digit Delivery OTP.")
        
    now_iso = datetime.now(timezone.utc).isoformat()
    
    # 1. Update Order POD details
    conn.execute("""
        UPDATE orders
        SET status = 'DELIVERED',
            pod_signature = ?,
            pod_photo_url = ?,
            pod_notes = ?,
            pod_verified_at = ?,
            updated_at = ?
        WHERE id = ?
    """, (pod.signature, pod.photo_url, pod.notes, now_iso, now_iso, order_id))
    
    # 2. Record Timeline Event
    conn.execute("""
        INSERT INTO order_timeline (id, order_id, from_status, to_status, actor_id, actor_role, notes, timestamp)
        VALUES (?, ?, ?, 'DELIVERED', ?, 'Rider', 'Proof of delivery verified and order successfully completed.', ?)
    """, (str(uuid.uuid4()), order_id, ord_row["status"], current_user["id"], now_iso))
    
    # 3. Clear Financial Settlement from ESCROW to CLEARED
    settlement = conn.execute("SELECT * FROM financial_settlements WHERE order_id = ?", (order_id,)).fetchone()
    if settlement and settlement["status"] == "ESCROW_HELD":
        conn.execute("UPDATE financial_settlements SET status = 'CLEARED' WHERE id = ?", (settlement["id"],))
        
        # Credit Rider Wallet for delivery trip
        if ord_row["rider_id"]:
            rider = conn.execute("SELECT r.*, u.id as user_id FROM riders r JOIN users u ON r.user_id = u.id WHERE r.id = ?", (ord_row["rider_id"],)).fetchone()
            if rider:
                # Credit Rider Wallet
                r_wallet = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (rider["user_id"],)).fetchone()
                if r_wallet:
                    new_r_bal = r_wallet["balance"] + settlement["rider_earnings"]
                    conn.execute("UPDATE wallets SET balance = ?, updated_at = ? WHERE id = ?", (new_r_bal, now_iso, r_wallet["id"]))
                    conn.execute("""
                        INSERT INTO wallet_transactions (id, wallet_id, user_id, reference, type, amount, description, running_balance, created_at)
                        VALUES (?, ?, ?, ?, 'CREDIT', ?, ?, ?, ?)
                    """, (str(uuid.uuid4()), r_wallet["id"], rider["user_id"], f"RP-TXN-RDR-{ord_row['order_ref']}", settlement["rider_earnings"], f"Delivery Compensation for Completed Order {ord_row['order_ref']} ({rider['rider_type']})", new_r_bal, now_iso))
                
                # Deduct Rider Earnings from Admin Escrow Holding
                admin_user = conn.execute("SELECT id FROM users WHERE account_type = 'ADMIN' LIMIT 1").fetchone()
                if admin_user:
                    adm_wallet = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (admin_user["id"],)).fetchone()
                    if adm_wallet:
                        adm_new_bal = adm_wallet["balance"] - settlement["rider_earnings"]
                        conn.execute("UPDATE wallets SET balance = ?, updated_at = ? WHERE id = ?", (adm_new_bal, now_iso, adm_wallet["id"]))
                        conn.execute("""
                            INSERT INTO wallet_transactions (id, wallet_id, user_id, reference, type, amount, description, running_balance, created_at)
                            VALUES (?, ?, ?, ?, 'DEBIT', ?, ?, ?, ?)
                        """, (str(uuid.uuid4()), adm_wallet["id"], admin_user["id"], f"RP-TXN-ADM-RIDER-PAY-{ord_row['order_ref']}", settlement["rider_earnings"], f"Rider Payout Disbursed from Escrow for Order {ord_row['order_ref']}", adm_new_bal, now_iso))

                # Free up rider status to AVAILABLE
                conn.execute("""
                    UPDATE riders
                    SET operational_status = 'AVAILABLE',
                        total_deliveries = total_deliveries + 1,
                        wallet_balance = wallet_balance + ?,
                        updated_at = ?
                    WHERE id = ?
                """, (settlement["rider_earnings"], now_iso, ord_row["rider_id"]))
            
    conn.commit()
    conn.close()
    
    return {
        "success": True,
        "message": f"Order {ord_row['order_ref']} successfully verified as DELIVERED. Rider earnings cleared to rider wallet.",
        "status": "DELIVERED"
    }

@router.post("/{order_id}/refund")
def process_order_refund(order_id: str, payload: dict = {}, current_user: dict = Depends(require_role(["ADMIN", "Super Admin", "Operations Manager", "Finance Officer", "Customer Support"]))):
    """
    Admin accepts and processes full refund for unavailable products or cancelled orders.
    Refunding directly to customer wallet from the holding escrow / vendor.
    """
    reason = payload.get("reason", "Product unavailable or customer cancellation")
    conn = get_db_connection()
    ord_row = conn.execute("SELECT o.*, s.vendor_id FROM orders o JOIN stores s ON o.store_id = s.id WHERE o.id = ? OR o.order_ref = ?", (order_id, order_id)).fetchone()
    if not ord_row:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")
        
    if ord_row["status"] in ["CANCELLED", "REFUNDED", "CANCELLED_REFUNDED"]:
        conn.close()
        return {"success": True, "message": "Order is already cancelled/refunded."}
        
    now_iso = datetime.now(timezone.utc).isoformat()
    
    # 1. Refund Customer Wallet
    cust_wallet = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (ord_row["customer_id"],)).fetchone()
    if cust_wallet:
        cust_new_bal = cust_wallet["balance"] + ord_row["total_amount"]
        conn.execute("UPDATE wallets SET balance = ?, updated_at = ? WHERE id = ?", (cust_new_bal, now_iso, cust_wallet["id"]))
        conn.execute("""
            INSERT INTO wallet_transactions (id, wallet_id, user_id, reference, type, amount, description, running_balance, created_at)
            VALUES (?, ?, ?, ?, 'REFUND', ?, ?, ?, ?)
        """, (str(uuid.uuid4()), cust_wallet["id"], ord_row["customer_id"], f"RP-TXN-REFUND-{ord_row['order_ref']}", ord_row["total_amount"], f"Full Refund for Order {ord_row['order_ref']}: {reason}", cust_new_bal, now_iso))
        
    # 2. Reverse Vendor Instant Credit (if order was already paid)
    vendor = conn.execute("SELECT user_id FROM vendors WHERE id = ?", (ord_row["vendor_id"],)).fetchone()
    if vendor:
        v_wallet = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (vendor["user_id"],)).fetchone()
        if v_wallet:
            v_new_bal = v_wallet["balance"] - ord_row["subtotal"]
            conn.execute("UPDATE wallets SET balance = ?, updated_at = ? WHERE id = ?", (v_new_bal, now_iso, v_wallet["id"]))
            conn.execute("""
                INSERT INTO wallet_transactions (id, wallet_id, user_id, reference, type, amount, description, running_balance, created_at)
                VALUES (?, ?, ?, ?, 'DEBIT', ?, ?, ?, ?)
            """, (str(uuid.uuid4()), v_wallet["id"], vendor["user_id"], f"RP-TXN-VND-REV-{ord_row['order_ref']}", ord_row["subtotal"], f"Product Reversal for Refunded Order {ord_row['order_ref']}", v_new_bal, now_iso))

    # 3. Reverse Admin Delivery Escrow
    admin_user = conn.execute("SELECT id FROM users WHERE account_type = 'ADMIN' LIMIT 1").fetchone()
    delivery_holding = ord_row["delivery_fee"] + ord_row["platform_fee"]
    if admin_user:
        adm_wallet = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (admin_user["id"],)).fetchone()
        if adm_wallet:
            adm_new_bal = adm_wallet["balance"] - delivery_holding
            conn.execute("UPDATE wallets SET balance = ?, updated_at = ? WHERE id = ?", (adm_new_bal, now_iso, adm_wallet["id"]))
            conn.execute("""
                INSERT INTO wallet_transactions (id, wallet_id, user_id, reference, type, amount, description, running_balance, created_at)
                VALUES (?, ?, ?, ?, 'DEBIT', ?, ?, ?, ?)
            """, (str(uuid.uuid4()), adm_wallet["id"], admin_user["id"], f"RP-TXN-ADM-REV-{ord_row['order_ref']}", delivery_holding, f"Escrow Delivery Reversal for Refunded Order {ord_row['order_ref']}", adm_new_bal, now_iso))

    # 4. Update Financial Settlement Status
    conn.execute("UPDATE financial_settlements SET status = 'REFUNDED_REVERSED' WHERE order_id = ?", (ord_row["id"],))

    # 5. Restore Product Stock Inventory
    items = conn.execute("SELECT product_id, quantity FROM order_items WHERE order_id = ?", (ord_row["id"],)).fetchall()
    for itm in items:
        conn.execute("UPDATE products SET stock_qty = stock_qty + ?, updated_at = ? WHERE id = ?", (itm["quantity"], now_iso, itm["product_id"]))

    # 6. Update Order Status
    conn.execute("UPDATE orders SET status = 'CANCELLED_REFUNDED', updated_at = ? WHERE id = ?", (now_iso, ord_row["id"]))

    # 7. Record Timeline Event
    conn.execute("""
        INSERT INTO order_timeline (id, order_id, from_status, to_status, actor_id, actor_role, notes, timestamp)
        VALUES (?, ?, ?, 'CANCELLED_REFUNDED', ?, ?, ?, ?)
    """, (str(uuid.uuid4()), ord_row["id"], ord_row["status"], current_user["id"], current_user.get("role_name", "Admin"), f"Order refunded by Admin: {reason}. Customer credited with ₦{ord_row['total_amount']:,.2f}.", now_iso))

    conn.commit()
    conn.close()

    return {
        "success": True,
        "message": f"Order {ord_row['order_ref']} successfully refunded! ₦{ord_row['total_amount']:,.2f} refunded to customer.",
        "status": "CANCELLED_REFUNDED",
        "refund_amount": ord_row["total_amount"]
    }


@router.post("/{order_id}/vendor-confirm")
def vendor_confirm_incoming_order(order_id: str, payload: dict = {}, current_user: dict = Depends(get_current_user)):
    """
    Vendor accepts an incoming call/order notification from the web app.
    Sets order status NEW → CONFIRMED so the kitchen can start preparing.
    Used by mobile-app.js dismissIncomingCall() when vendor taps Accept.
    """
    conn = get_db_connection()
    ord_row = conn.execute(
        "SELECT o.*, s.vendor_id FROM orders o JOIN stores s ON o.store_id = s.id WHERE o.id = ? OR o.order_ref = ?",
        (order_id, order_id)
    ).fetchone()

    if not ord_row:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")

    if ord_row["status"] not in ["NEW", "PENDING"]:
        conn.close()
        return {"success": True, "message": "Order already confirmed.", "status": ord_row["status"]}

    now_iso = datetime.now(timezone.utc).isoformat()
    conn.execute("UPDATE orders SET status = 'CONFIRMED', updated_at = ? WHERE id = ?", (now_iso, ord_row["id"]))
    conn.execute("""
        INSERT INTO order_timeline (id, order_id, from_status, to_status, actor_id, actor_role, notes, timestamp)
        VALUES (?, ?, 'NEW', 'CONFIRMED', ?, 'Vendor', 'Vendor accepted incoming order notification', ?)
    """, (str(uuid.uuid4()), ord_row["id"], current_user["id"], now_iso))
    conn.commit()
    conn.close()

    return {"success": True, "status": "CONFIRMED", "message": "Order confirmed! Start preparing."}


@router.post("/{order_id}/cancel")
@router.post("/{order_id}/refund")
@router.post("/{order_id}/vendor-cancel")
def vendor_cancel_and_refund_order(order_id: str, payload: dict = {}, current_user: dict = Depends(get_current_user)):
    """
    Vendor cancels an order (even after confirmed) due to out of stock,
    automatically triggering an instant 100% full refund to the customer's wallet.
    """
    reason = payload.get("reason", "Item out of stock at vendor stall")
    conn = get_db_connection()
    ord_row = conn.execute("SELECT o.*, s.vendor_id FROM orders o JOIN stores s ON o.store_id = s.id WHERE o.id = ? OR o.order_ref = ?", (order_id, order_id)).fetchone()
    if not ord_row:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")
        
    if ord_row["status"] in ["CANCELLED", "REFUNDED", "CANCELLED_REFUNDED"]:
        conn.close()
        return {"success": True, "message": "Order is already cancelled/refunded."}
        
    now_iso = datetime.now(timezone.utc).isoformat()
    
    # 1. Full Refund to Customer Wallet
    cust_wallet = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (ord_row["customer_id"],)).fetchone()
    if cust_wallet:
        cust_new_bal = cust_wallet["balance"] + ord_row["total_amount"]
        conn.execute("UPDATE wallets SET balance = ?, updated_at = ? WHERE id = ?", (cust_new_bal, now_iso, cust_wallet["id"]))
        conn.execute("""
            INSERT INTO wallet_transactions (id, wallet_id, user_id, reference, type, amount, description, running_balance, created_at)
            VALUES (?, ?, ?, ?, 'REFUND', ?, ?, ?, ?)
        """, (str(uuid.uuid4()), cust_wallet["id"], ord_row["customer_id"], f"RP-TXN-REFUND-VND-{ord_row['order_ref']}", ord_row["total_amount"], f"Instant Refund (Out of Stock): {ord_row['order_ref']}", cust_new_bal, now_iso))
        
    # 2. Reverse Vendor Instant Credit
    vendor = conn.execute("SELECT user_id FROM vendors WHERE id = ?", (ord_row["vendor_id"],)).fetchone()
    if vendor:
        v_wallet = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (vendor["user_id"],)).fetchone()
        if v_wallet:
            v_new_bal = v_wallet["balance"] - ord_row["subtotal"]
            conn.execute("UPDATE wallets SET balance = ?, updated_at = ? WHERE id = ?", (v_new_bal, now_iso, v_wallet["id"]))
            conn.execute("""
                INSERT INTO wallet_transactions (id, wallet_id, user_id, reference, type, amount, description, running_balance, created_at)
                VALUES (?, ?, ?, ?, 'DEBIT', ?, ?, ?, ?)
            """, (str(uuid.uuid4()), v_wallet["id"], vendor["user_id"], f"RP-TXN-VND-REV-{ord_row['order_ref']}", ord_row["subtotal"], f"Reversal for Out of Stock Cancelled Order {ord_row['order_ref']}", v_new_bal, now_iso))

    # 3. Reverse Admin Delivery Escrow
    admin_user = conn.execute("SELECT id FROM users WHERE account_type = 'ADMIN' LIMIT 1").fetchone()
    delivery_holding = ord_row["delivery_fee"] + ord_row["platform_fee"]
    if admin_user:
        adm_wallet = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (admin_user["id"],)).fetchone()
        if adm_wallet:
            adm_new_bal = adm_wallet["balance"] - delivery_holding
            conn.execute("UPDATE wallets SET balance = ?, updated_at = ? WHERE id = ?", (adm_new_bal, now_iso, adm_wallet["id"]))
            conn.execute("""
                INSERT INTO wallet_transactions (id, wallet_id, user_id, reference, type, amount, description, running_balance, created_at)
                VALUES (?, ?, ?, ?, 'DEBIT', ?, ?, ?, ?)
            """, (str(uuid.uuid4()), adm_wallet["id"], admin_user["id"], f"RP-TXN-ADM-REV-{ord_row['order_ref']}", delivery_holding, f"Escrow Delivery Reversal for Cancelled Order {ord_row['order_ref']}", adm_new_bal, now_iso))

    # 4. Update Financial Settlement Status
    conn.execute("UPDATE financial_settlements SET status = 'REFUNDED_REVERSED' WHERE order_id = ?", (ord_row["id"],))

    # 5. Free up any assigned rider
    if ord_row["rider_id"]:
        conn.execute("UPDATE riders SET operational_status = 'AVAILABLE', updated_at = ? WHERE id = ?", (now_iso, ord_row["rider_id"]))

    # 6. Update Order Status
    conn.execute("UPDATE orders SET status = 'CANCELLED_REFUNDED', updated_at = ? WHERE id = ?", (now_iso, ord_row["id"]))

    # 7. Record Timeline Event
    conn.execute("""
        INSERT INTO order_timeline (id, order_id, from_status, to_status, actor_id, actor_role, notes, timestamp)
        VALUES (?, ?, ?, 'CANCELLED_REFUNDED', ?, 'Vendor', ?, ?)
    """, (str(uuid.uuid4()), ord_row["id"], ord_row["status"], current_user["id"], f"Cancelled by Vendor (Out of Stock): {reason}. Customer instantly refunded ₦{ord_row['total_amount']:,.2f}.", now_iso))

    conn.commit()
    conn.close()

    return {
        "success": True,
        "message": f"Order {ord_row['order_ref']} cancelled. ₦{ord_row['total_amount']:,.2f} instantly refunded to customer wallet.",
        "status": "CANCELLED_REFUNDED"
    }

@router.post("/vendor/bulk-confirm")
def vendor_bulk_confirm_orders(payload: dict, current_user: dict = Depends(get_current_user)):
    order_ids = payload.get("order_ids", [])
    if not order_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No order IDs provided.")
    
    conn = get_db_connection()
    now_iso = datetime.now(timezone.utc).isoformat()
    confirmed_count = 0
    
    for oid in order_ids:
        ord_row = conn.execute("SELECT * FROM orders WHERE id = ? AND status = 'NEW'", (oid,)).fetchone()
        if ord_row:
            conn.execute("UPDATE orders SET status = 'CONFIRMED', updated_at = ? WHERE id = ?", (now_iso, oid))
            conn.execute("""
                INSERT INTO order_timeline (id, order_id, from_status, to_status, actor_id, actor_role, notes, timestamp)
                VALUES (?, ?, 'NEW', 'CONFIRMED', ?, 'Vendor', 'Confirmed and preparation started by Vendor in bulk', ?)
            """, (str(uuid.uuid4()), oid, current_user["id"], now_iso))
            confirmed_count += 1
            
    conn.commit()
    conn.close()
    return {"success": True, "confirmed_count": confirmed_count, "message": f"{confirmed_count} order(s) confirmed and ready for dispatch."}

@router.post("/vendor/bulk-cancel")
def vendor_bulk_cancel_orders(payload: dict, current_user: dict = Depends(get_current_user)):
    order_ids = payload.get("order_ids", [])
    reason = payload.get("reason", "Bulk out-of-stock cancellation by vendor")
    if not order_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No order IDs provided.")
    
    conn = get_db_connection()
    now_iso = datetime.now(timezone.utc).isoformat()
    cancelled_count = 0
    
    admin_user = conn.execute("SELECT id FROM users WHERE account_type = 'ADMIN' LIMIT 1").fetchone()
    
    for oid in order_ids:
        ord_row = conn.execute("SELECT o.*, s.vendor_id FROM orders o JOIN stores s ON o.store_id = s.id WHERE o.id = ? AND o.status NOT IN ('DELIVERED', 'CANCELLED_REFUNDED')", (oid,)).fetchone()
        if ord_row:
            # 1. Customer refund
            cust_wallet = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (ord_row["customer_id"],)).fetchone()
            if cust_wallet:
                cust_new_bal = cust_wallet["balance"] + ord_row["total_amount"]
                conn.execute("UPDATE wallets SET balance = ?, updated_at = ? WHERE id = ?", (cust_new_bal, now_iso, cust_wallet["id"]))
                conn.execute("""
                    INSERT INTO wallet_transactions (id, wallet_id, user_id, reference, type, amount, description, running_balance, created_at)
                    VALUES (?, ?, ?, ?, 'REFUND', ?, ?, ?, ?)
                """, (str(uuid.uuid4()), cust_wallet["id"], ord_row["customer_id"], f"RP-TXN-BULK-REFUND-{ord_row['order_ref']}", ord_row["total_amount"], f"Instant Bulk Refund: {reason}", cust_new_bal, now_iso))
            
            # 2. Vendor debit
            vendor = conn.execute("SELECT user_id FROM vendors WHERE id = ?", (ord_row["vendor_id"],)).fetchone()
            if vendor:
                v_wallet = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (vendor["user_id"],)).fetchone()
                if v_wallet:
                    v_new_bal = v_wallet["balance"] - ord_row["subtotal"]
                    conn.execute("UPDATE wallets SET balance = ?, updated_at = ? WHERE id = ?", (v_new_bal, now_iso, v_wallet["id"]))
            
            # 3. Admin escrow debit
            delivery_holding = ord_row["delivery_fee"] + ord_row["platform_fee"]
            if admin_user:
                adm_wallet = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (admin_user["id"],)).fetchone()
                if adm_wallet:
                    adm_new_bal = adm_wallet["balance"] - delivery_holding
                    conn.execute("UPDATE wallets SET balance = ?, updated_at = ? WHERE id = ?", (adm_new_bal, now_iso, adm_wallet["id"]))
            
            conn.execute("UPDATE financial_settlements SET status = 'REFUNDED_REVERSED' WHERE order_id = ?", (ord_row["id"],))
            conn.execute("UPDATE orders SET status = 'CANCELLED_REFUNDED', updated_at = ? WHERE id = ?", (now_iso, ord_row["id"]))
            cancelled_count += 1
            
    conn.commit()
    conn.close()
    return {"success": True, "cancelled_count": cancelled_count, "message": f"{cancelled_count} order(s) cancelled and refunded instantly to customer wallets."}

@router.post("/{order_id}/admin-confirm-delivery")
def admin_confirm_delivery(order_id: str, payload: dict = {}, current_user: dict = Depends(require_role(["ADMIN", "Super Admin", "Operations Manager", "Dispatcher"]))):
    """
    Admin confirms delivery on behalf of an offline/feature-phone rider who phoned in upon delivering,
    releasing rider earnings and clearing 4-way settlement.
    """
    notes = payload.get("notes", "Admin manual POD confirmation via rider phone call")
    conn = get_db_connection()
    ord_row = conn.execute("SELECT * FROM orders WHERE id = ? OR order_ref = ?", (order_id, order_id)).fetchone()
    if not ord_row:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")
        
    if ord_row["status"] == "DELIVERED":
        conn.close()
        return {"success": True, "message": "Order is already marked as DELIVERED."}
        
    now_iso = datetime.now(timezone.utc).isoformat()
    
    # 1. Update Order Status
    conn.execute("UPDATE orders SET status = 'DELIVERED', updated_at = ? WHERE id = ?", (now_iso, ord_row["id"]))
    
    # 2. Release Rider Earnings & Clear Settlement
    settlement = conn.execute("SELECT * FROM financial_settlements WHERE order_id = ?", (ord_row["id"],)).fetchone()
    if settlement and settlement["status"] == "ESCROW_HELD":
        conn.execute("UPDATE financial_settlements SET status = 'CLEARED' WHERE id = ?", (settlement["id"],))
        
        if ord_row["rider_id"]:
            rider = conn.execute("SELECT r.*, u.id as user_id, u.full_name FROM riders r JOIN users u ON r.user_id = u.id WHERE r.id = ?", (ord_row["rider_id"],)).fetchone()
            if rider:
                # Credit Rider Wallet
                r_wallet = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (rider["user_id"],)).fetchone()
                if r_wallet:
                    new_r_bal = r_wallet["balance"] + settlement["rider_earnings"]
                    conn.execute("UPDATE wallets SET balance = ?, updated_at = ? WHERE id = ?", (new_r_bal, now_iso, r_wallet["id"]))
                    conn.execute("""
                        INSERT INTO wallet_transactions (id, wallet_id, user_id, reference, type, amount, description, running_balance, created_at)
                        VALUES (?, ?, ?, ?, 'CREDIT', ?, ?, ?, ?)
                    """, (str(uuid.uuid4()), r_wallet["id"], rider["user_id"], f"RP-TXN-RDR-{ord_row['order_ref']}", settlement["rider_earnings"], f"Delivery Compensation confirmed by Admin for Order {ord_row['order_ref']} ({rider['rider_type']})", new_r_bal, now_iso))
                
                # Deduct from Admin Escrow
                admin_user = conn.execute("SELECT id FROM users WHERE account_type = 'ADMIN' LIMIT 1").fetchone()
                if admin_user:
                    adm_wallet = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (admin_user["id"],)).fetchone()
                    if adm_wallet:
                        adm_new_bal = adm_wallet["balance"] - settlement["rider_earnings"]
                        conn.execute("UPDATE wallets SET balance = ?, updated_at = ? WHERE id = ?", (adm_new_bal, now_iso, adm_wallet["id"]))
                
                conn.execute("""
                    UPDATE riders
                    SET operational_status = 'AVAILABLE',
                        total_deliveries = total_deliveries + 1,
                        updated_at = ?
                    WHERE id = ?
                """, (now_iso, ord_row["rider_id"]))
                
    # Record Timeline Event
    conn.execute("""
        INSERT INTO order_timeline (id, order_id, from_status, to_status, actor_id, actor_role, notes, timestamp)
        VALUES (?, ?, ?, 'DELIVERED', ?, 'Admin / Dispatcher', ?, ?)
    """, (str(uuid.uuid4()), ord_row["id"], ord_row["status"], current_user["id"], f"Delivery confirmed by Admin on behalf of rider phone call. {notes}. Commission released.", now_iso))

    conn.commit()
    conn.close()

    return {
        "success": True,
        "message": f"Order {ord_row['order_ref']} confirmed DELIVERED! Rider commission released to rider wallet.",
        "status": "DELIVERED"
    }


@router.post("/bulk-confirm-delivery")
def bulk_confirm_delivery(payload: dict = {}, current_user: dict = Depends(require_role(["ADMIN", "Super Admin", "Operations Manager", "Dispatcher"]))):
    """
    Bulk Proof-of-Delivery Confirmation:
    Admin can confirm all orders currently in 'ARRIVED' or 'IN_TRANSIT' (or specific order_ids)
    in one single action. Automatically clears settlements and disburses rider earnings.
    """
    order_ids = payload.get("order_ids", [])
    notes = payload.get("notes", "Admin bulk POD verification")

    conn = get_db_connection()
    now_iso = datetime.now(timezone.utc).isoformat()

    if order_ids:
        placeholders = ",".join(["?"] * len(order_ids))
        orders = conn.execute(f"SELECT * FROM orders WHERE id IN ({placeholders}) AND status != 'DELIVERED'", tuple(order_ids)).fetchall()
    else:
        # Confirm all arrived / in-transit orders
        orders = conn.execute("SELECT * FROM orders WHERE status IN ('ARRIVED', 'IN_TRANSIT')").fetchall()

    confirmed_count = 0
    total_disbursed = 0.0

    for ord_row in orders:
        order_id = ord_row["id"]
        # Update order status
        conn.execute("UPDATE orders SET status = 'DELIVERED', updated_at = ? WHERE id = ?", (now_iso, order_id))

        # Clear financial settlement & credit rider
        settlement = conn.execute("SELECT * FROM financial_settlements WHERE order_id = ?", (order_id,)).fetchone()
        if settlement and settlement["status"] == "ESCROW_HELD":
            conn.execute("UPDATE financial_settlements SET status = 'CLEARED' WHERE id = ?", (settlement["id"],))

            if ord_row["rider_id"]:
                rider = conn.execute("SELECT r.*, u.id as user_id, u.full_name FROM riders r JOIN users u ON r.user_id = u.id WHERE r.id = ?", (ord_row["rider_id"],)).fetchone()
                if rider:
                    earning = settlement["rider_earnings"]
                    total_disbursed += earning

                    # Credit Rider Wallet
                    r_wallet = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (rider["user_id"],)).fetchone()
                    if r_wallet:
                        new_r_bal = r_wallet["balance"] + earning
                        conn.execute("UPDATE wallets SET balance = ?, updated_at = ? WHERE id = ?", (new_r_bal, now_iso, r_wallet["id"]))
                        conn.execute("""
                            INSERT INTO wallet_transactions (id, wallet_id, user_id, reference, type, amount, description, running_balance, created_at)
                            VALUES (?, ?, ?, ?, 'CREDIT', ?, ?, ?, ?)
                        """, (str(uuid.uuid4()), r_wallet["id"], rider["user_id"], f"RP-TXN-RDR-{ord_row['order_ref']}", earning, f"Bulk Delivery Confirmation ({rider['rider_type']})", new_r_bal, now_iso))

                    # Deduct from Admin Escrow Holding
                    admin_user = conn.execute("SELECT id FROM users WHERE account_type = 'ADMIN' LIMIT 1").fetchone()
                    if admin_user:
                        adm_wallet = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (admin_user["id"],)).fetchone()
                        if adm_wallet:
                            adm_new_bal = adm_wallet["balance"] - earning
                            conn.execute("UPDATE wallets SET balance = ?, updated_at = ? WHERE id = ?", (adm_new_bal, now_iso, adm_wallet["id"]))

                    conn.execute("""
                        UPDATE riders
                        SET operational_status = 'AVAILABLE',
                            total_deliveries = total_deliveries + 1,
                            updated_at = ?
                        WHERE id = ?
                    """, (now_iso, ord_row["rider_id"]))

        # Record Timeline Event
        conn.execute("""
            INSERT INTO order_timeline (id, order_id, from_status, to_status, actor_id, actor_role, notes, timestamp)
            VALUES (?, ?, ?, 'DELIVERED', ?, 'Admin Bulk Verification', ?, ?)
        """, (str(uuid.uuid4()), order_id, ord_row["status"], current_user["id"], f"{notes}. Commission released to rider wallet.", now_iso))

        confirmed_count += 1

    conn.commit()
    conn.close()

    return {
        "success": True,
        "confirmed_count": confirmed_count,
        "total_disbursed_ngn": total_disbursed,
        "message": f"Successfully bulk-verified {confirmed_count} deliveries. Disbursed ₦{total_disbursed:,.2f} to couriers."
    }


@router.post("/{order_id}/dispute")
def report_order_issue_dispute(order_id: str, payload: dict, current_user: dict = Depends(get_current_user)):
    """
    Customer 2-Hour Return & Issue Dispute Window:
    Allows customers to report damaged goods, missing items, or wrong products within 2 hours of delivery.
    Puts financial settlement on dispute hold and alerts administration.
    """
    reason = str(payload.get("reason", "")).strip()
    details = str(payload.get("details", "")).strip()

    if not reason:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dispute reason is required.")

    conn = get_db_connection()
    ord_row = conn.execute("SELECT * FROM orders WHERE id = ? OR order_ref = ?", (order_id, order_id)).fetchone()
    if not ord_row:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")

    if ord_row["customer_id"] != current_user["id"] and current_user.get("account_type") not in ["ADMIN", "Super Admin"]:
        conn.close()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized to dispute this order.")

    if ord_row["status"] != "DELIVERED":
        conn.close()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only delivered orders can be disputed.")

    # Validate 2-hour window
    now = datetime.now(timezone.utc)
    verified_at_str = ord_row["pod_verified_at"] or ord_row["updated_at"]
    try:
        deliv_dt = datetime.fromisoformat(verified_at_str.replace("Z", "+00:00"))
        hours_passed = (now - deliv_dt).total_seconds() / 3600.0
        if hours_passed > 2.0 and current_user.get("account_type") not in ["ADMIN", "Super Admin"]:
            conn.close()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The 2-hour issue dispute window has expired for this order. Please contact Admin Support directly."
            )
    except Exception as e:
        pass

    now_iso = now.isoformat()
    conn.execute("""
        UPDATE orders
        SET dispute_status = 'PENDING',
            dispute_reason = ?,
            disputed_at = ?,
            updated_at = ?
        WHERE id = ?
    """, (f"{reason}: {details}".strip(": "), now_iso, now_iso, ord_row["id"]))

    # Put settlement on hold if still open
    conn.execute("UPDATE financial_settlements SET status = 'DISPUTED' WHERE order_id = ?", (ord_row["id"],))

    # Add timeline event
    conn.execute("""
        INSERT INTO order_timeline (id, order_id, from_status, to_status, actor_id, actor_role, notes, timestamp)
        VALUES (?, ?, 'DELIVERED', 'DISPUTED', ?, 'Customer', ?, ?)
    """, (str(uuid.uuid4()), ord_row["id"], current_user["id"], f"⚠️ Customer raised dispute: {reason}. {details}", now_iso))

    conn.commit()
    conn.close()

    return {
        "success": True,
        "dispute_status": "PENDING",
        "message": "Your issue has been reported. RushPoint Support will review within 30 minutes and hold vendor settlement."
    }


@router.post("/{order_id}/resolve-dispute")
def resolve_order_dispute(order_id: str, payload: dict, current_user: dict = Depends(require_role(["ADMIN", "Super Admin", "Operations Manager"]))):
    """
    Admin Dispute Resolution:
    Decision: 'REFUND_CUSTOMER' (full wallet refund) or 'REJECT_DISPUTE' (clears dispute and unfreezes settlement).
    """
    decision = str(payload.get("decision", "")).upper() # REFUND_CUSTOMER or REJECT_DISPUTE
    admin_notes = str(payload.get("notes", "Dispute resolved by Admin")).strip()

    if decision not in ["REFUND_CUSTOMER", "REJECT_DISPUTE"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Decision must be 'REFUND_CUSTOMER' or 'REJECT_DISPUTE'.")

    conn = get_db_connection()
    ord_row = conn.execute("SELECT * FROM orders WHERE id = ? OR order_ref = ?", (order_id, order_id)).fetchone()
    if not ord_row:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")

    now_iso = datetime.now(timezone.utc).isoformat()

    if decision == "REFUND_CUSTOMER":
        conn.execute("UPDATE orders SET dispute_status = 'REFUNDED', payment_status = 'REFUNDED', updated_at = ? WHERE id = ?", (now_iso, ord_row["id"]))
        
        # Credit customer wallet
        c_wallet = conn.execute("SELECT * FROM wallets WHERE user_id = ?", (ord_row["customer_id"],)).fetchone()
        if c_wallet:
            new_bal = c_wallet["balance"] + ord_row["total_amount"]
            conn.execute("UPDATE wallets SET balance = ?, updated_at = ? WHERE id = ?", (new_bal, now_iso, c_wallet["id"]))
            conn.execute("""
                INSERT INTO wallet_transactions (id, wallet_id, user_id, reference, type, amount, description, running_balance, created_at)
                VALUES (?, ?, ?, ?, 'CREDIT', ?, ?, ?, ?)
            """, (str(uuid.uuid4()), c_wallet["id"], ord_row["customer_id"], f"RP-DISPUTE-REF-{ord_row['order_ref']}", ord_row["total_amount"], f"Dispute Refund for Order #{ord_row['order_ref']}", new_bal, now_iso))

        conn.execute("UPDATE financial_settlements SET status = 'CANCELLED_REFUNDED' WHERE order_id = ?", (ord_row["id"],))
        msg = f"Dispute approved: Full refund of ₦{ord_row['total_amount']:,.2f} credited to customer wallet."
    else:
        conn.execute("UPDATE orders SET dispute_status = 'REJECTED', updated_at = ? WHERE id = ?", (now_iso, ord_row["id"]))
        conn.execute("UPDATE financial_settlements SET status = 'CLEARED' WHERE order_id = ?", (ord_row["id"],))
        msg = "Dispute rejected: Vendor & courier settlements restored as cleared."

    conn.execute("""
        INSERT INTO order_timeline (id, order_id, from_status, to_status, actor_id, actor_role, notes, timestamp)
        VALUES (?, ?, 'DISPUTED', ?, ?, 'Admin / Dispute Officer', ?, ?)
    """, (str(uuid.uuid4()), ord_row["id"], "REFUNDED" if decision == "REFUND_CUSTOMER" else "DELIVERED", current_user["id"], f"Decision: {decision}. {admin_notes}", now_iso))

    conn.commit()
    conn.close()

    return {"success": True, "decision": decision, "message": msg}


# ──────────────────────────────────────────────
# Flutter Vendor App Compatibility Endpoints
# ──────────────────────────────────────────────

@router.get("/vendor/my-orders")
def get_vendor_my_orders(
    order_status: str = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Flutter Vendor Dashboard: Returns vendor's own store orders.
    Used by vendor_dashboard_screen.dart.
    """
    if current_user.get("account_type") != "VENDOR":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only vendors can access this endpoint.")

    conn = get_db_connection()
    vendor = conn.execute("SELECT id FROM vendors WHERE user_id = ?", (current_user["id"],)).fetchone()
    if not vendor:
        conn.close()
        return {"orders": []}

    store = conn.execute("SELECT id FROM stores WHERE vendor_id = ?", (vendor["id"],)).fetchone()
    if not store:
        conn.close()
        return {"orders": []}

    query = """
        SELECT o.*, u.full_name as customer_name, u.phone as customer_phone_full
        FROM orders o
        JOIN users u ON o.customer_id = u.id
        WHERE o.store_id = ?
    """
    params = [store["id"]]
    if order_status:
        query += " AND o.status = ?"
        params.append(order_status)
    query += " ORDER BY o.created_at DESC LIMIT 50"

    orders = conn.execute(query, tuple(params)).fetchall()
    result = []
    for ord_row in orders:
        o_dict = dict(ord_row)
        items = conn.execute("SELECT * FROM order_items WHERE order_id = ?", (ord_row["id"],)).fetchall()
        o_dict["items"] = [dict(it) for it in items]
        # Mask customer phone for vendor privacy rules
        if o_dict.get("customer_phone"):
            raw = o_dict["customer_phone"]
            o_dict["customer_phone"] = f"{raw[:4]}****{raw[-3:]}" if len(raw) >= 7 else "****"
        result.append(o_dict)

    conn.close()
    return {"orders": result}


@router.post("/{order_id}/update-status")
def vendor_update_order_status(order_id: str, payload: dict, current_user: dict = Depends(get_current_user)):
    """
    Flutter Vendor Dashboard: Simple status update endpoint.
    Vendor can move order to: CONFIRMED, READY_FOR_PICKUP, CANCELLED.
    Used by vendor_dashboard_screen.dart _updateOrderStatus().
    """
    new_status = str(payload.get("status", "")).strip()
    vendor_allowed = ["CONFIRMED", "READY_FOR_PICKUP", "CANCELLED"]

    if new_status not in vendor_allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Vendor can only set status to: {vendor_allowed}"
        )

    conn = get_db_connection()
    now_iso = datetime.now(timezone.utc).isoformat()

    # Verify vendor owns the store this order belongs to
    if current_user.get("account_type") == "VENDOR":
        vendor = conn.execute("SELECT id FROM vendors WHERE user_id = ?", (current_user["id"],)).fetchone()
        store = conn.execute("SELECT id FROM stores WHERE vendor_id = ?", (vendor["id"],)).fetchone() if vendor else None
        order = conn.execute(
            "SELECT id, store_id, status FROM orders WHERE id = ? OR order_ref = ?", (order_id, order_id)
        ).fetchone()
        if not order or not store or order["store_id"] != store["id"]:
            conn.close()
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You don't own this order.")
        order_db_id = order["id"]
        old_status = order["status"]
    else:
        order = conn.execute("SELECT id, status FROM orders WHERE id = ? OR order_ref = ?", (order_id, order_id)).fetchone()
        if not order:
            conn.close()
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")
        order_db_id = order["id"]
        old_status = order["status"]

    conn.execute("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?", (new_status, now_iso, order_db_id))
    conn.execute("""
        INSERT INTO order_timeline (id, order_id, from_status, to_status, actor_id, actor_role, notes, timestamp)
        VALUES (?, ?, ?, ?, ?, 'Vendor', 'Status updated via vendor dashboard', ?)
    """, (str(uuid.uuid4()), order_db_id, old_status, new_status, current_user["id"], now_iso))
    conn.commit()
    conn.close()

    return {"success": True, "order_id": order_db_id, "status": new_status}
