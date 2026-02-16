from telethon import TelegramClient, errors
from telethon.tl.functions.messages import GetDialogFiltersRequest
from telethon.tl.types import DialogFilter, DialogFilterDefault, DialogFilterChatlist
import asyncio
from typing import List, Dict, Any
from async_timeout import run_with_timeout, CONNECT_TIMEOUT, API_TIMEOUT, TIMEOUT_SENTINEL

API_ID = '25170767'
API_HASH = 'd512fd74809a4ca3cd59078eef73afcd'


async def scan_chatlists_for_session(session_path: str) -> Dict[str, Any]:
    """
    Scan existing chat lists (folders) for a single Telegram session.
    
    Args:
        session_path: Path to the .session file (without .session extension)
    
    Returns:
        Dict with session info, folders list, and premium status
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
                "session": session_path,
                "error": "Connection timed out",
                "folders": [],
                "is_premium": False
            }
        
        # Check if authorized
        is_auth = await run_with_timeout(client.is_user_authorized(), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if is_auth is TIMEOUT_SENTINEL:
            await client.disconnect()
            return {
                "success": False,
                "session": session_path,
                "error": "Operation timed out",
                "folders": [],
                "is_premium": False
            }
        if not is_auth:
            await client.disconnect()
            return {
                "success": False,
                "session": session_path,
                "error": "Session is not authorized",
                "folders": [],
                "is_premium": False
            }
        
        # Get user info to check premium status
        me = await run_with_timeout(client.get_me(), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if me is TIMEOUT_SENTINEL:
            await client.disconnect()
            return {
                "success": False,
                "session": session_path,
                "error": "Operation timed out",
                "folders": [],
                "is_premium": False
            }
        is_premium = getattr(me, 'premium', False)
        
        # Get dialog filters (chat lists/folders)
        try:
            # GetDialogFiltersRequest returns a DialogFilters object
            dialog_filters_result = await run_with_timeout(client(GetDialogFiltersRequest()), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
            if dialog_filters_result is TIMEOUT_SENTINEL:
                await client.disconnect()
                return {
                    "success": False,
                    "session": session_path,
                    "error": "Operation timed out",
                    "folders": [],
                    "is_premium": is_premium
                }
            
            folders = []
            
            # Check what type of object we got and handle accordingly
            if hasattr(dialog_filters_result, 'filters'):
                filters_list = dialog_filters_result.filters
            elif isinstance(dialog_filters_result, list):
                filters_list = dialog_filters_result
            else:
                # Try to convert to list or iterate directly
                try:
                    filters_list = list(dialog_filters_result)
                except:
                    filters_list = []
            
            # Process each filter
            for filter_obj in filters_list:
                folder_info = None
                
                # Handle DialogFilterChatlist (shared chat lists from invite links)
                if isinstance(filter_obj, DialogFilterChatlist):
                    folder_info = {
                        "id": filter_obj.id,
                        "name": filter_obj.title or f"Chat List {filter_obj.id}",
                        "type": "chatlist",
                        "is_chatlist": True,
                        "has_my_invites": getattr(filter_obj, 'has_my_invites', False),
                        "pinned_peers_count": len(filter_obj.pinned_peers) if filter_obj.pinned_peers else 0,
                        "include_peers_count": len(filter_obj.include_peers) if filter_obj.include_peers else 0
                    }
                
                # Handle regular DialogFilter (user-created folders)
                elif isinstance(filter_obj, DialogFilter):
                    folder_info = {
                        "id": filter_obj.id,
                        "name": filter_obj.title or f"Folder {filter_obj.id}",
                        "type": "folder",
                        "is_chatlist": False,
                        "pinned_peers_count": len(filter_obj.pinned_peers) if filter_obj.pinned_peers else 0,
                        "include_peers_count": len(filter_obj.include_peers) if filter_obj.include_peers else 0
                    }
                
                # Skip default folder but log it
                elif isinstance(filter_obj, DialogFilterDefault):
                    continue
                
                # Handle unknown types
                else:
                    folder_info = {
                        "id": getattr(filter_obj, 'id', 'unknown'),
                        "name": getattr(filter_obj, 'title', f"Unknown {type(filter_obj).__name__}"),
                        "type": type(filter_obj).__name__,
                        "is_chatlist": False,
                        "pinned_peers_count": 0,
                        "include_peers_count": 0
                    }
                
                if folder_info:
                    folders.append(folder_info)
            
            await client.disconnect()
            
            return {
                "success": True,
                "session": session_path,
                "folders": folders,
                "is_premium": is_premium,
                "total_folders": len(folders),
                "total_chatlists": sum(1 for f in folders if f.get("is_chatlist", False))
            }
            
        except errors.RPCError as e:
            # Handle RPC errors that might indicate folder issues
            error_code = getattr(e, 'code', None)
            error_message = str(e).upper()
            await client.disconnect()
            
            # Check for folder-related errors
            if any(keyword in error_message for keyword in ['FOLDER', 'LIMIT', 'DEACTIVATED']):
                return {
                    "success": False,
                    "session": session_path,
                    "error": "FOLDER_ERROR",
                    "error_details": str(e),
                    "folders": [],
                    "is_premium": is_premium,
                    "is_full": 'LIMIT' in error_message
                }
            else:
                return {
                    "success": False,
                    "session": session_path,
                    "error": f"RPC_ERROR_{error_code}" if error_code else "RPC_ERROR",
                    "error_details": str(e),
                    "folders": [],
                    "is_premium": is_premium
                }
        except Exception as e:
            await client.disconnect()
            return {
                "success": False,
                "session": session_path,
                "error": f"Scan error: {str(e)}",
                "folders": [],
                "is_premium": is_premium
            }
            
    except errors.AuthKeyUnregisteredError:
        try:
            await client.disconnect()
        except:
            pass
        return {
            "success": False,
            "session": session_path,
            "error": "Session is not authorized",
            "folders": [],
            "is_premium": False
        }
    except AttributeError as e:
        # Handle missing error attributes
        try:
            await client.disconnect()
        except:
            pass
        return {
            "success": False,
            "session": session_path,
            "error": f"Attribute error: {str(e)}",
            "folders": [],
            "is_premium": False
        }
    except Exception as e:
        try:
            await client.disconnect()
        except:
            pass
        return {
            "success": False,
            "session": session_path,
            "error": f"Connection error: {str(e)}",
            "folders": [],
            "is_premium": False
        }


async def scan_chatlists_parallel(sessions: List[Dict[str, Any]], websocket=None) -> Dict[int, Dict[str, Any]]:
    """
    Scan chat lists for multiple sessions in parallel.
    
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
                "error": "No session path provided",
                "folders": [],
                "is_premium": False
            }
        
        if websocket:
            try:
                await websocket.send_json({
                    "type": "scan_progress",
                    "index": index,
                    "message": f"Scanning folders for session {index + 1}..."
                })
            except:
                pass  # Ignore websocket errors
        
        result = await scan_chatlists_for_session(session_path)
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
    
    tasks = [scan_with_index(session_info, idx) for idx, session_info in enumerate(sessions)]
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
                "error": f"Exception: {str(item)}",
                "folders": [],
                "is_premium": False,
                "index": idx
            }
        else:
            idx, result = item
            results[idx] = result
    
    return results