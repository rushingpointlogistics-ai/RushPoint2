"""
RushingPoint V1.0 - Remote Tester Public Access Tunnel
Enables remote testers in other countries to connect to your local RushingPoint instance.

Usage:
  python share_demo_tunnel.py
"""

import sys
import subprocess
import time
import urllib.request
import json
import os

def check_server_running():
    try:
        r = urllib.request.urlopen("http://localhost:8000/api/categories/", timeout=2)
        return r.getcode() == 200
    except Exception:
        return False

def main():
    print("=" * 65)
    print("  RUSHINGPOINT V1.0 - REMOTE TESTER ACCESS TUNNEL")
    print("=" * 65)
    print()

    if not check_server_running():
        print("[!] Local RushingPoint server is not running on http://localhost:8000")
        print("    Starting server automatically in background...")
        subprocess.Popen([sys.executable, "server.py"], cwd=os.path.dirname(os.path.abspath(__file__)))
        time.sleep(3)
        if not check_server_running():
            print("[X] Could not connect to local server. Please run 'python server.py' first.")
            return

    print("[✓] Local RushingPoint server is active on http://localhost:8000")
    print()
    print("To give access to testers in other countries, choose your preferred method:")
    print()
    print("METHOD 1: Using ngrok (Recommended & Fastest)")
    print("----------------------------------------------")
    print("  1. If you have ngrok installed, run in a separate terminal:")
    print("     ngrok http 8000")
    print("  2. ngrok will give you an HTTPS link, e.g.:")
    print("     https://xxxx-xxxx.ngrok-free.app")
    print("  3. Send that HTTPS link to your testers anywhere in the world!")
    print()
    print("METHOD 2: Using Cloudflare Tunnel (No Sign-up Needed)")
    print("-----------------------------------------------------")
    print("  Run in terminal: cloudflared tunnel --url http://localhost:8000")
    print()
    print("METHOD 3: Using LocalTunnel (Node-free curl)")
    print("--------------------------------------------")
    print("  ssh -R 80:localhost:8000 localhost.run")
    print()
    print("=" * 65)
    print("  All API endpoints, Web Admin, and Mobile App will work seamlessly")
    print("  across the world over any of these secure tunnels.")
    print("=" * 65)

if __name__ == "__main__":
    main()
