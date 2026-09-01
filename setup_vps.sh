#!/bin/bash
# ==========================================================
# RUSHPOINT V1.0 - AUTOMATED FREE VPS DEPLOYMENT SCRIPT
# Tested on Ubuntu 22.04 / 24.04 / Debian (Oracle Free / AWS)
# ==========================================================

set -e
echo "🚀 Starting RushPoint Production VPS Deployment..."

# 1. Update System
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3-pip python3-venv git nginx certbot python3-certbot-nginx curl ufw

# 2. Setup App Directory
APP_DIR="/var/www/rushpoint"
sudo mkdir -p $APP_DIR
sudo chown -R $USER:$USER $APP_DIR

# 3. Create Python Virtual Environment
cd $APP_DIR
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# 4. Create Systemd Service for RushPoint
sudo bash -c 'cat > /etc/systemd/system/rushpoint.service <<EOF
[Unit]
Description=RushPoint Logistics Production Application
After=network.target

[Service]
User='$USER'
WorkingDirectory=/var/www/rushpoint
ExecStart=/var/www/rushpoint/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2
Restart=always
RestartSec=5
Environment=PORT=8000

[Install]
WantedBy=multi-user.target
EOF'

# 5. Enable and Start Service
sudo systemctl daemon-reload
sudo systemctl enable rushpoint
sudo systemctl restart rushpoint

echo "✅ RushPoint backend service is active and running on http://127.0.0.1:8000!"
echo "Next: Point your free domain (DuckDNS / Cloudflare) to this VPS IP and run: sudo certbot --nginx"
