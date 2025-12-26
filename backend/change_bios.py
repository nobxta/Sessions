from telethon import TelegramClient, errors
from telethon.tl.functions.account import UpdateProfileRequest
import asyncio
import os
from typing import List, Dict, Any

API_ID = '25170767'
API_HASH = 'd512fd74809a4ca3cd59078eef73afcd'


async def change_bio_for_session(session_path: str, new_bio: str) -> Dict[str, Any]:
    """
    Change the bio (about) for a Telegram session
    
    Args:
        session_path: Path to the .session file (without .session extension)
        new_bio: New bio text to set (max 70 characters)
    
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
        
        # Update bio (about) using raw API
        await client(UpdateProfileRequest(about=new_bio))
        
        await client.disconnect()
        
        return {
            "success": True,
            "new_bio": new_bio,
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
            error_msg = "Frozen Account - Cannot update bio"
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
            error_msg = "Frozen Account - Cannot update bio"
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


async def change_bios_parallel(sessions: List[Dict[str, Any]]) -> Dict[int, Dict[str, Any]]:
    """
    Change bios for multiple sessions in parallel
    
    Args:
        sessions: List of dicts with 'path' and 'new_bio'
    
    Returns:
        dict: Results indexed by session index
    """
    async def change_bio_with_index(path: str, bio: str, index: int):
        result = await change_bio_for_session(path, bio)
        return index, result
    
    tasks = []
    
    for idx, session_info in enumerate(sessions):
        session_path = session_info.get("path") or session_info.get("name", "")
        new_bio = session_info.get("new_bio", "")
        
        tasks.append(change_bio_with_index(session_path, new_bio, idx))
    
    # Run all updates in parallel
    results_list = await asyncio.gather(*tasks)
    
    # Convert to dict indexed by session index
    results = {index: result for index, result in results_list}
    
    return results

