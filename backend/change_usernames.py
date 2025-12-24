from telethon import TelegramClient, errors
import asyncio
import os
from typing import List, Dict, Any

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
        await client.connect()
        
        # Check if authorized
        if not await client.is_user_authorized():
            await client.disconnect()
            return {
                "success": False,
                "error": "Session is not authorized",
                "session_path": session_path
            }
        
        # Get current user info
        me = await client.get_me()
        current_username = me.username or ""
        
        # Update username (empty string removes it)
        await client.edit_profile(username=new_username or None)
        
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

