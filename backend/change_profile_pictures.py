from telethon import TelegramClient, errors
from telethon.tl.functions.photos import UploadProfilePhotoRequest
import asyncio
import os
import base64
import tempfile
from typing import List, Dict, Any
from async_timeout import run_with_timeout, CONNECT_TIMEOUT, API_TIMEOUT, TIMEOUT_SENTINEL

API_ID = '25170767'
API_HASH = 'd512fd74809a4ca3cd59078eef73afcd'


async def change_profile_picture_for_session(session_path: str, image_path: str, websocket=None, index: int = 0) -> Dict[str, Any]:
    """
    Change the profile picture for a Telegram session
    
    Args:
        session_path: Path to the .session file (without .session extension)
        image_path: Path to the image file to upload
        websocket: Optional WebSocket for progress updates
        index: Session index for progress updates
    
    Returns:
        dict: Result with success status and details
    """
    # Remove .session extension if present
    if session_path.endswith('.session'):
        session_path = session_path[:-8]
    
    client = TelegramClient(session_path, API_ID, API_HASH)
    
    try:
        if websocket:
            await websocket.send_json({
                "type": "progress",
                "index": index,
                "message": f"Updating profile picture for session {index + 1}...",
                "current": index
            })
        
        r = await run_with_timeout(client.connect(), CONNECT_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if r is TIMEOUT_SENTINEL:
            result = {
                "success": False,
                "error": "Connection timed out",
                "session_path": session_path
            }
            if websocket:
                await websocket.send_json({"type": "result", "index": index, "result": result})
            return result
        
        # Check if authorized
        is_auth = await run_with_timeout(client.is_user_authorized(), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if is_auth is TIMEOUT_SENTINEL:
            await client.disconnect()
            result = {
                "success": False,
                "error": "Operation timed out",
                "session_path": session_path
            }
            if websocket:
                await websocket.send_json({"type": "result", "index": index, "result": result})
            return result
        if not is_auth:
            await client.disconnect()
            result = {
                "success": False,
                "error": "Session is not authorized",
                "session_path": session_path
            }
            if websocket:
                await websocket.send_json({"type": "result", "index": index, "result": result})
            return result
        
        # Upload and set profile picture
        # Step 1: Upload the photo file to Telegram servers
        uploaded_file = await run_with_timeout(client.upload_file(image_path), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if uploaded_file is TIMEOUT_SENTINEL:
            await client.disconnect()
            result = {
                "success": False,
                "error": "Operation timed out",
                "session_path": session_path
            }
            if websocket:
                await websocket.send_json({"type": "result", "index": index, "result": result})
            return result
        
        # Step 2: Set it as profile photo using UploadProfilePhotoRequest
        update_result = await run_with_timeout(
            client(UploadProfilePhotoRequest(file=uploaded_file)),
            API_TIMEOUT,
            default=TIMEOUT_SENTINEL,
            session_path=session_path
        )
        if update_result is TIMEOUT_SENTINEL:
            await client.disconnect()
            result = {
                "success": False,
                "error": "Operation timed out",
                "session_path": session_path
            }
            if websocket:
                await websocket.send_json({"type": "result", "index": index, "result": result})
            return result
        
        await client.disconnect()
        
        result = {
            "success": True,
            "session_path": session_path
        }
        
        if websocket:
            await websocket.send_json({
                "type": "result",
                "index": index,
                "result": result
            })
        
        return result
        
    except errors.FloodWaitError as e:
        await client.disconnect()
        result = {
            "success": False,
            "error": f"Rate limited. Please wait {e.seconds} seconds",
            "session_path": session_path
        }
        if websocket:
            await websocket.send_json({
                "type": "result",
                "index": index,
                "result": result
            })
        return result
    except errors.UserDeactivatedError:
        await client.disconnect()
        result = {
            "success": False,
            "error": "Account is deactivated",
            "session_path": session_path
        }
        if websocket:
            await websocket.send_json({
                "type": "result",
                "index": index,
                "result": result
            })
        return result
    except errors.UserDeactivatedBanError:
        await client.disconnect()
        result = {
            "success": False,
            "error": "Account is banned",
            "session_path": session_path
        }
        if websocket:
            await websocket.send_json({
                "type": "result",
                "index": index,
                "result": result
            })
        return result
    except errors.RPCError as e:
        await client.disconnect()
        # Handle frozen account error
        if "FROZEN_METHOD_INVALID" in str(e) or "420" in str(e):
            error_msg = "Frozen Account - Cannot update profile picture"
        else:
            error_msg = f"Telegram error: {str(e)}"
        result = {
            "success": False,
            "error": error_msg,
            "session_path": session_path
        }
        if websocket:
            await websocket.send_json({
                "type": "result",
                "index": index,
                "result": result
            })
        return result
    except Exception as e:
        try:
            await client.disconnect()
        except:
            pass
        # Parse error message for better user experience
        error_str = str(e)
        if "FROZEN_METHOD_INVALID" in error_str or "420" in error_str:
            error_msg = "Frozen Account - Cannot update profile picture"
        elif "RPCError" in error_str:
            # Extract meaningful part of RPC error
            if "FROZEN" in error_str:
                error_msg = "Frozen Account"
            else:
                error_msg = f"Telegram API error: {error_str.split('(')[0] if '(' in error_str else error_str}"
        else:
            error_msg = error_str
        result = {
            "success": False,
            "error": error_msg,
            "session_path": session_path
        }
        if websocket:
            await websocket.send_json({
                "type": "result",
                "index": index,
                "result": result
            })
        return result


async def change_profile_pictures_parallel(sessions: List[Dict[str, Any]], image_path: str, websocket=None) -> Dict[int, Dict[str, Any]]:
    """
    Change profile pictures for multiple sessions in parallel
    
    Args:
        sessions: List of dicts with 'path'
        image_path: Path to the image file
        websocket: Optional WebSocket for progress updates
    
    Returns:
        dict: Results indexed by session index
    """
    async def change_picture_with_index(path: str, img_path: str, idx: int):
        result = await change_profile_picture_for_session(path, img_path, websocket, idx)
        return idx, result
    
    tasks = []
    
    for idx, session_info in enumerate(sessions):
        session_path = session_info.get("path") or session_info.get("name", "")
        tasks.append(change_picture_with_index(session_path, image_path, idx))
    
    # Run all updates in parallel
    results_list = await asyncio.gather(*tasks)
    
    # Convert to dict indexed by session index
    results = {index: result for index, result in results_list}
    
    return results

