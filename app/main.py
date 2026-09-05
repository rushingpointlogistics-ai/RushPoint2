import os
import time
import threading
from collections import defaultdict
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.database import init_db
from app.seed_data import seed_database
from app.routers import (
    auth,
    admin,
    categories,
    vendors,
    products,
    marketplace,
    orders,
    dispatch,
    riders,
    finance,
    logistics,
    support,
    audit,
    notifications,
    promos
)

app = FastAPI(
    title="RushingPoint V1.0 API",
    description="Centralized Multi-Vendor Marketplace, Logistics, Delivery, Dispatch & Finance Platform",
    version="1.0.0",
    docs_url=None,   # Disable Swagger UI in production (no public API docs exposure)
    redoc_url=None   # Disable ReDoc in production
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# SECURITY HEADERS MIDDLEWARE
# Prevents clickjacking, MIME-sniffing, XSS, and protocol downgrade attacks
# ==========================================
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Permissions-Policy"] = "geolocation=(self), camera=(), microphone=()"
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# ==========================================
# BRUTE-FORCE LOGIN THROTTLE MIDDLEWARE
# Blocks IPs with >= 10 failed login attempts within 5 minutes
# ==========================================
_login_attempts: dict = defaultdict(list)
_blocked_ips: dict = {}
_lock = threading.Lock()
LOGIN_ATTEMPT_LIMIT = 10     # max failed attempts
LOGIN_WINDOW_SECONDS = 300   # 5-minute window
BLOCK_DURATION_SECONDS = 900 # 15-minute block

class BruteForceProtectionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path in ("/api/auth/login", "/api/admin/system/purge-all-data", "/api/admin/system/security-pin"):
            client_ip = request.client.host if request.client else "unknown"
            now = time.time()
            with _lock:
                # Check if IP is currently blocked
                if client_ip in _blocked_ips:
                    if now < _blocked_ips[client_ip]:
                        remaining = int(_blocked_ips[client_ip] - now)
                        return JSONResponse(
                            {"detail": f"Too many failed attempts. Account temporarily locked. Try again in {remaining} seconds."},
                            status_code=429
                        )
                    else:
                        del _blocked_ips[client_ip]
                        _login_attempts[client_ip] = []

            response = await call_next(request)

            # On failed auth (401/403), count the attempt
            if response.status_code in (401, 403):
                with _lock:
                    _login_attempts[client_ip] = [
                        t for t in _login_attempts[client_ip]
                        if now - t < LOGIN_WINDOW_SECONDS
                    ]
                    _login_attempts[client_ip].append(now)
                    if len(_login_attempts[client_ip]) >= LOGIN_ATTEMPT_LIMIT:
                        _blocked_ips[client_ip] = now + BLOCK_DURATION_SECONDS
                        _login_attempts[client_ip] = []
            return response
        return await call_next(request)

app.add_middleware(BruteForceProtectionMiddleware)

# Mount API Routers
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(categories.router)
app.include_router(vendors.router)
app.include_router(products.router)
app.include_router(marketplace.router)
app.include_router(orders.router)
app.include_router(dispatch.router)
app.include_router(riders.router)
app.include_router(finance.router)
app.include_router(logistics.router)
app.include_router(support.router)
app.include_router(audit.router)
app.include_router(notifications.router)
app.include_router(promos.router)

# Mount Static Assets
static_dir = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

# Universal asset root mounts for both web and mobile WebView compatibility
css_dir = os.path.join(static_dir, "css")
if os.path.exists(css_dir):
    app.mount("/css", StaticFiles(directory=css_dir), name="css")

js_dir = os.path.join(static_dir, "js")
if os.path.exists(js_dir):
    app.mount("/js", StaticFiles(directory=js_dir), name="js")

img_dir = os.path.join(static_dir, "img")
if os.path.exists(img_dir):
    app.mount("/img", StaticFiles(directory=img_dir), name="img")

# Mount Downloads Directory at /downloads (APK, IPA, ZIPs)
downloads_dir = os.path.join(static_dir, "downloads")
os.makedirs(downloads_dir, exist_ok=True)
app.mount("/downloads", StaticFiles(directory=downloads_dir), name="downloads")

@app.on_event("startup")
def startup_event():
    init_db()
    seed_database()

@app.get("/api/health")
def health_check():
    """Render deployment health check endpoint. Returns service status and version."""
    return {
        "status": "healthy",
        "service": "RushPoint Logistics API",
        "version": "2.0.0",
        "environment": os.getenv("FLW_ENV", "LIVE")
    }

@app.post("/webhooks/flutterwave")
async def flutterwave_webhook_alias(request: Request):
    """Direct webhook alias for Flutterwave dashboard notifications."""
    from app.routers.finance import flutterwave_webhook_endpoint
    return await flutterwave_webhook_endpoint(request)

@app.get("/")
def serve_landing():
    landing_path = os.path.join(static_dir, "landing.html")
    if os.path.exists(landing_path):
        return FileResponse(landing_path)
    return FileResponse(os.path.join(static_dir, "index.html"))

@app.get("/app")
@app.get("/mobile")
def serve_mobile_app():
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return FileResponse(os.path.join(static_dir, "landing.html"))

@app.get("/admin")
@app.get("/portal-admin-console")
def serve_admin_portal():
    admin_path = os.path.join(static_dir, "admin.html")
    if os.path.exists(admin_path):
        return FileResponse(admin_path)
    return FileResponse(os.path.join(static_dir, "index.html"))

@app.get("/dual-console")
def serve_dual_console():
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return FileResponse(os.path.join(static_dir, "landing.html"))

@app.get("/invite-signup.html")
def serve_invite_signup():
    invite_path = os.path.join(static_dir, "invite-signup.html")
    if os.path.exists(invite_path):
        return FileResponse(invite_path)
    return {"message": "Invite Signup Screen"}

@app.get("/download/android-apk")
@app.get("/download/rushpoint.apk")
def download_android_apk():
    # Prefer newly built signed release APK from static downloads
    static_apk = os.path.join(static_dir, "downloads", "rushpoint-app-v1.0-release.apk")
    if os.path.exists(static_apk):
        return FileResponse(static_apk, media_type="application/vnd.android.package-archive", filename="rushpoint-v1.0-release.apk")
    apk_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "mobile-release", "android", "rushpoint-app-v1.0-release.apk")
    if os.path.exists(apk_path):
        return FileResponse(apk_path, media_type="application/vnd.android.package-archive", filename="rushpoint-v1.0-release.apk")
    return {"error": "APK file not found"}

@app.get("/download/mobile-package")
def download_mobile_package():
    zip_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "mobile-release", "rushingpoint-mobile-package-v1.0.zip")
    if os.path.exists(zip_path):
        return FileResponse(zip_path, media_type="application/zip", filename="rushingpoint-mobile-v1.0.zip")
    return {"error": "Mobile package not found"}

@app.get("/download/ios-ipa")
@app.get("/download/rushpoint.ipa")
def download_ios_ipa():
    """
    Serve the iOS IPA file with correct Content-Type for direct download.
    iOS users should use the OTA manifest install instead (itms-services:// link).
    """
    # Check static downloads dir first (preferred for Render deployment)
    ipa_path = os.path.join(static_dir, "downloads", "rushpoint-app-v1.0-release.ipa")
    if not os.path.exists(ipa_path):
        ipa_path = os.path.join(static_dir, "downloads", "rushpoint-release.ipa")
    if not os.path.exists(ipa_path):
        ipa_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "mobile-release", "rushpoint-app-v1.0-release.ipa")
    if os.path.exists(ipa_path):
        return FileResponse(
            ipa_path,
            media_type="application/octet-stream",
            filename="rushpoint-v1.0.ipa",
            headers={
                "Content-Disposition": "attachment; filename=rushpoint-v1.0.ipa",
                "X-Content-Type-Options": "nosniff",
            }
        )
    return {"error": "IPA file not found. Please use AltStore or Xcode to install."}

@app.get("/download/ios-manifest.plist")
def download_ios_manifest(request: Request):
    """
    iOS OTA Install Manifest (itms-services://?action=download-manifest&url=...)
    Enables 'Install' prompt directly on iOS Safari for enterprise/sideload distribution.
    """
    base_url = str(request.base_url).rstrip("/")
    ipa_url = f"{base_url}/download/ios-ipa"
    plist_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
    "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>items</key>
    <array>
        <dict>
            <key>assets</key>
            <array>
                <dict>
                    <key>kind</key>
                    <string>software-package</string>
                    <key>url</key>
                    <string>{ipa_url}</string>
                </dict>
            </array>
            <key>metadata</key>
            <dict>
                <key>bundle-identifier</key>
                <string>com.rushingpoint.rushpoint</string>
                <key>bundle-version</key>
                <string>1.0.0</string>
                <key>kind</key>
                <string>software</string>
                <key>title</key>
                <string>RushPoint Logistics</string>
                <key>subtitle</key>
                <string>Smart Marketplace &amp; Courier Dispatch</string>
            </dict>
        </dict>
    </array>
</dict>
</plist>"""
    from fastapi.responses import Response as FastAPIResponse
    return FastAPIResponse(
        content=plist_content,
        media_type="application/xml",
        headers={"Content-Disposition": "attachment; filename=rushpoint-manifest.plist"}
    )

@app.post("/webhooks/flutterwave")
async def root_flutterwave_webhook(request: Request):
    """
    Direct root webhook receiver matching https://api.rushingpoint.com/webhooks/flutterwave
    """
    return await finance.flutterwave_webhook_endpoint(request)



@app.get("/pay/waybill/{req_ref}")
def serve_waybill_invoice(req_ref: str):
    from fastapi.responses import HTMLResponse
    from app.database import get_db_connection
    conn = get_db_connection()
    wb = conn.execute("SELECT * FROM logistics_requests WHERE request_ref = ?", (req_ref,)).fetchone()
    conn.close()
    
    if not wb:
        return HTMLResponse(status_code=404, content="""
        <!DOCTYPE html>
        <html><head><title>Invoice Not Found — RushingPoint</title>
        <link rel="stylesheet" href="/static/css/maroon-theme.css">
        </head><body style="font-family:sans-serif;background:#F8FAFC;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
        <div style="background:#FFF;padding:32px;border-radius:20px;box-shadow:0 10px 25px rgba(0,0,0,0.05);max-width:400px;text-align:center;">
        <h2 style="color:#B91C1C;">404 — Invoice Not Found</h2>
        <p style="color:#64748B;">This waybill payment link is either invalid or expired.</p>
        <a href="/" style="color:#B91C1C;font-weight:700;">Back to RushingPoint</a>
        </div></body></html>
        """)
        
    is_paid = wb["status"] == "PAID"
    price = wb["estimated_price"] or 0.0
    
    html = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Waybill Invoice {wb['request_ref']} — RushingPoint</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet">
      <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; font-family: 'Plus Jakarta Sans', sans-serif; }}
        body {{ background: #F1F5F9; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }}
        .invoice-card {{ background: #FFF; border-radius: 24px; box-shadow: 0 15px 35px rgba(0,0,0,0.08); max-width: 460px; width: 100%; overflow: hidden; border: 1px solid #E2E8F0; }}
        .inv-header {{ background: linear-gradient(135deg, #450A0A 0%, #7F1D1D 50%, #B91C1C 100%); color: #FFF; padding: 24px 20px; text-align: center; }}
        .inv-body {{ padding: 24px 20px; }}
        .badge {{ padding: 4px 10px; border-radius: 20px; font-size: 0.72rem; font-weight: 800; text-transform: uppercase; }}
        .badge-paid {{ background: #D1FAE5; color: #065F46; }}
        .badge-unpaid {{ background: #FEF3C7; color: #92400E; }}
        .info-row {{ display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px dashed #E2E8F0; font-size: 0.82rem; }}
        .btn-pay {{ width: 100%; background: #059669; color: #FFF; font-weight: 800; padding: 14px; border-radius: 14px; border: none; font-size: 0.95rem; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 18px; box-shadow: 0 4px 12px rgba(5,150,105,0.3); }}
      </style>
    </head>
    <body>
      <div class="invoice-card">
        <div class="inv-header">
          <div style="font-size: 1.8rem; font-weight: 900; letter-spacing: -0.5px;">RushingPoint</div>
          <div style="font-size: 0.75rem; opacity: 0.85; margin-top: 2px;">Intelligent Waybill Transport & Logistics</div>
          <div style="margin-top: 14px; font-size: 1.6rem; font-weight: 900;">NGN {price:,.2f}</div>
          <div style="margin-top: 6px;">
            <span class="badge {('badge-paid' if is_paid else 'badge-unpaid')}">{('PAID ✓' if is_paid else 'PENDING PAYMENT')}</span>
          </div>
        </div>

        <div class="inv-body">
          <div class="info-row">
            <span style="color: #64748B;">Invoice Ref:</span>
            <strong>{wb['request_ref']}</strong>
          </div>
          <div class="info-row">
            <span style="color: #64748B;">Cargo Description:</span>
            <strong>{wb['item_description']}</strong>
          </div>
          <div class="info-row">
            <span style="color: #64748B;">Package Scale:</span>
            <span>{wb['package_size']}</span>
          </div>
          <div class="info-row">
            <span style="color: #64748B;">Pickup Station:</span>
            <span style="text-align: right; max-width: 60%;">{wb['pickup_address']}</span>
          </div>
          <div class="info-row">
            <span style="color: #64748B;">Dropoff Location:</span>
            <span style="text-align: right; max-width: 60%;">{wb['dropoff_address']}</span>
          </div>
          <div class="info-row" style="border-bottom: none;">
            <span style="color: #64748B;">Receiver Contact:</span>
            <strong>{wb['dropoff_contact']}</strong>
          </div>

          <div id="payment-action-area">
            {f'''
              <button onclick="processWaybillPayment()" class="btn-pay" id="pay-btn">
                💳 Pay NGN {price:,.2f} Securely
              </button>
              <div style="text-align:center;font-size:0.7rem;color:#64748B;margin-top:10px;">
                Secured by Flutterwave 256-Bit SSL Encryption
              </div>
            ''' if not is_paid else '''
              <div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:12px;padding:14px;text-align:center;color:#065F46;font-weight:800;font-size:0.85rem;margin-top:16px;">
                ✓ This invoice is already PAID. Courier is in transit.
              </div>
            '''}
          </div>
        </div>
      </div>

      <script>
        async function processWaybillPayment() {{
          const btn = document.getElementById('pay-btn');
          if (btn) {{ btn.disabled = true; btn.innerText = "⏳ Processing Payment..."; }}
          try {{
            const res = await fetch('/api/logistics/pay-waybill/{wb['request_ref']}', {{
              method: 'POST',
              headers: {{ 'Content-Type': 'application/json' }},
              body: JSON.stringify({{ payment_method: 'FLUTTERWAVE_CARD' }})
            }});
            const data = await res.json();
            if (data.success) {{
              document.getElementById('payment-action-area').innerHTML = `
                <div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:12px;padding:16px;text-align:center;color:#065F46;margin-top:16px;">
                  <div style="font-weight:900;font-size:1.1rem;margin-bottom:4px;">🎉 Payment Successful!</div>
                  <div style="font-size:0.78rem;">Thank you! Your payment of NGN {price:,.2f} has been confirmed. The dispatcher has released your parcel.</div>
                </div>
              `;
            }} else {{
              alert(data.detail || 'Payment failed');
              if (btn) {{ btn.disabled = false; btn.innerText = "💳 Try Payment Again"; }}
            }}
          }} catch (err) {{
            alert('Network error. Please try again.');
            if (btn) {{ btn.disabled = false; btn.innerText = "💳 Try Payment Again"; }}
          }}
        }}
      </script>
    </body>
    </html>
    """
    return HTMLResponse(content=html)

