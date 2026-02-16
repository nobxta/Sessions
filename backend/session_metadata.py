from telethon import TelegramClient, errors
from async_timeout import run_with_timeout, CONNECT_TIMEOUT, API_TIMEOUT, TIMEOUT_SENTINEL
from telethon.tl.functions.account import GetPasswordRequest
import asyncio
from typing import Dict, Any, List

API_ID = '25170767'
API_HASH = 'd512fd74809a4ca3cd59078eef73afcd'


async def extract_session_metadata(
    session_path: str,
    api_id: int = None,
    api_hash: str = None
) -> Dict[str, Any]:
    """
    Extract read-only metadata from a Telegram session.
    
    Args:
        session_path: Path to the .session file (with or without .session extension)
        api_id: Telegram API ID (uses default if not provided)
        api_hash: Telegram API Hash (uses default if not provided)
    
    Returns:
        Dict with session metadata including:
        - phone_number
        - user_id
        - first_name
        - last_name
        - username (or "Not set")
        - premium (Yes/No)
        - language_code
        - dc_id
        - profile_photo (Set/Not set)
        - two_factor_enabled (Yes/No)
        - account_creation_year (or None if not available)
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
        "phone_number": None,
        "user_id": None,
        "first_name": None,
        "last_name": None,
        "username": None,
        "premium": None,
        "language_code": None,
        "dc_id": None,
        "profile_photo": None,
        "two_factor_enabled": None,
        "account_creation_year": None,
        "error": None
    }
    
    try:
        r = await run_with_timeout(client.connect(), CONNECT_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if r is TIMEOUT_SENTINEL:
            result["error"] = "Connection timed out"
            return result
        
        # Check if authorized
        is_auth = await run_with_timeout(client.is_user_authorized(), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if is_auth is TIMEOUT_SENTINEL or not is_auth:
            await client.disconnect()
            result["error"] = "Session is not authorized" if is_auth is not TIMEOUT_SENTINEL else "Operation timed out"
            return result
        
        # Get user info
        me = await run_with_timeout(client.get_me(), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if me is TIMEOUT_SENTINEL:
            await client.disconnect()
            result["error"] = "Operation timed out"
            return result
        
        # Extract basic info
        result["phone_number"] = me.phone or "Not set"
        result["user_id"] = me.id
        result["first_name"] = me.first_name or ""
        result["last_name"] = me.last_name or ""
        result["username"] = me.username or "Not set"
        result["premium"] = "Yes" if getattr(me, 'premium', False) else "No"
        # Language code is not directly available on User object in Telethon
        # We'll set it to "Not set" as it requires additional API calls to get account settings
        result["language_code"] = "Not set"
        
        # Get DC ID from client session
        try:
            result["dc_id"] = client.session.dc_id
        except Exception:
            result["dc_id"] = "Unknown"
        
        # Check if profile photo is set
        result["profile_photo"] = "Set" if me.photo else "Not set"
        
        # Check 2FA status
        try:
            password_info = await client(GetPasswordRequest())
            result["two_factor_enabled"] = "Yes" if password_info.has_password else "No"
        except Exception:
            # If we can't get password info, default to unknown
            result["two_factor_enabled"] = "Unknown"
        
        # Account creation year - Telethon doesn't expose this directly
        # We could use TGDNA checker, but that violates read-only requirement
        # So we'll leave it as None or try to get from user entity if available
        # Note: User entity doesn't expose creation date, so we set it to None
        result["account_creation_year"] = None
        
        result["success"] = True
        await client.disconnect()
        return result
        
    except errors.AuthKeyUnregisteredError:
        try:
            await client.disconnect()
        except:
            pass
        result["error"] = "Session is not authorized"
        return result
    except Exception as e:
        try:
            await client.disconnect()
        except:
            pass
        result["error"] = f"Error extracting metadata: {str(e)}"
        return result


async def extract_metadata_parallel(sessions: List[Dict[str, Any]]) -> Dict[int, Dict[str, Any]]:
    """
    Extract metadata for multiple sessions in parallel.
    
    Args:
        sessions: List of session dicts with 'path' and optionally 'name'
    
    Returns:
        Dict mapping session index to metadata result
    """
    async def extract_with_index(session_info: Dict[str, Any], index: int):
        session_path = session_info.get("path")
        if not session_path:
            return index, {
                "success": False,
                "session": "unknown",
                "error": "No session path provided",
                "index": index
            }
        
        result = await extract_session_metadata(session_path)
        result["index"] = index
        result["session_name"] = session_info.get("name", session_path)
        return index, result
    
    tasks = [extract_with_index(session_info, idx) for idx, session_info in enumerate(sessions)]
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

