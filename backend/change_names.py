from telethon import TelegramClient, errors
from telethon.tl.functions.account import UpdateProfileRequest
import asyncio
import os
from typing import List, Dict, Any

API_ID = '25170767'
API_HASH = 'd512fd74809a4ca3cd59078eef73afcd'


async def change_name_for_session(session_path: str, new_first_name: str) -> Dict[str, Any]:
    """
    Change the display name (first name) for a Telegram session
    
    Args:
        session_path: Path to the .session file (without .session extension)
        new_first_name: New first name to set
    
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
        current_first_name = me.first_name
        current_last_name = me.last_name or ""
        
        # Update profile: set first name to user's input, clear last name
        # so the displayed name is exactly what they entered
        await client(UpdateProfileRequest(
            first_name=new_first_name,
            last_name=""  # always clear last name; full display name = first name only
        ))
        
        await client.disconnect()
        
        return {
            "success": True,
            "old_name": current_first_name,
            "new_name": new_first_name,
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
            error_msg = "Frozen Account - Cannot update name"
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
            error_msg = "Frozen Account - Cannot update name"
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


async def change_names_parallel(sessions: List[Dict[str, Any]]) -> Dict[int, Dict[str, Any]]:
    """
    Change names for multiple sessions in parallel
    
    Args:
        sessions: List of dicts with 'path' and 'new_first_name'
    
    Returns:
        dict: Results indexed by session index
    """
    async def change_name_with_index(path: str, name: str, index: int):
        result = await change_name_for_session(path, name)
        return index, result
    
    tasks = []
    
    for idx, session_info in enumerate(sessions):
        session_path = session_info.get("path") or session_info.get("name", "")
        new_first_name = session_info.get("new_first_name", "")
        
        # Create task with captured index
        tasks.append(change_name_with_index(session_path, new_first_name, idx))
    
    # Run all updates in parallel
    results_list = await asyncio.gather(*tasks)
    
    # Convert to dict indexed by session index
    results = {index: result for index, result in results_list}
    
    return results

