"""
Telegram Bot Notifier
Sends notifications to a Telegram user when new links are generated
Also handles bot commands like /start for health status
"""
import requests
from datetime import datetime
import os
import time
import threading
import socket

# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN = "7725313939:AAHWnACKbDXJStCniRiACxVFvBnAgRpmO3k"
TELEGRAM_USER_ID = "5495140274"
TELEGRAM_API_URL = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"

# Store the Cloudflare tunnel URL
CLOUDFLARE_TUNNEL_URL = None

def set_cloudflare_tunnel_url(url: str):
    """Set the Cloudflare tunnel URL for use in notifications"""
    global CLOUDFLARE_TUNNEL_URL
    CLOUDFLARE_TUNNEL_URL = url
    print(f"[Telegram] Cloudflare tunnel URL set: {url}")

def send_telegram_notification(message: str):
    """
    Send a notification message to the configured Telegram user
    
    Args:
        message: The message to send
    """
    try:
        url = f"{TELEGRAM_API_URL}/sendMessage"
        payload = {
            "chat_id": TELEGRAM_USER_ID,
            "text": message,
            "parse_mode": "HTML"
        }
        
        response = requests.post(url, json=payload, timeout=10)
        
        if response.status_code == 200:
            result = response.json()
            if result.get('ok'):
                print(f"[Telegram] ✅ Notification sent successfully to user {TELEGRAM_USER_ID}")
                return True
            else:
                print(f"[Telegram] ❌ API returned error: {result.get('description', 'Unknown error')}")
                return False
        else:
            print(f"[Telegram] ❌ Failed to send notification: HTTP {response.status_code}")
            print(f"[Telegram] Response: {response.text}")
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"[Telegram] ❌ Network error sending notification: {str(e)}")
        return False
    except Exception as e:
        print(f"[Telegram] ❌ Error sending notification: {str(e)}")
        return False

def notify_link_generated(link_url: str = None):
    """
    Send a notification with the server link and time
    
    Args:
        link_url: The server link URL (optional, will use Cloudflare tunnel if available)
    """
    global CLOUDFLARE_TUNNEL_URL
    
    # Use Cloudflare tunnel URL if available and no specific link provided
    if not link_url and CLOUDFLARE_TUNNEL_URL:
        link_url = CLOUDFLARE_TUNNEL_URL
    
    if not link_url:
        print("[Telegram] No link available to send")
        return False
    
    message = f"""🔗 <b>{link_url}</b>

⏰ {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"""
    
    print(f"[Telegram] Sending notification with link: {link_url}")
    result = send_telegram_notification(message)
    
    if not result:
        print(f"[Telegram] ⚠️ Notification failed - check bot token and user ID")
    
    return result

def get_backend_health_info():
    """
    Get backend health information including ping and connectivity
    Returns dict with health status, ping time, and connectivity info
    """
    global CLOUDFLARE_TUNNEL_URL
    health_info = {
        "status": "unknown",
        "ping_ms": None,
        "server_port": os.environ.get("SERVER_PORT", "3000"),
        "cloudflare_tunnel": CLOUDFLARE_TUNNEL_URL,
        "local_url": f"http://127.0.0.1:{os.environ.get('SERVER_PORT', '3000')}",
        "timestamp": datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    }
    
    # Check local health endpoint
    try:
        import urllib.request
        local_url = health_info["local_url"] + "/health"
        start_time = time.time()
        req = urllib.request.Request(local_url, method="GET")
        with urllib.request.urlopen(req, timeout=2) as response:
            elapsed_ms = (time.time() - start_time) * 1000
            if response.status == 200:
                health_info["status"] = "healthy"
                health_info["ping_ms"] = round(elapsed_ms, 2)
            else:
                health_info["status"] = "unhealthy"
        return health_info
    except Exception as e:
        health_info["status"] = "unreachable"
        health_info["error"] = str(e)
        return health_info

def format_health_message(health_info):
    """Format health information as a readable message"""
    status_emoji = "✅" if health_info["status"] == "healthy" else "❌" if health_info["status"] == "unreachable" else "⚠️"
    
    message = f"""🤖 <b>Backend Health Status</b>

{status_emoji} <b>Status:</b> {health_info["status"].upper()}
"""
    
    if health_info.get("ping_ms"):
        message += f"⚡ <b>Ping:</b> {health_info['ping_ms']} ms\n"
    
    message += f"""
🔌 <b>Server Port:</b> {health_info["server_port"]}
🌐 <b>Local URL:</b> <code>{health_info["local_url"]}</code>
"""
    
    if health_info.get("cloudflare_tunnel"):
        message += f"☁️ <b>Cloudflare Tunnel:</b> <code>{health_info['cloudflare_tunnel']}</code>\n"
    else:
        message += "☁️ <b>Cloudflare Tunnel:</b> Not configured\n"
    
    message += f"\n🕐 <b>Last Check:</b> {health_info['timestamp']}"
    
    if health_info.get("error"):
        message += f"\n\n⚠️ <b>Error:</b> <code>{health_info['error']}</code>"
    
    return message

def send_telegram_message(chat_id: str, message: str, parse_mode: str = "HTML"):
    """
    Send a message to a Telegram chat
    
    Args:
        chat_id: Telegram chat ID
        message: Message text
        parse_mode: Parse mode (HTML, Markdown, etc.)
    """
    try:
        url = f"{TELEGRAM_API_URL}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": message,
            "parse_mode": parse_mode
        }
        
        response = requests.post(url, json=payload, timeout=10)
        
        if response.status_code == 200:
            result = response.json()
            if result.get('ok'):
                return True
            else:
                print(f"[Telegram Bot] ❌ API error: {result.get('description', 'Unknown error')}")
                return False
        else:
            print(f"[Telegram Bot] ❌ HTTP {response.status_code}: {response.text}")
            return False
            
    except Exception as e:
        print(f"[Telegram Bot] ❌ Error: {str(e)}")
        return False

def handle_bot_command(update):
    """Handle incoming bot command"""
    try:
        message = update.get("message", {})
        chat_id = str(message.get("chat", {}).get("id"))
        text = message.get("text", "").strip()
        
        if text == "/start":
            health_info = get_backend_health_info()
            health_message = format_health_message(health_info)
            send_telegram_message(chat_id, health_message)
            return True
        
        return False
    except Exception as e:
        print(f"[Telegram Bot] Error handling command: {str(e)}")
        return False

def start_bot_polling():
    """Start long polling for bot commands in a background thread"""
    def poll_loop():
        print("[Telegram Bot] Starting bot polling...")
        offset = 0
        
        while True:
            try:
                url = f"{TELEGRAM_API_URL}/getUpdates"
                params = {
                    "offset": offset,
                    "timeout": 30,
                    "allowed_updates": ["message"]
                }
                
                response = requests.get(url, params=params, timeout=35)
                
                if response.status_code == 200:
                    data = response.json()
                    if data.get("ok"):
                        updates = data.get("result", [])
                        
                        for update in updates:
                            update_id = update.get("update_id")
                            offset = update_id + 1
                            
                            # Handle commands
                            if "message" in update:
                                handle_bot_command(update)
                    else:
                        print(f"[Telegram Bot] API error: {data.get('description')}")
                else:
                    print(f"[Telegram Bot] HTTP {response.status_code}")
                
            except requests.exceptions.Timeout:
                # Timeout is expected, continue polling
                continue
            except Exception as e:
                print(f"[Telegram Bot] Polling error: {str(e)}")
                time.sleep(5)  # Wait before retrying
    
    thread = threading.Thread(target=poll_loop, daemon=True)
    thread.start()
    print("[Telegram Bot] Bot polling thread started")
    return thread

