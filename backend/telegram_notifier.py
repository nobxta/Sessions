"""
Telegram Bot Notifier
Sends notifications to a Telegram user when new links are generated
"""
import requests
from datetime import datetime
import os

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

