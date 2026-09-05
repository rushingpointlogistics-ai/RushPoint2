import uuid
import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, status
from app.database import get_db_connection
from app.security import get_current_user, require_role, log_audit
from app.models import TicketCreate, TicketMessageCreate

router = APIRouter(prefix="/api/support", tags=["Customer Support Desk"])

@router.get("/tickets")
def list_tickets(status: str = None, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    if current_user["account_type"] == "CUSTOMER":
        query = "SELECT * FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC"
        tickets = conn.execute(query, (current_user["id"],)).fetchall()
    else:
        query = """
            SELECT t.*, u.full_name as user_name, u.email as user_email, u.phone as user_phone
            FROM support_tickets t
            JOIN users u ON t.user_id = u.id
            WHERE 1=1
        """
        params = []
        if status:
            query += " AND t.status = ?"
            params.append(status)
        query += " ORDER BY t.created_at DESC"
        tickets = conn.execute(query, tuple(params)).fetchall()
        
    conn.close()
    return {"tickets": [dict(t) for t in tickets]}

@router.post("/tickets")
def create_ticket(req: TicketCreate, current_user: dict = Depends(get_current_user)):
    ticket_id = str(uuid.uuid4())
    ticket_ref = f"RP-TCK-{secrets.randbelow(900000) + 100000}"
    now_iso = datetime.now(timezone.utc).isoformat()
    
    conn = get_db_connection()
    conn.execute("""
        INSERT INTO support_tickets (id, ticket_ref, user_id, order_id, category, subject, description, priority, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)
    """, (ticket_id, ticket_ref, current_user["id"], req.order_id, req.category, req.subject, req.description, req.priority or "MEDIUM", now_iso, now_iso))
    
    # Insert initial message
    conn.execute("""
        INSERT INTO ticket_messages (id, ticket_id, sender_id, sender_role, message, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (str(uuid.uuid4()), ticket_id, current_user["id"], current_user.get("role_name") or current_user["account_type"], req.description, now_iso))
    
    conn.commit()
    conn.close()
    
    return {"success": True, "ticket_id": ticket_id, "ticket_ref": ticket_ref, "message": "Support ticket opened successfully."}

@router.get("/tickets/{ticket_id}")
def get_ticket_thread(ticket_id: str, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    ticket = conn.execute("""
        SELECT t.*, u.full_name as user_name, u.email as user_email
        FROM support_tickets t
        JOIN users u ON t.user_id = u.id
        WHERE t.id = ? OR t.ticket_ref = ?
    """, (ticket_id, ticket_id)).fetchone()
    
    if not ticket:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found.")
        
    messages = conn.execute("""
        SELECT m.*, u.full_name as sender_name
        FROM ticket_messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.ticket_id = ?
        ORDER BY m.created_at ASC
    """, (ticket["id"],)).fetchall()
    
    conn.close()
    return {"ticket": dict(ticket), "messages": [dict(m) for m in messages]}

@router.post("/tickets/{ticket_id}/reply")
def reply_ticket(ticket_id: str, req: TicketMessageCreate, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    ticket = conn.execute("SELECT * FROM support_tickets WHERE id = ? OR ticket_ref = ?", (ticket_id, ticket_id)).fetchone()
    if not ticket:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found.")
        
    now_iso = datetime.now(timezone.utc).isoformat()
    sender_role = current_user.get("role_name") or current_user["account_type"]
    
    conn.execute("""
        INSERT INTO ticket_messages (id, ticket_id, sender_id, sender_role, message, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (str(uuid.uuid4()), ticket["id"], current_user["id"], sender_role, req.message, now_iso))
    
    conn.execute("UPDATE support_tickets SET updated_at = ? WHERE id = ?", (now_iso, ticket["id"]))
    conn.commit()
    conn.close()
    
    return {"success": True, "message": "Reply posted."}

@router.post("/tickets/{ticket_id}/status")
def change_ticket_status(ticket_id: str, payload: dict, current_user: dict = Depends(require_role(["ADMIN", "STAFF", "Super Admin", "Customer Support"]))):
    new_status = payload.get("status") # OPEN, IN_PROGRESS, RESOLVED, CLOSED
    if new_status not in ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ticket status.")
        
    conn = get_db_connection()
    now_iso = datetime.now(timezone.utc).isoformat()
    conn.execute("UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?", (new_status, now_iso, ticket_id))
    conn.commit()
    conn.close()
    
    return {"success": True, "status": new_status}


@router.put("/tickets/{ticket_id}")
def update_ticket_by_admin(ticket_id: str, payload: dict, current_user: dict = Depends(require_role(["ADMIN", "STAFF", "Super Admin", "Customer Support", "Operations Manager"]))):
    """
    Admin / Support: Update ticket status and/or priority via PUT.
    Used by admin portal resolveTicket() and escalateTicket() actions.
    Accepts:  { "status": "RESOLVED" | "ESCALATED" | ... , "priority": "URGENT" | ... }
    """
    conn = get_db_connection()
    ticket = conn.execute(
        "SELECT id FROM support_tickets WHERE id = ? OR ticket_ref = ?",
        (ticket_id, ticket_id)
    ).fetchone()

    if not ticket:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found.")

    now_iso = datetime.now(timezone.utc).isoformat()
    new_status = payload.get("status")
    new_priority = payload.get("priority")

    valid_statuses = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED", "ESCALATED"]
    valid_priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"]

    if new_status and new_status not in valid_statuses:
        conn.close()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid status. Valid: {valid_statuses}")

    if new_priority and new_priority not in valid_priorities:
        conn.close()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid priority. Valid: {valid_priorities}")

    update_parts = ["updated_at = ?"]
    params = [now_iso]

    if new_status:
        update_parts.append("status = ?")
        params.append(new_status)
    if new_priority:
        update_parts.append("priority = ?")
        params.append(new_priority)

    params.append(ticket["id"])
    conn.execute(f"UPDATE support_tickets SET {', '.join(update_parts)} WHERE id = ?", tuple(params))
    conn.commit()
    conn.close()

    return {
        "success": True,
        "ticket_id": ticket["id"],
        "status": new_status,
        "priority": new_priority,
        "message": "Ticket updated successfully."
    }
