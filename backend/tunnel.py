import os
import sys
import stat
import time
import platform
import subprocess
import threading
import urllib.request
from pathlib import Path

TUNNEL_NAME   = "sessionn-backend"
TUNNEL_DOMAIN = "api.sessionn.in"
APP_PORT      = int(os.environ.get("APP_PORT", os.environ.get("SERVER_PORT", 3000)))
CF_DIR        = Path(".cloudflared")
CERT_FILE     = CF_DIR / "cert.pem"
CREDS_FILE    = CF_DIR / f"{TUNNEL_NAME}.json"
CONFIG_FILE   = CF_DIR / "config.yml"
CF_BIN        = Path("./cloudflared")


def download_cloudflared():
    if CF_BIN.exists():
        return
    print("[tunnel] Downloading cloudflared...")
    machine = platform.machine().lower()
    if "aarch64" in machine or "arm64" in machine:
        url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
    else:
        url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
    urllib.request.urlretrieve(url, CF_BIN)
    CF_BIN.chmod(CF_BIN.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
    print("[tunnel] cloudflared ready.")


def login():
    print("\n" + "="*60)
    print("  CLOUDFLARE AUTH REQUIRED")
    print("  Open the link below in your browser to authorize:")
    print("="*60 + "\n")
    proc = subprocess.Popen(
        [str(CF_BIN), "tunnel", "login"],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1
    )
    for line in proc.stdout:
        line = line.strip()
        if not line:
            continue
        if "https://" in line:
            print(f"\n  >>> {line}\n")
        else:
            print(f"  {line}")
    proc.wait()
    if not CERT_FILE.exists():
        print("[tunnel] Auth failed. Re-run and authorize.")
        sys.exit(1)
    print("[tunnel] Authorized!\n")


def setup():
    CF_DIR.mkdir(exist_ok=True)

    if not CERT_FILE.exists():
        login()

    if not CREDS_FILE.exists():
        print(f"[tunnel] Creating tunnel '{TUNNEL_NAME}'...")
        subprocess.run([str(CF_BIN), "tunnel", "create", TUNNEL_NAME], check=True)

    if not CONFIG_FILE.exists():
        CONFIG_FILE.write_text(
            f"tunnel: {TUNNEL_NAME}\n"
            f"credentials-file: {CREDS_FILE.resolve()}\n\n"
            f"ingress:\n"
            f"  - hostname: {TUNNEL_DOMAIN}\n"
            f"    service: http://localhost:{APP_PORT}\n"
            f"  - service: http_status:404\n"
        )

    result = subprocess.run(
        [str(CF_BIN), "tunnel", "route", "dns", "--overwrite-dns", TUNNEL_NAME, TUNNEL_DOMAIN],
        capture_output=True, text=True
    )
    if result.returncode == 0:
        print(f"[tunnel] DNS route set: {TUNNEL_DOMAIN}")
    else:
        print(f"[tunnel] DNS note: {result.stderr.strip()}")


def start():
    proc = subprocess.Popen(
        [str(CF_BIN), "tunnel", "--config", str(CONFIG_FILE), "run", TUNNEL_NAME],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1
    )

    def log():
        for line in proc.stdout:
            line = line.strip()
            if line and any(k in line.lower() for k in ["error", "connected", "registered", "failed"]):
                print(f"[cloudflared] {line}")

    threading.Thread(target=log, daemon=True).start()
    return proc


def run_tunnel_then_server():
    download_cloudflared()
    setup()
    tunnel_proc = start()
    time.sleep(3)

    print("\n" + "="*60)
    print(f"  Backend  → http://localhost:{APP_PORT}")
    print(f"  Public   → https://{TUNNEL_DOMAIN}")
    print("="*60 + "\n")

    import uvicorn
    try:
        uvicorn.run("main:app", host="0.0.0.0", port=APP_PORT, reload=False)
    finally:
        tunnel_proc.terminate()


if __name__ == "__main__":
    run_tunnel_then_server()
