import uvicorn
import os

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    print(f"[RushingPoint] Starting V1.0 Platform Server on http://localhost:{port} ...")
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=False)
