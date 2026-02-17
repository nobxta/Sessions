from telethon import TelegramClient, errors, events
import asyncio
import re
from typing import Dict, Any, Tuple, Optional
from async_timeout import run_with_timeout, CONNECT_TIMEOUT, API_TIMEOUT, TIMEOUT_SENTINEL
from concurrency_config import MAX_CONCURRENT_SESSIONS
import logging

logger = logging.getLogger(__name__)
API_ID = '25170767'
API_HASH = 'd512fd74809a4ca3cd59078eef73afcd'
SPAMBOT_USERNAME = 'spambot'


class SessionHealthStatus:
    ACTIVE = "ACTIVE"
    TEMP_LIMITED = "TEMP_LIMITED"
    HARD_LIMITED = "HARD_LIMITED"
    FROZEN = "FROZEN"
    UNKNOWN = "UNKNOWN"
    FAILED = "FAILED"


async def check_session_health_spambot(
    session_path: str,
    api_id: int = None,
    api_hash: str = None,
    timeout: int = 30
) -> Tuple[str, Optional[str]]:
    """
    Check session health status using @SpamBot.
    
    Args:
        session_path: Path to the .session file (without .session extension)
        api_id: Telegram API ID (uses default if not provided)
        api_hash: Telegram API Hash (uses default if not provided)
        timeout: Timeout in seconds for the operation
    
    Returns:
        Tuple: (SessionHealthStatus, optional_details)
        - ACTIVE: (SessionHealthStatus.ACTIVE, None)
        - TEMP_LIMITED: (SessionHealthStatus.TEMP_LIMITED, "date string")
        - HARD_LIMITED: (SessionHealthStatus.HARD_LIMITED, None)
        - FROZEN: (SessionHealthStatus.FROZEN, None)
        - UNKNOWN: (SessionHealthStatus.UNKNOWN, response_excerpt)
        - FAILED: (SessionHealthStatus.FAILED, error_details)
    """
    # Use provided API credentials or defaults
    if api_id is None:
        api_id = int(API_ID)
    if api_hash is None:
        api_hash = API_HASH
    
    # Remove .session extension if present
    if session_path.endswith('.session'):
        session_path = session_path[:-8]
    logger.info("[SESSION START] %s", session_path)
    client = TelegramClient(session_path, api_id, api_hash)
    
    try:
        logger.info("[SESSION ACTION] %s connect", session_path)
        # Use non-interactive connect() to avoid Telethon prompting for phone input
        r = await run_with_timeout(client.connect(), CONNECT_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if r is TIMEOUT_SENTINEL:
            try:
                await client.disconnect()
            except:
                pass
            logger.warning("[SESSION FAIL] %s error=%s", session_path, "Connection timed out")
            return (SessionHealthStatus.FAILED, "Connection timed out")
        
        is_auth = await run_with_timeout(client.is_user_authorized(), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if is_auth is TIMEOUT_SENTINEL:
            await client.disconnect()
            logger.warning("[SESSION FAIL] %s error=%s", session_path, "Operation timed out")
            return (SessionHealthStatus.FAILED, "Operation timed out")
        if not is_auth:
            await client.disconnect()
            logger.warning("[SESSION FAIL] %s error=%s", session_path, "Session is not authorized")
            return (SessionHealthStatus.FAILED, "UNAUTHORIZED_SESSION")
        
        # Open chat with SpamBot (try multiple possible usernames)
        bot_entity = None
        possible_usernames = ['spambot', 'SpamBot', 'Spambot']
        logger.info("[SESSION ACTION] %s get_entity", session_path)
        for username in possible_usernames:
            try:
                bot_entity = await run_with_timeout(client.get_entity(username), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
                if bot_entity is not TIMEOUT_SENTINEL:
                    break
            except:
                continue
        
        if not bot_entity or bot_entity is TIMEOUT_SENTINEL:
            await client.disconnect()
            logger.warning("[SESSION FAIL] %s error=%s", session_path, "Could not find @spambot")
            return (SessionHealthStatus.FAILED, f"Could not find @spambot (tried: {', '.join(possible_usernames)})")
        
        # Send /start command
        logger.info("[SESSION ACTION] %s send_message", session_path)
        try:
            send_r = await run_with_timeout(client.send_message(bot_entity, '/start'), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
            if send_r is TIMEOUT_SENTINEL:
                await client.disconnect()
                logger.warning("[SESSION FAIL] %s error=%s", session_path, "Send /start timed out")
                return (SessionHealthStatus.FAILED, "Send /start timed out")
        except Exception as e:
            await client.disconnect()
            logger.warning("[SESSION FAIL] %s error=%s", session_path, str(e))
            return (SessionHealthStatus.FAILED, f"Failed to send /start: {str(e)}")
        
        # Use event handler to listen for new messages from the bot
        bot_message = None
        message_received = asyncio.Event()
        
        @client.on(events.NewMessage(from_users=bot_entity.id))
        async def handler(event):
            nonlocal bot_message
            msg_text = event.message.message or ""
            if msg_text:
                bot_message = msg_text
                message_received.set()
        
        # Wait for bot response with timeout
        try:
            await asyncio.wait_for(message_received.wait(), timeout=10.0)
        except asyncio.TimeoutError:
            pass  # Will check bot_message below
        
        # If event handler didn't catch it, try reading messages directly
        if not bot_message:
            async def _read_bot_messages():
                out = None
                async for message in client.iter_messages(bot_entity, limit=5):
                    if message.from_id and hasattr(message.from_id, 'user_id'):
                        if message.from_id.user_id == bot_entity.id:
                            msg_text = message.message or ""
                            if msg_text:
                                return msg_text
                return out
            try:
                bot_message = await run_with_timeout(_read_bot_messages(), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
                if bot_message is TIMEOUT_SENTINEL:
                    bot_message = None
            except Exception:
                pass
        
        await client.disconnect()
        
        if not bot_message:
            logger.warning("[SESSION FAIL] %s error=%s", session_path, "No response from @spambot after timeout")
            return (SessionHealthStatus.FAILED, "No response from @spambot after timeout")
        
        # Classify the response
        logger.info("[SESSION END] %s success", session_path)
        return classify_spambot_response(bot_message)
        
    except errors.AuthKeyUnregisteredError:
        try:
            await client.disconnect()
        except:
            pass
        logger.warning("[SESSION FAIL] %s error=%s", session_path, "AUTH_KEY_UNREGISTERED")
        return (SessionHealthStatus.FAILED, "UNAUTHORIZED_SESSION")
    except errors.SessionPasswordNeededError:
        try:
            await client.disconnect()
        except:
            pass
        logger.warning("[SESSION FAIL] %s error=%s", session_path, "SESSION_PASSWORD_NEEDED")
        return (SessionHealthStatus.FAILED, "UNAUTHORIZED_SESSION")
    except errors.UserDeactivatedError:
        try:
            await client.disconnect()
        except:
            pass
        logger.warning("[SESSION FAIL] %s error=%s", session_path, "USER_DEACTIVATED")
        return (SessionHealthStatus.FAILED, "USER_DEACTIVATED")
    except Exception as e:
        try:
            await client.disconnect()
        except:
            pass
        logger.warning("[SESSION FAIL] %s error=%s", session_path, str(e))
        return (SessionHealthStatus.FAILED, f"Error: {str(e)}")


def classify_spambot_response(response_text: str) -> Tuple[str, Optional[str]]:
    """
    Classify SpamBot response into health status.
    
    Args:
        response_text: The bot's response message
    
    Returns:
        Tuple: (SessionHealthStatus, optional_details)
    """
    if not response_text:
        return (SessionHealthStatus.UNKNOWN, "Empty response")
    
    # Convert to lowercase for matching
    text_lower = response_text.lower()
    
    # ✅ ACTIVE: "Good news", "no limits are currently applied", "free as a bird"
    if all(phrase in text_lower for phrase in [
        'good news',
        'no limits are currently applied',
        'free as a bird'
    ]):
        return (SessionHealthStatus.ACTIVE, None)
    
    # ❌ FROZEN: "Your account was blocked for violations of the Telegram Terms of Service"
    if 'your account was blocked for violations of the telegram terms of service' in text_lower:
        return (SessionHealthStatus.FROZEN, None)
    
    # ⛔ HARD_LIMITED: "harsh response from our anti-spam systems" OR "submit a complaint to our moderators"
    if 'harsh response from our anti-spam systems' in text_lower or 'submit a complaint to our moderators' in text_lower:
        return (SessionHealthStatus.HARD_LIMITED, None)
    
    # ⚠️ TEMP_LIMITED: "your account is now limited until"
    if 'your account is now limited until' in text_lower:
        # Try to extract the date
        date_match = re.search(
            r'your account is now limited until\s+([^\.]+?)(?:\.|$)',
            response_text,
            re.IGNORECASE
        )
        if date_match:
            date_str = date_match.group(1).strip()
            return (SessionHealthStatus.TEMP_LIMITED, date_str)
        else:
            # Still mark as TEMP_LIMITED even if date parsing fails
            return (SessionHealthStatus.TEMP_LIMITED, None)
    
    # ❓ UNKNOWN: Response doesn't match any known patterns
    # Return first 200 chars as excerpt
    excerpt = response_text[:200] if len(response_text) > 200 else response_text
    return (SessionHealthStatus.UNKNOWN, excerpt)


async def check_sessions_health_parallel(sessions: list) -> Dict[int, Dict[str, Any]]:
    """
    Check health status for multiple sessions in parallel.
    
    Args:
        sessions: List of session dicts with 'path' key
    
    Returns:
        Dict mapping session index to check result
    """
    async def check_with_index(session_info: Dict[str, Any], index: int):
        session_path = session_info.get("path")
        if not session_path:
            return index, {
                "success": False,
                "session": "unknown",
                "status": SessionHealthStatus.FAILED,
                "details": "No session path provided",
                "index": index
            }
        
        status, details = await check_session_health_spambot(session_path)
        return index, {
            "success": status != SessionHealthStatus.FAILED,
            "session": session_path,
            "status": status,
            "details": details,
            "index": index
        }
    
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_SESSIONS)
    async def sem_task(session_info: Dict[str, Any], index: int):
        async with semaphore:
            return await check_with_index(session_info, index)
    tasks = [sem_task(session_info, idx) for idx, session_info in enumerate(sessions)]
    results_list = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Handle exceptions
    results = {}
    for item in results_list:
        if isinstance(item, Exception):
            idx = results_list.index(item)
            results[idx] = {
                "success": False,
                "session": sessions[idx].get("path", "unknown"),
                "status": SessionHealthStatus.FAILED,
                "details": f"Exception: {str(item)}",
                "index": idx
            }
        else:
            idx, result = item
            results[idx] = result
    
    return results

