from telethon import TelegramClient, errors
from telethon.tl.functions.messages import (
    GetDialogFiltersRequest,
    UpdateDialogFilterRequest,
    UpdateDialogFiltersOrderRequest
)
from telethon.tl.functions.chatlists import CheckChatlistInviteRequest, JoinChatlistInviteRequest, LeaveChatlistRequest
from telethon.tl.types import DialogFilter, DialogFilterDefault, DialogFilterChatlist, InputChatlistDialogFilter
import asyncio
import re
from typing import List, Dict, Any, Optional

API_ID = '25170767'
API_HASH = 'd512fd74809a4ca3cd59078eef73afcd'

# Telegram limits
MAX_GROUPS_PER_FOLDER = 100
MAX_FOLDERS_NON_PREMIUM = 10  # Approximate limit


def parse_chatlist_link(link: str) -> Optional[str]:
    """
    Parse chat list invite link (t.me/addlist/...)
    Returns the invite hash or None if invalid
    """
    if not link or not isinstance(link, str):
        return None
    
    link = link.strip()
    
    # Match t.me/addlist/XXXXX pattern
    pattern = r'(?:https?://)?(?:www\.)?t\.me/addlist/([a-zA-Z0-9_-]+)'
    match = re.search(pattern, link)
    
    if match:
        return match.group(1)
    
    return None


async def leave_multiple_folders(session_path: str, folder_ids: List[int]) -> Dict[str, Any]:
    """
    Leave multiple folders in one connection to avoid folder list changes.
    
    Args:
        session_path: Path to the .session file
        folder_ids: List of folder IDs to leave
    
    Returns:
        Dict with left_count and errors list
    """
    if session_path.endswith('.session'):
        session_path = session_path[:-8]
    
    client = TelegramClient(session_path, API_ID, API_HASH)
    result = {"left_count": 0, "errors": []}
    
    try:
        await client.connect()
        
        if not await client.is_user_authorized():
            await client.disconnect()
            return {"left_count": 0, "errors": ["Session is not authorized"]}
        
        # Get current filters ONCE
        dialog_filters_result = await client(GetDialogFiltersRequest())
        
        # Handle both cases: direct list or object with .filters attribute
        if isinstance(dialog_filters_result, list):
            filters_list = dialog_filters_result
        elif hasattr(dialog_filters_result, 'filters'):
            filters_list = dialog_filters_result.filters
        else:
            filters_list = []
        
        # Create a map of folder_id -> folder_obj for quick lookup
        # Include both DialogFilter (custom folders) and DialogFilterChatlist (joined chat lists)
        # EXCLUDE DialogFilterDefault (it doesn't have an id attribute)
        folder_map = {}
        for f in filters_list:
            if isinstance(f, DialogFilterDefault):
                continue  # Skip default filter
            if hasattr(f, 'id') and f.id in folder_ids and (isinstance(f, DialogFilter) or isinstance(f, DialogFilterChatlist)):
                folder_map[f.id] = f
        
        # Leave each folder
        for folder_id in folder_ids:
            if folder_id not in folder_map:
                result["errors"].append(f"Folder {folder_id} not found")
                continue
            
            folder_obj = folder_map[folder_id]
            leave_success = False
            
            try:
                # Try LeaveChatlistRequest for chat lists
                input_chatlist = InputChatlistDialogFilter(filter_id=folder_id)
                await client(LeaveChatlistRequest(chatlist=input_chatlist, peers=[]))
                leave_success = True
            except Exception as e:
                # Fall back to UpdateDialogFilterRequest
                try:
                    await client(UpdateDialogFilterRequest(id=folder_id, filter=None))
                    leave_success = True
                except Exception as e2:
                    result["errors"].append(f"Failed to leave folder {folder_id}: {str(e2)}")
            
            if leave_success:
                result["left_count"] += 1
                # Remove from map to track what's left
                del folder_map[folder_id]
        
        # Update filters order to remove deleted folder IDs
        if result["left_count"] > 0:
            remaining_filters = [f for f in filters_list if not isinstance(f, DialogFilterDefault) and hasattr(f, 'id') and f.id not in folder_ids]
            # Include both DialogFilter and DialogFilterChatlist in the order
            filter_order = [f.id for f in remaining_filters if isinstance(f, (DialogFilter, DialogFilterChatlist))]
            
            if filter_order:
                try:
                    await client(UpdateDialogFiltersOrderRequest(order=filter_order))
                except:
                    pass
        
        await client.disconnect()
        return result
        
    except Exception as e:
        try:
            await client.disconnect()
        except:
            pass
        return {"left_count": 0, "errors": [f"Connection error: {str(e)}"]}


async def leave_chatlist_folder(session_path: str, folder_id: int) -> Dict[str, Any]:
    """
    Leave a specific chat list folder by removing it.
    
    Args:
        session_path: Path to the .session file
        folder_id: ID of the folder to leave
    
    Returns:
        Dict with success status and error if any
    """
    if session_path.endswith('.session'):
        session_path = session_path[:-8]
    
    client = TelegramClient(session_path, API_ID, API_HASH)
    
    try:
        await client.connect()
        
        if not await client.is_user_authorized():
            await client.disconnect()
            return {"success": False, "error": "Session is not authorized"}
        
        # Get current filters to verify folder exists
        dialog_filters_result = await client(GetDialogFiltersRequest())
        
        # Handle both cases: direct list or object with .filters attribute
        if isinstance(dialog_filters_result, list):
            filters_list = dialog_filters_result
        elif hasattr(dialog_filters_result, 'filters'):
            filters_list = dialog_filters_result.filters
        else:
            filters_list = []
        
        # Check for both DialogFilter and DialogFilterChatlist
        # EXCLUDE DialogFilterDefault (it doesn't have an id attribute)
        folder_found = any(
            not isinstance(f, DialogFilterDefault) and hasattr(f, 'id') and 
            (isinstance(f, DialogFilter) or isinstance(f, DialogFilterChatlist)) and f.id == folder_id
            for f in filters_list
        )
        
        if not folder_found:
            await client.disconnect()
            return {"success": False, "error": f"Folder {folder_id} not found"}
        
        # Find the folder object
        folder_obj = None
        for f in filters_list:
            if isinstance(f, DialogFilterDefault):
                continue
            if hasattr(f, 'id') and f.id == folder_id and (isinstance(f, DialogFilter) or isinstance(f, DialogFilterChatlist)):
                folder_obj = f
                break
        
        # Try to leave using LeaveChatlistRequest first (for joined chat lists)
        # If that fails, fall back to UpdateDialogFilterRequest (for custom folders)
        
        # Try LeaveChatlistRequest for chat lists (requires InputChatlistDialogFilter)
        leave_success = False
        try:
            # Create InputChatlistDialogFilter from the folder ID
            input_chatlist = InputChatlistDialogFilter(filter_id=folder_id)
            await client(LeaveChatlistRequest(chatlist=input_chatlist, peers=[]))
            leave_success = True
        except Exception as e:
            pass
        
        # If LeaveChatlistRequest failed, use UpdateDialogFilterRequest
        if not leave_success:
            # Remove the folder by updating with None
            await client(UpdateDialogFilterRequest(
                id=folder_id,
                filter=None
            ))
            
            # Update filters order to remove the deleted folder ID
            remaining_filters = [
                f for f in filters_list
                if not isinstance(f, DialogFilterDefault) and hasattr(f, 'id') and 
                (isinstance(f, DialogFilter) or isinstance(f, DialogFilterChatlist)) and f.id != folder_id
            ]
            filter_order = [f.id for f in remaining_filters]
            
            if filter_order:
                await client(UpdateDialogFiltersOrderRequest(order=filter_order))
        
        await client.disconnect()
        return {"success": True}
        
    except Exception as e:
        try:
            await client.disconnect()
        except:
            pass
        
        error_msg = str(e)
        if "FLOOD" in error_msg.upper() or "FLOOD_WAIT" in error_msg.upper():
            return {"success": False, "error": "FLOOD_WAIT"}
        elif "FOLDER" in error_msg.upper():
            return {"success": False, "error": "FOLDER_ERROR"}
        else:
            return {"success": False, "error": f"Leave error: {error_msg}"}


async def join_chatlist_link(session_path: str, invite_hash: str, is_premium: bool = False) -> Dict[str, Any]:
    """
    Join a chat list using an invite link hash.
    
    Args:
        session_path: Path to the .session file
        invite_hash: The hash from t.me/addlist/XXXXX
        is_premium: Whether the account is premium
    
    Returns:
        Dict with success status, folder info, and error if any
    """
    if session_path.endswith('.session'):
        session_path = session_path[:-8]
    
    client = TelegramClient(session_path, API_ID, API_HASH)
    
    try:
        await client.connect()
        
        if not await client.is_user_authorized():
            await client.disconnect()
            return {
                "success": False,
                "error": "Session is not authorized",
                "status": "failed"
            }
        
        # Check current folder count and group limits
        try:
            dialog_filters_result = await client(GetDialogFiltersRequest())
            
            # Handle both cases: direct list or object with .filters attribute
            if isinstance(dialog_filters_result, list):
                filters_list = dialog_filters_result
            elif hasattr(dialog_filters_result, 'filters'):
                filters_list = dialog_filters_result.filters
            else:
                filters_list = []
            
            # EXCLUDE DialogFilterDefault when counting folders
            current_folders = [
                f for f in filters_list 
                if not isinstance(f, DialogFilterDefault) and isinstance(f, (DialogFilter, DialogFilterChatlist))
            ]
            
            # Check if we're at folder limit (non-premium)
            if not is_premium and len(current_folders) >= MAX_FOLDERS_NON_PREMIUM:
                await client.disconnect()
                return {
                    "success": False,
                    "error": "NON_PREMIUM_LIMIT",
                    "status": "skipped",
                    "message": "Non-premium account has reached folder limit"
                }
            
            # Join the chat list using the invite link
            # First check the invite, then join it
            try:
                # Check the invite to get folder info
                check_result = await client(CheckChatlistInviteRequest(slug=invite_hash))
                
                # Debug: Let's see what we actually get
                # print(f"Check result type: {type(check_result)}")
                # print(f"Check result attributes: {dir(check_result)}")
                
                # Build list of input peers from the check result
                peers_to_join = []
                
                # Get entities from check result
                entities = {}
                if hasattr(check_result, 'chats'):
                    for chat in check_result.chats:
                        entities[chat.id] = chat
                if hasattr(check_result, 'users'):
                    for user in check_result.users:
                        entities[user.id] = user
                
                # CheckChatlistInviteRequest returns a chatlists.ChatlistInvite object
                # It has: title, emoticon, peers (list of Peer), chats, users
                # We need to get peers from check_result.peers, not missing_peers
                peer_ids = []
                if hasattr(check_result, 'peers'):
                    peer_ids = check_result.peers
                
                # Fallback: try missing_peers if peers doesn't exist
                if not peer_ids and hasattr(check_result, 'missing_peers'):
                    peer_ids = check_result.missing_peers
                
                # If still no peers, this chat list might be empty or already joined
                if not peer_ids:
                    # Check if already_peers exists and has content
                    if hasattr(check_result, 'already_peers') and check_result.already_peers:
                        await client.disconnect()
                        return {
                            "success": False,
                            "error": "ALREADY_JOINED",
                            "status": "skipped",
                            "message": "Chat list already joined"
                        }
                    else:
                        await client.disconnect()
                        return {
                            "success": False,
                            "error": "EMPTY_CHATLIST",
                            "status": "failed",
                            "message": "Chat list invite has no chats"
                        }
                
                # Convert Peer objects to InputPeer objects using the entities
                from telethon.tl.types import (
                    PeerChannel, PeerChat, PeerUser,
                    InputPeerChannel, InputPeerChat, InputPeerUser
                )
                
                for peer in peer_ids:
                    try:
                        if isinstance(peer, PeerChannel):
                            entity = entities.get(peer.channel_id)
                            if entity and hasattr(entity, 'access_hash'):
                                peers_to_join.append(InputPeerChannel(
                                    channel_id=peer.channel_id,
                                    access_hash=entity.access_hash
                                ))
                        elif isinstance(peer, PeerChat):
                            peers_to_join.append(InputPeerChat(chat_id=peer.chat_id))
                        elif isinstance(peer, PeerUser):
                            entity = entities.get(peer.user_id)
                            if entity and hasattr(entity, 'access_hash'):
                                peers_to_join.append(InputPeerUser(
                                    user_id=peer.user_id,
                                    access_hash=entity.access_hash
                                ))
                    except Exception:
                        continue
                
                # Check if we have any peers to join
                if not peers_to_join:
                    await client.disconnect()
                    return {
                        "success": False,
                        "error": "NO_VALID_PEERS",
                        "status": "failed",
                        "message": f"Could not convert {len(peer_ids)} peers to valid input peers"
                    }
                
                # Join the chat list with the peers
                result = await client(JoinChatlistInviteRequest(
                    slug=invite_hash,
                    peers=peers_to_join
                ))
                
                # Get updated filters to find the new folder
                updated_dialog_filters_result = await client(GetDialogFiltersRequest())
                
                # Handle both cases: direct list or object with .filters attribute
                if isinstance(updated_dialog_filters_result, list):
                    updated_filters_list = updated_dialog_filters_result
                elif hasattr(updated_dialog_filters_result, 'filters'):
                    updated_filters_list = updated_dialog_filters_result.filters
                else:
                    updated_filters_list = []
                
                # EXCLUDE DialogFilterDefault when comparing folders
                new_folders = [
                    f for f in updated_filters_list 
                    if not isinstance(f, DialogFilterDefault) and isinstance(f, (DialogFilter, DialogFilterChatlist))
                ]
                
                # Find the newly added folder by comparing with previous folders
                # Get IDs of previous folders
                previous_folder_ids = {f.id for f in current_folders if hasattr(f, 'id')}
                new_folder = None
                
                for folder in new_folders:
                    if hasattr(folder, 'id') and folder.id not in previous_folder_ids:
                        new_folder = folder
                        break
                
                await client.disconnect()
                
                if new_folder:
                    # Check group count in new folder
                    group_count = len(new_folder.include_peers) if hasattr(new_folder, 'include_peers') and new_folder.include_peers else 0
                    
                    if not is_premium and group_count > MAX_GROUPS_PER_FOLDER:
                        return {
                            "success": False,
                            "error": "NON_PREMIUM_LIMIT",
                            "status": "skipped",
                            "message": f"Folder exceeds {MAX_GROUPS_PER_FOLDER} groups limit for non-premium"
                        }
                    
                    return {
                        "success": True,
                        "status": "success",
                        "folder_id": new_folder.id,
                        "folder_name": new_folder.title or f"Folder {new_folder.id}",
                        "group_count": group_count
                    }
                else:
                    # Folder was added but we couldn't identify it (shouldn't happen, but handle gracefully)
                    return {
                        "success": True,
                        "status": "success",
                        "message": "Chat list joined successfully"
                    }
                    
            except errors.InviteHashExpiredError:
                await client.disconnect()
                return {
                    "success": False,
                    "error": "INVALID_LINK",
                    "status": "failed",
                    "message": "Chat list invite link has expired"
                }
            except errors.InviteHashInvalidError:
                await client.disconnect()
                return {
                    "success": False,
                    "error": "INVALID_LINK",
                    "status": "failed",
                    "message": "Invalid chat list invite link"
                }
            except errors.FloodWaitError as e:
                await client.disconnect()
                return {
                    "success": False,
                    "error": "FLOOD",
                    "status": "failed",
                    "message": f"Rate limited. Please wait {e.seconds} seconds"
                }
            except errors.RPCError as rpc_err:
                # Check if it's a folder limit error
                error_message = str(rpc_err).upper()
                if 'FOLDER' in error_message and 'LIMIT' in error_message:
                    await client.disconnect()
                    return {
                        "success": False,
                        "error": "FOLDER_LIMIT_EXCEEDED",
                        "status": "skipped",
                        "message": "Account has reached maximum folder limit"
                    }
                # Re-raise if not a folder limit error, let it be caught by generic handler
                raise
            except errors.PeerFloodError:
                await client.disconnect()
                return {
                    "success": False,
                    "error": "PEER_FLOOD",
                    "status": "failed",
                    "message": "Too many requests. Account may be restricted"
                }
            except Exception as e:
                await client.disconnect()
                error_str = str(e)
                if "FROZEN" in error_str.upper() or "DEACTIVATED" in error_str.upper():
                    return {
                        "success": False,
                        "error": "FROZEN",
                        "status": "failed",
                        "message": "Account is frozen or deactivated"
                    }
                return {
                    "success": False,
                    "error": "UNKNOWN",
                    "status": "failed",
                    "message": f"Join error: {error_str}"
                }
                
        except Exception as e:
            await client.disconnect()
            return {
                "success": False,
                "error": "UNKNOWN",
                "status": "failed",
                "message": f"Error checking folders: {str(e)}"
            }
            
    except errors.AuthKeyUnregisteredError:
        try:
            await client.disconnect()
        except:
            pass
        return {
            "success": False,
            "error": "UNAUTHORIZED",
            "status": "failed",
            "message": "Session is not authorized"
        }
    except Exception as e:
        try:
            await client.disconnect()
        except:
            pass
        return {
            "success": False,
            "error": "UNKNOWN",
            "status": "failed",
            "message": f"Connection error: {str(e)}"
        }


async def process_chatlist_operations(
    session_path: str,
    folders_to_leave: List[int],
    invite_links: List[str],
    is_premium: bool,
    websocket=None,
    index: int = 0
) -> Dict[str, Any]:
    """
    Complete workflow: Leave folders, then join new chat lists.
    
    Args:
        session_path: Path to the .session file
        folders_to_leave: List of folder IDs to leave
        invite_links: List of chat list invite links (1-5)
        is_premium: Whether account is premium
        websocket: Optional WebSocket for updates
        index: Session index for progress updates
    
    Returns:
        Dict with complete operation result
    """
    result = {
        "session": session_path,
        "status": "success",
        "stage": "complete",
        "folders_left": 0,
        "folders_joined": 0,
        "errors": []
    }
    
    # Step 1: Leave folders (all in one connection to avoid folder list changes)
    if folders_to_leave:
        if websocket:
            await websocket.send_json({
                "type": "leave_progress",
                "index": index,
                "message": f"Leaving {len(folders_to_leave)} folder(s)..."
            })
        
        # Leave all folders in one connection to avoid folder list changes
        leave_result = await leave_multiple_folders(session_path, folders_to_leave)
        left_count = leave_result.get("left_count", 0)
        result["folders_left"] = left_count
        result["errors"].extend(leave_result.get("errors", []))
        
        if websocket:
            await websocket.send_json({
                "type": "leave_result",
                "index": index,
                "folders_left": left_count,
                "total_to_leave": len(folders_to_leave)
            })
    
    # Step 2: Join new chat lists
    if invite_links:
        if websocket:
            await websocket.send_json({
                "type": "join_progress",
                "index": index,
                "message": f"Joining {len(invite_links)} chat list(s)..."
            })
        
        joined_count = 0
        for link in invite_links:
            invite_hash = parse_chatlist_link(link)
            if not invite_hash:
                result["errors"].append(f"Invalid link format: {link}")
                result["status"] = "failed"
                continue
            
            join_result = await join_chatlist_link(session_path, invite_hash, is_premium)
            
            if join_result.get("success"):
                joined_count += 1
            else:
                error_msg = join_result.get("message") or join_result.get("error", "Unknown error")
                result["errors"].append(f"Failed to join {link}: {error_msg}")
                
                # Update status based on error type
                error_type = join_result.get("error", "")
                if error_type in ["NON_PREMIUM_LIMIT", "FOLDER_LIMIT_EXCEEDED"]:
                    result["status"] = "skipped"
                elif result["status"] == "success":
                    result["status"] = "failed"
        
        result["folders_joined"] = joined_count
        
        if websocket:
            await websocket.send_json({
                "type": "join_result",
                "index": index,
                "folders_joined": joined_count,
                "total_to_join": len(invite_links)
            })
    
    # Determine final status
    if result["errors"] and result["status"] == "success":
        result["status"] = "partial"
    
    if websocket:
        await websocket.send_json({
            "type": "session_complete",
            "index": index,
            "result": result
        })
    
    return result


async def process_chatlists_parallel(
    sessions: List[Dict[str, Any]],
    leave_config: Dict[int, List[int]],  # session_index -> list of folder IDs to leave
    invite_links: List[str],
    websocket=None
) -> Dict[int, Dict[str, Any]]:
    """
    Process chat list operations for multiple sessions in parallel.
    
    Args:
        sessions: List of session dicts with 'path' and 'is_premium' keys
        leave_config: Dict mapping session index to list of folder IDs to leave
        invite_links: List of chat list invite links (1-5)
        websocket: Optional WebSocket for real-time updates
    
    Returns:
        Dict mapping session index to operation result
    """
    async def process_with_index(session_info: Dict[str, Any], index: int):
        session_path = session_info.get("path")
        is_premium = session_info.get("is_premium", False)
        # Handle both string and integer keys in leave_config
        folders_to_leave = leave_config.get(index, []) or leave_config.get(str(index), [])
        
        if not session_path:
            return index, {
                "session": "unknown",
                "status": "failed",
                "stage": "scan",
                "error": "No session path provided"
            }
        
        return index, await process_chatlist_operations(
            session_path,
            folders_to_leave,
            invite_links,
            is_premium,
            websocket,
            index
        )
    
    tasks = [process_with_index(session_info, idx) for idx, session_info in enumerate(sessions)]
    results_list = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Handle exceptions
    results = {}
    for item in results_list:
        if isinstance(item, Exception):
            idx = results_list.index(item)
            results[idx] = {
                "session": sessions[idx].get("path", "unknown"),
                "status": "failed",
                "stage": "unknown",
                "error": f"Exception: {str(item)}"
            }
        else:
            idx, result = item
            results[idx] = result
    
    return results