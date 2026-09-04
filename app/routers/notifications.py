import os
import uuid
import urllib.parse
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, status
from app.database import get_db_connection
from app.security import get_current_user, require_role

router = APIRouter(prefix="/api/notifications", tags=["Notifications & Alerts"])

def generate_whatsapp_url(phone: str, text: str) -> str:
    """Creates a universal WhatsApp link for web or mobile."""
    clean_phone = "".join(filter(str.isdigit, phone or ""))
    encoded_text = urllib.parse.quote(text)
    if clean_phone:
        return f"https://wa.me/{clean_phone}?text={encoded_text}"
    return f"https://wa.me/?text={encoded_text}"

def push_system_notification(
    conn,
    user_id: str,
    title: str,
    message: str,
    category: str = "ORDER",
    sound_type: str = "chime",
    order_id: str = None,
    order_ref: str = None,
    customer_phone: str = None,
    rider_phone: str = None
):
    """Inserts a real-time notification with audio flag and WhatsApp share link."""
    notif_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    
    share_text = f"📦 RushPoint Update: {title}\n{message}"
    if order_ref:
        share_text += f"\nTracking Ref: {order_ref}\nLive Status: https://rushingpoint.com/app"
    
    wa_url = generate_whatsapp_url(customer_phone or rider_phone or "", share_text)

    conn.execute("""
        INSERT INTO notifications (id, user_id, title, message, category, is_read, created_at)
        VALUES (?, ?, ?, ?, ?, 0, ?)
    """, (notif_id, user_id, title, message, category, now_iso))

    return {
        "id": notif_id,
        "title": title,
        "message": message,
        "sound_type": sound_type,
        "audio_alert": True,
        "whatsapp_url": wa_url,
        "created_at": now_iso
    }

@router.get("/my")
def get_user_notifications(current_user: dict = Depends(get_current_user)):
    """Fetches user notifications with audio alert flags."""
    conn = get_db_connection()
    rows = conn.execute("""
        SELECT * FROM notifications 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT 30
    """, (current_user["id"],)).fetchall()
    
    unread_count = conn.execute("""
        SELECT COUNT(*) as count FROM notifications 
        WHERE user_id = ? AND is_read = 0
    """, (current_user["id"],)).fetchone()["count"]
    
    conn.close()

    items = []
    for r in rows:
        item = dict(r)
        item["audio_alert"] = not bool(item.get("is_read", 0))
        item["sound_type"] = "arrival" if "arrived" in item.get("title", "").lower() else "chime"
        items.append(item)

    return {
        "success": True,
        "unread_count": unread_count,
        "notifications": items
    }

@router.post("/mark-all-read")
def mark_all_notifications_read(current_user: dict = Depends(get_current_user)):
    """Marks all user notifications as read."""
    conn = get_db_connection()
    conn.execute("UPDATE notifications SET is_read = 1 WHERE user_id = ?", (current_user["id"],))
    conn.commit()
    conn.close()
    return {"success": True, "message": "All notifications marked as read."}

@router.get("/whatsapp-share")
def get_whatsapp_share_link(
    order_ref: str,
    recipient_phone: str = "",
    status_text: str = "Order in transit",
    tracking_url: str = "https://rushingpoint.com/app"
):
    """Generates formatted WhatsApp order receipt and live dispatch share link."""
    message = (
        f"🚀 *RushPoint Logistics Dispatch*\n"
        f"📦 *Tracking Ref:* {order_ref}\n"
        f"📍 *Status:* {status_text}\n"
        f"🔗 *Live Tracking Link:* {tracking_url}\n"
        f"💬 *Support Hotline:* +234 800 RUSHPOINT\n"
        f"_Every Delivery, On Point._"
    )
    return {
        "success": True,
        "whatsapp_url": generate_whatsapp_url(recipient_phone, message),
        "message": message
    }


@router.post("/broadcast")
def broadcast_notification(payload: dict, current_user: dict = Depends(require_role(["ADMIN", "Super Admin", "Operations Manager"]))):
    """
    Admin Broadcast Notification:
    Pushes an in-app system notification to ALL users, or filtered to:
    'CUSTOMERS', 'VENDORS', 'RIDERS', or 'ALL'.
    """
    title = str(payload.get("title", "")).strip()
    message = str(payload.get("message", "")).strip()
    target = str(payload.get("target", "ALL")).upper() # ALL, CUSTOMERS, VENDORS, RIDERS
    category = str(payload.get("category", "ANNOUNCEMENT")).upper()
    sound_type = str(payload.get("sound_type", "announcement"))

    if not title or not message:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title and message are required.")

    conn = get_db_connection()
    query = "SELECT id, account_type FROM users WHERE status = 'ACTIVE'"
    if target == "CUSTOMERS":
        query += " AND account_type = 'CUSTOMER'"
    elif target == "VENDORS":
        query += " AND account_type = 'VENDOR'"
    elif target == "RIDERS":
        query += " AND account_type = 'RIDER'"
    
    users = conn.execute(query).fetchall()
    now_iso = datetime.now(timezone.utc).isoformat()
    
    records = []
    for u in users:
        records.append((str(uuid.uuid4()), u["id"], title, message, category, 0, now_iso))

    if records:
        conn.executemany("""
            INSERT INTO notifications (id, user_id, title, message, category, is_read, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, records)

    conn.commit()
    conn.close()

    return {
        "success": True,
        "sent_count": len(records),
        "target": target,
        "message": f"Broadcast successfully dispatched to {len(records)} active {target.lower()}."
    }

