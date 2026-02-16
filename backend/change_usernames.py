from telethon import TelegramClient, errors
from telethon.tl.functions.account import UpdateProfileRequest
import asyncio
import os
from typing import List, Dict, Any
from async_timeout import run_with_timeout, CONNECT_TIMEOUT, API_TIMEOUT, TIMEOUT_SENTINEL

API_ID = '25170767'
API_HASH = 'd512fd74809a4ca3cd59078eef73afcd'


async def change_username_for_session(session_path: str, new_username: str) -> Dict[str, Any]:
    """
    Change the username for a Telegram session
    
    Args:
        session_path: Path to the .session file (without .session extension)
        new_username: New username to set (without @), empty string to remove
    
    Returns:
        dict: Result with success status and details
    """
    # Remove .session extension if present
    if session_path.endswith('.session'):
        session_path = session_path[:-8]
    
    client = TelegramClient(session_path, API_ID, API_HASH)
    
    try:
        r = await run_with_timeout(client.connect(), CONNECT_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if r is TIMEOUT_SENTINEL:
            return {
                "success": False,
                "error": "Connection timed out",
                "session_path": session_path
            }
        
        # Check if authorized
        is_auth = await run_with_timeout(client.is_user_authorized(), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if is_auth is TIMEOUT_SENTINEL:
            await client.disconnect()
            return {
                "success": False,
                "error": "Operation timed out",
                "session_path": session_path
            }
        if not is_auth:
            await client.disconnect()
            return {
                "success": False,
                "error": "Session is not authorized",
                "session_path": session_path
            }
        
        # Get current user info
        me = await run_with_timeout(client.get_me(), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if me is TIMEOUT_SENTINEL:
            await client.disconnect()
            return {
                "success": False,
                "error": "Operation timed out",
                "session_path": session_path
            }
        current_username = me.username or ""
        
        # Update username using raw API (empty string removes it, None also works)
        update_result = await run_with_timeout(client(UpdateProfileRequest(username=new_username or None)), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if update_result is TIMEOUT_SENTINEL:
            await client.disconnect()
            return {
                "success": False,
                "error": "Operation timed out",
                "session_path": session_path
            }
        
        await client.disconnect()
        
        return {
            "success": True,
            "old_username": current_username,
            "new_username": new_username,
            "session_path": session_path
        }
        
    except errors.UsernameOccupiedError:
        await client.disconnect()
        return {
            "success": False,
            "error": "Username is already taken",
            "session_path": session_path
        }
    except errors.UsernameInvalidError:
        await client.disconnect()
        return {
            "success": False,
            "error": "Username is invalid",
            "session_path": session_path
        }
    except errors.FloodWaitError as e:
        await client.disconnect()
        return {
            "success": False,
            "error": f"Rate limited. Please wait {e.seconds} seconds",
            "session_path": session_path
        }
    except errors.UserDeactivatedError:
        await client.disconnect()
        return {
            "success": False,
            "error": "Account is deactivated",
            "session_path": session_path
        }
    except errors.UserDeactivatedBanError:
        await client.disconnect()
        return {
            "success": False,
            "error": "Account is banned",
            "session_path": session_path
        }
    except errors.RPCError as e:
        await client.disconnect()
        if "FROZEN_METHOD_INVALID" in str(e) or "420" in str(e):
            error_msg = "Frozen Account - Cannot update username"
        else:
            error_msg = f"Telegram error: {str(e)}"
        return {
            "success": False,
            "error": error_msg,
            "session_path": session_path
        }
    except Exception as e:
        try:
            await client.disconnect()
        except:
            pass
        error_str = str(e)
        if "FROZEN_METHOD_INVALID" in error_str or "420" in error_str:
            error_msg = "Frozen Account - Cannot update username"
        elif "RPCError" in error_str:
            if "FROZEN" in error_str:
                error_msg = "Frozen Account"
            else:
                error_msg = f"Telegram API error: {error_str.split('(')[0] if '(' in error_str else error_str}"
        else:
            error_msg = error_str
        return {
            "success": False,
            "error": error_msg,
            "session_path": session_path
        }


async def change_usernames_parallel(sessions: List[Dict[str, Any]]) -> Dict[int, Dict[str, Any]]:
    """
    Change usernames for multiple sessions in parallel
    
    Args:
        sessions: List of dicts with 'path' and 'new_username'
    
    Returns:
        dict: Results indexed by session index
    """
    async def change_username_with_index(path: str, username: str, index: int):
        result = await change_username_for_session(path, username)
        return index, result
    
    tasks = []
    
    for idx, session_info in enumerate(sessions):
        session_path = session_info.get("path") or session_info.get("name", "")
        new_username = session_info.get("new_username", "")
        
        tasks.append(change_username_with_index(session_path, new_username, idx))
    
    # Run all updates in parallel
    results_list = await asyncio.gather(*tasks)
    
    # Convert to dict indexed by session index
    results = {index: result for index, result in results_list}
    
    return results

