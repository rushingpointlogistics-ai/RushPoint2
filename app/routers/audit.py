from fastapi import APIRouter, Depends
from app.database import get_db_connection
from app.security import require_role

router = APIRouter(prefix="/api/audit", tags=["Audit Trails & Traceability"])

@router.get("/")
def list_audit_logs(
    action: str = None, 
    resource_type: str = None,
    limit: int = 100,
    current_user: dict = Depends(require_role(["ADMIN", "Super Admin"]))
):
    conn = get_db_connection()
    query = "SELECT * FROM audit_logs WHERE 1=1"
    params = []
    
    if action:
        query += " AND action LIKE ?"
        params.append(f"%{action}%")
    if resource_type:
        query += " AND resource_type = ?"
        params.append(resource_type)
        
    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)
    
    logs = conn.execute(query, tuple(params)).fetchall()
    conn.close()
    
    return {"audit_logs": [dict(l) for l in logs]}
