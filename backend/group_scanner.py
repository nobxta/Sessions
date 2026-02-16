from telethon import TelegramClient, errors
from telethon.tl.types import Channel, Chat, User
import asyncio
from typing import List, Dict, Any
from async_timeout import run_with_timeout, CONNECT_TIMEOUT, API_TIMEOUT, TIMEOUT_SENTINEL
from concurrency_config import MAX_CONCURRENT_SESSIONS
import logging

logger = logging.getLogger(__name__)
API_ID = '25170767'
API_HASH = 'd512fd74809a4ca3cd59078eef73afcd'


async def scan_groups_for_session(session_path: str) -> Dict[str, Any]:
    """
    Scan all groups and supergroups for a single Telegram session.
    
    Args:
        session_path: Path to the .session file (with or without .session extension)
    
    Returns:
        Dict with session info, group count, and error if any
    """
    import os
    
    # Check if session file exists (with or without .session extension)
    session_file_with_ext = session_path if session_path.endswith('.session') else f"{session_path}.session"
    session_file_without_ext = session_path[:-8] if session_path.endswith('.session') else session_path
    
    # Check both possible paths
    if not os.path.exists(session_file_with_ext) and not os.path.exists(f"{session_file_without_ext}.session"):
        return {
            "success": False,
            "session": session_path,
            "group_count": 0,
            "error": f"Session file not found: {session_file_with_ext}"
        }
    
    # Remove .session extension if present (Telethon expects path without extension)
    if session_path.endswith('.session'):
        session_path = session_path[:-8]
    logger.info("[SESSION START] %s", session_path)
    client = TelegramClient(session_path, API_ID, API_HASH)
    
    try:
        logger.info("[SESSION ACTION] %s connect", session_path)
        r = await run_with_timeout(client.connect(), CONNECT_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if r is TIMEOUT_SENTINEL:
            logger.warning("[SESSION FAIL] %s error=%s", session_path, "Connection timed out")
            return {
                "success": False,
                "session": session_path,
                "group_count": 0,
                "error": "Connection timed out"
            }
        
        # Check if authorized
        is_auth = await run_with_timeout(client.is_user_authorized(), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if is_auth is TIMEOUT_SENTINEL:
            await client.disconnect()
            return {
                "success": False,
                "session": session_path,
                "group_count": 0,
                "error": "Operation timed out"
            }
        if not is_auth:
            await client.disconnect()
            return {
                "success": False,
                "session": session_path,
                "group_count": 0,
                "error": "Session is not authorized"
            }
        
        # Get all dialogs
        dialogs = await run_with_timeout(client.get_dialogs(), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if dialogs is TIMEOUT_SENTINEL:
            await client.disconnect()
            return {
                "success": False,
                "session": session_path,
                "group_count": 0,
                "error": "Operation timed out"
            }
        
        # Count groups and supergroups
        group_count = 0
        groups_list = []
        
        for dialog in dialogs:
            entity = dialog.entity
            
            # Check if it's a group or supergroup (Channel with megagroup=True)
            if isinstance(entity, Channel):
                if entity.megagroup:  # Supergroup
                    group_count += 1
                    groups_list.append({
                        "id": entity.id,
                        "title": entity.title,
                        "access_hash": entity.access_hash
                    })
            elif isinstance(entity, Chat):  # Legacy group
                group_count += 1
                groups_list.append({
                    "id": entity.id,
                    "title": entity.title,
                    "access_hash": None
                })
            # Ignore: User (private chats), Channel (broadcast channels), Bot
        
        await client.disconnect()
        logger.info("[SESSION END] %s success", session_path)
        return {
            "success": True,
            "session": session_path,
            "group_count": group_count,
            "groups": groups_list
        }
        
    except errors.AuthKeyUnregisteredError:
        try:
            await client.disconnect()
        except:
            pass
        logger.warning("[SESSION FAIL] %s error=%s", session_path, "Session is not authorized")
        return {
            "success": False,
            "session": session_path,
            "group_count": 0,
            "error": "Session is not authorized"
        }
    except FileNotFoundError:
        try:
            await client.disconnect()
        except:
            pass
        return {
            "success": False,
            "session": session_path,
            "group_count": 0,
            "error": f"Session file not found: {session_path}.session"
        }
    except Exception as e:
        try:
            await client.disconnect()
        except:
            pass
        error_msg = str(e)
        logger.warning("[SESSION FAIL] %s error=%s", session_path, error_msg)
        # Check for common file-related errors
        if "No such file" in error_msg or "not found" in error_msg.lower():
            return {
                "success": False,
                "session": session_path,
                "group_count": 0,
                "error": f"Session file not found: {session_path}.session"
            }
        return {
            "success": False,
            "session": session_path,
            "group_count": 0,
            "error": f"Scan error: {error_msg}"
        }


async def scan_groups_parallel(sessions: List[Dict[str, Any]], websocket=None) -> Dict[int, Dict[str, Any]]:
    """
    Scan groups for multiple sessions in parallel.
    
    Args:
        sessions: List of session dicts with 'path' key
        websocket: Optional WebSocket for real-time updates
    
    Returns:
        Dict mapping session index to scan result
    """
    async def scan_with_index(session_info: Dict[str, Any], index: int):
        session_path = session_info.get("path")
        if not session_path:
            return index, {
                "success": False,
                "session": "unknown",
                "group_count": 0,
                "error": "No session path provided",
                "index": index
            }
        
        if websocket:
            try:
                await websocket.send_json({
                    "type": "scan_progress",
                    "index": index,
                    "message": f"Scanning groups for session {index + 1}..."
                })
            except:
                pass  # Ignore websocket errors
        
        result = await scan_groups_for_session(session_path)
        result["index"] = index
        
        if websocket:
            try:
                await websocket.send_json({
                    "type": "scan_result",
                    "index": index,
                    "result": result
                })
            except:
                pass  # Ignore websocket errors
        
        return index, result
    
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_SESSIONS)
    async def sem_task(session_info: Dict[str, Any], index: int):
        async with semaphore:
            return await scan_with_index(session_info, index)
    tasks = [sem_task(session_info, idx) for idx, session_info in enumerate(sessions)]
    results_list = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Handle exceptions
    results = {}
    for item in results_list:
        if isinstance(item, Exception):
            # Find the index for this exception
            idx = results_list.index(item)
            results[idx] = {
                "success": False,
                "session": sessions[idx].get("path", "unknown"),
                "group_count": 0,
                "error": f"Exception: {str(item)}",
                "index": idx
            }
        else:
            idx, result = item
            results[idx] = result
    
    return results

