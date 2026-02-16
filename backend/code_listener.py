from telethon import TelegramClient, events, errors
from telethon.tl.types import User, Channel
import asyncio
from async_timeout import run_with_timeout, CONNECT_TIMEOUT, API_TIMEOUT, TIMEOUT_SENTINEL
import re
from datetime import datetime
from typing import Dict, Any, Optional, Callable

API_ID = '25170767'
API_HASH = 'd512fd74809a4ca3cd59078eef73afcd'

# Telegram service account IDs (official Telegram notifications)
TELEGRAM_SERVICE_IDS = [777000, 4240000]  # Common Telegram service account IDs

# Regex patterns for code extraction
LOGIN_CODE_PATTERN = re.compile(r'login code:\s*(\d{4,6})', re.IGNORECASE)
AUTH_CODE_PATTERN = re.compile(r'login code:\s*([A-Za-z0-9\-]+)', re.IGNORECASE)


async def start_listening(
    session_path: str,
    websocket,
    stop_event: asyncio.Event
) -> None:
    """
    Start listening for codes and send updates via WebSocket.
    
    Args:
        session_path: Path to the session file
        websocket: WebSocket connection for sending updates
        stop_event: Event to signal when to stop listening
    """
    client = None
    
    async def send_message(message: Dict[str, Any]):
        try:
            await websocket.send_json(message)
        except:
            pass  # Ignore websocket errors
    
    def on_code_received(code_data: Dict[str, Any]):
        asyncio.create_task(send_message({
            "type": "code_received",
            "data": code_data
        }))
    
    def on_error(error_msg: str):
        asyncio.create_task(send_message({
            "type": "error",
            "message": error_msg
        }))
    
    # Remove .session extension if present
    if session_path.endswith('.session'):
        session_path = session_path[:-8]
    
    client = TelegramClient(session_path, API_ID, API_HASH)
    seen_codes = set()
    
    try:
        r = await run_with_timeout(client.connect(), CONNECT_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if r is TIMEOUT_SENTINEL:
            await send_message({"type": "error", "message": "Connection timed out"})
            return
        
        is_auth = await run_with_timeout(client.is_user_authorized(), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if is_auth is TIMEOUT_SENTINEL or not is_auth:
            await send_message({"type": "error", "message": "Operation timed out" if is_auth is TIMEOUT_SENTINEL else "Session is not authorized"})
            await client.disconnect()
            return
        
        @client.on(events.NewMessage(incoming=True))
        async def handler(event):
            try:
                # Only process messages from Telegram service accounts
                sender = await event.get_sender()
                
                # Check if message is from Telegram service
                is_service_message = False
                if isinstance(sender, User):
                    if sender.id in TELEGRAM_SERVICE_IDS:
                        is_service_message = True
                    elif hasattr(sender, 'username') and sender.username and 'telegram' in sender.username.lower():
                        is_service_message = True
                
                message_text = event.message.message or ""
                if not is_service_message:
                    if any(keyword in message_text.lower() for keyword in [
                        'login code',
                        'this is your login code',
                        'telegram',
                        'verification code'
                    ]):
                        if 'telegram' in message_text.lower() or event.message.post:
                            is_service_message = True
                
                if not is_service_message:
                    return
                
                # Extract login code (numeric)
                login_match = LOGIN_CODE_PATTERN.search(message_text)
                if login_match:
                    code = login_match.group(1)
                    code_key = f"LOGIN_{code}"
                    
                    if code_key not in seen_codes:
                        seen_codes.add(code_key)
                        await send_message({
                            "type": "code_received",
                            "data": {
                                "session": session_path,
                                "type": "LOGIN_CODE",
                                "code": code,
                                "received_at": datetime.utcnow().isoformat() + "Z"
                            }
                        })
                
                # Extract auth code (alphanumeric)
                auth_match = AUTH_CODE_PATTERN.search(message_text)
                if auth_match:
                    code = auth_match.group(1)
                    if len(code) > 6 and not code.isdigit():
                        code_key = f"AUTH_{code}"
                        
                        if code_key not in seen_codes:
                            seen_codes.add(code_key)
                            await send_message({
                                "type": "code_received",
                                "data": {
                                    "session": session_path,
                                    "type": "AUTH_CODE",
                                    "code": code,
                                    "received_at": datetime.utcnow().isoformat() + "Z"
                                }
                            })
                
            except Exception as e:
                await send_message({
                    "type": "error",
                    "message": f"Error processing message: {str(e)}"
                })
        
        # Wait for stop event while keeping client connected
        while not stop_event.is_set():
            await asyncio.sleep(0.5)
        
    except errors.AuthKeyUnregisteredError:
        await send_message({
            "type": "error",
            "message": "Session is not authorized"
        })
    except errors.UserBannedInChannel:
        await send_message({
            "type": "error",
            "message": "Account is banned"
        })
    except Exception as e:
        await send_message({
            "type": "error",
            "message": f"Connection error: {str(e)}"
        })
    finally:
        if client:
            try:
                await client.disconnect()
            except:
                pass

