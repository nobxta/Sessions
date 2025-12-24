from telethon import TelegramClient, events, errors
import asyncio
import re
from typing import Dict, Any

API_ID = '25170767'
API_HASH = 'd512fd74809a4ca3cd59078eef73afcd'
TGDNA_BOT_USERNAME = 'TGDNAbot'  # Also try 'tgdnabot' if this doesn't work


async def check_session_age_tgdna(
    session_path: str,
    api_id: int = None,
    api_hash: str = None,
    timeout: int = 30
) -> Dict[str, Any]:
    """
    Check account age and details using @TGDNAbot.
    
    Args:
        session_path: Path to the .session file (without .session extension)
        api_id: Telegram API ID (uses default if not provided)
        api_hash: Telegram API Hash (uses default if not provided)
        timeout: Timeout in seconds for the operation
    
    Returns:
        Dict with account age information
    """
    # Use provided API credentials or defaults
    if api_id is None:
        api_id = int(API_ID)
    if api_hash is None:
        api_hash = API_HASH
    
    # Remove .session extension if present
    if session_path.endswith('.session'):
        session_path = session_path[:-8]
    
    client = TelegramClient(session_path, api_id, api_hash)
    
    result = {
        "success": False,
        "session": session_path,
        "created": None,
        "account_age": None,
        "premium": None,
        "scam": None,
        "fake": None,
        "error": None
    }
    
    try:
        await client.start()
        
        if not await client.is_user_authorized():
            await client.disconnect()
            result["error"] = "Session is not authorized"
            return result
        
        # Get current user info
        me = await client.get_me()
        user_id = me.id
        
        # Open chat with TGDNAbot (try multiple possible usernames)
        bot_entity = None
        possible_usernames = ['TGDNAbot', 'tgdnabot', 'TG_DNA_bot']
        
        for username in possible_usernames:
            try:
                bot_entity = await client.get_entity(username)
                break
            except:
                continue
        
        if not bot_entity:
            await client.disconnect()
            result["error"] = f"Could not find @TGDNAbot (tried: {', '.join(possible_usernames)})"
            return result
        
        # Send /start command
        try:
            await client.send_message(bot_entity, '/start')
        except Exception as e:
            await client.disconnect()
            result["error"] = f"Failed to send /start: {str(e)}"
            return result
        
        # Wait 1 second
        await asyncio.sleep(1)
        
        # Send user ID and record the time
        try:
            user_id_message = await client.send_message(bot_entity, str(user_id))
            user_id_sent_time = user_id_message.date if hasattr(user_id_message, 'date') else None
        except Exception as e:
            await client.disconnect()
            result["error"] = f"Failed to send user ID: {str(e)}"
            return result
        
        # Use event handler to listen for new messages from the bot
        bot_messages = []
        message_received = asyncio.Event()
        
        @client.on(events.NewMessage(from_users=bot_entity.id))
        async def handler(event):
            nonlocal bot_messages
            msg_text = event.message.message or ""
            if msg_text:
                bot_messages.append(msg_text)
                # If we got the detailed response, set the event
                msg_lower = msg_text.lower()
                if any(keyword in msg_lower for keyword in [
                    'created:', 'account age:', 'premium:', 'scam label:', 'fake label:'
                ]):
                    message_received.set()
        
        # Wait for bot response with timeout
        try:
            await asyncio.wait_for(message_received.wait(), timeout=10.0)
        except asyncio.TimeoutError:
            pass  # Will check bot_messages below
        
        # If event handler didn't catch it, try reading messages directly
        if not bot_messages:
            try:
                async for message in client.iter_messages(bot_entity, limit=10):
                    if message.from_id and hasattr(message.from_id, 'user_id'):
                        if message.from_id.user_id == bot_entity.id:
                            msg_text = message.message or ""
                            if msg_text:
                                bot_messages.append(msg_text)
            except Exception as e:
                pass
        
        # Look for the detailed response (skip greeting messages)
        bot_message = None
        for msg_text in bot_messages:
            msg_lower = msg_text.lower()
            
            # Skip greeting messages
            if 'send @username' in msg_lower or 'forward the user' in msg_lower or ('hey' in msg_lower and 'look them up' in msg_lower):
                continue
            
            # Look for the detailed response with account info
            indicators_found = sum(1 for keyword in [
                'created:', 'account age:', 'premium:', 'scam label:', 'fake label:',
                'id:', 'name:', 'dc:', 'username:', 'language:', 'date:', 'photos:', 'status:'
            ] if keyword in msg_lower)
            
            if indicators_found >= 3:  # Need at least 3 indicators to be sure
                bot_message = msg_text
                break
        
        if not bot_message:
            await client.disconnect()
            result["error"] = f"No response from @TGDNAbot or response format not recognized. Messages received: {len(bot_messages)}"
            return result
        
        parsed_data = parse_tgdna_response(bot_message)
        
        if parsed_data:
            result.update(parsed_data)
            result["success"] = True
        else:
            # Include a snippet of the message for debugging
            msg_snippet = bot_message[:200] if len(bot_message) > 200 else bot_message
            result["error"] = f"Could not parse bot response. Message snippet: {msg_snippet}"
        
        await client.disconnect()
        return result
        
    except errors.AuthKeyUnregisteredError:
        try:
            await client.disconnect()
        except:
            pass
        result["error"] = "Session is not authorized"
        return result
    except errors.UserBannedInChannel:
        try:
            await client.disconnect()
        except:
            pass
        result["error"] = "Account is banned"
        return result
    except asyncio.TimeoutError:
        try:
            await client.disconnect()
        except:
            pass
        result["error"] = "Operation timed out"
        return result
    except Exception as e:
        try:
            await client.disconnect()
        except:
            pass
        result["error"] = f"Error: {str(e)}"
        return result


def parse_tgdna_response(message_text: str) -> Dict[str, Any]:
    """
    Parse TGDNAbot response text to extract account information.
    
    Args:
        message_text: The bot's response message
    
    Returns:
        Dict with parsed data or None if parsing fails
    """
    if not message_text:
        return None
    
    result = {
        "created": None,
        "account_age": None,
        "premium": None,
        "scam": None,
        "fake": None
    }
    
    # Parse Created date (format: Created: 2024-08)
    created_match = re.search(r'Created:\s*(\d{4}-\d{2})', message_text, re.IGNORECASE)
    if created_match:
        result["created"] = created_match.group(1)
    
    # Parse Account Age (format: Account Age: 1 year or Account Age: 2 years)
    age_match = re.search(r'Account Age:\s*(\d+)\s*(?:year|years?)', message_text, re.IGNORECASE)
    if age_match:
        years = int(age_match.group(1))
        result["account_age"] = f"{years} year{'s' if years != 1 else ''}"
    
    # Parse Premium status (format: Premium: Active or Premium: Inactive)
    premium_match = re.search(r'Premium:\s*(Active|Inactive)', message_text, re.IGNORECASE)
    if premium_match:
        result["premium"] = premium_match.group(1).lower() == 'active'
    
    # Parse Scam Label (format: Scam Label: No or Scam Label: Yes)
    scam_match = re.search(r'Scam\s*Label:\s*(Yes|No)', message_text, re.IGNORECASE)
    if scam_match:
        result["scam"] = scam_match.group(1).lower() == 'yes'
    
    # Parse Fake Label (format: Fake Label: No or Fake Label: Yes)
    fake_match = re.search(r'Fake\s*Label:\s*(Yes|No)', message_text, re.IGNORECASE)
    if fake_match:
        result["fake"] = fake_match.group(1).lower() == 'yes'
    
    # Return None if no data was parsed
    if all(v is None for v in result.values()):
        return None
    
    return result


async def check_sessions_age_parallel(sessions: list) -> Dict[int, Dict[str, Any]]:
    """
    Check account age for multiple sessions in parallel.
    
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
                "error": "No session path provided",
                "index": index
            }
        
        result = await check_session_age_tgdna(session_path)
        result["index"] = index
        return index, result
    
    tasks = [check_with_index(session_info, idx) for idx, session_info in enumerate(sessions)]
    results_list = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Handle exceptions
    results = {}
    for item in results_list:
        if isinstance(item, Exception):
            idx = results_list.index(item)
            results[idx] = {
                "success": False,
                "session": sessions[idx].get("path", "unknown"),
                "error": f"Exception: {str(item)}",
                "index": idx
            }
        else:
            idx, result = item
            results[idx] = result
    
    return results

