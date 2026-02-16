from telethon import TelegramClient, errors
from telethon.tl.types import Channel, Chat, InputPeerChannel, InputPeerChat, InputUser
from telethon.tl.functions.channels import LeaveChannelRequest
from telethon.tl.functions.messages import DeleteChatUserRequest
import asyncio
import random
from typing import List, Dict, Any, Optional
from async_timeout import run_with_timeout, CONNECT_TIMEOUT, API_TIMEOUT, TIMEOUT_SENTINEL

API_ID = '25170767'
API_HASH = 'd512fd74809a4ca3cd59078eef73afcd'

# Rate limiting configuration
MIN_DELAY_SECONDS = 1.0
MAX_DELAY_SECONDS = 2.0


async def leave_groups_for_session(
    session_path: str,
    groups: List[Dict[str, Any]],
    websocket=None,
    index: int = 0
) -> Dict[str, Any]:
    """
    Leave all groups for a single session with rate limiting.
    
    Args:
        session_path: Path to the .session file
        groups: List of group dicts with id, title, access_hash
        websocket: Optional WebSocket for progress updates
        index: Session index for progress updates
    
    Returns:
        Dict with status, left count, failed count, and errors
    """
    # Remove .session extension if present
    if session_path.endswith('.session'):
        session_path = session_path[:-8]
    
    client = TelegramClient(session_path, API_ID, API_HASH)
    
    result = {
        "session": session_path,
        "status": "completed",
        "left": 0,
        "failed": 0,
        "error": "NONE",
        "errors": []
    }
    
    try:
        r = await run_with_timeout(client.connect(), CONNECT_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if r is TIMEOUT_SENTINEL:
            result["status"] = "failed"
            result["error"] = "CONNECTION_TIMEOUT"
            result["errors"].append("Connection timed out")
            return result
        
        is_auth = await run_with_timeout(client.is_user_authorized(), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if is_auth is TIMEOUT_SENTINEL or not is_auth:
            await client.disconnect()
            result["status"] = "failed"
            result["error"] = "UNAUTHORIZED" if is_auth is not TIMEOUT_SENTINEL else "OPERATION_TIMEOUT"
            result["errors"].append("Session is not authorized" if is_auth is not TIMEOUT_SENTINEL else "Operation timed out")
            return result
        
        total_groups = len(groups)
        
        for group_idx, group in enumerate(groups):
            group_id = group.get("id")
            group_title = group.get("title", f"Group {group_id}")
            access_hash = group.get("access_hash")
            
            # Send progress update
            if websocket:
                try:
                    await websocket.send_json({
                        "type": "leave_progress",
                        "index": index,
                        "current": group_idx + 1,
                        "total": total_groups,
                        "group_title": group_title,
                        "message": f"Leaving {group_title}... ({group_idx + 1}/{total_groups})"
                    })
                except:
                    pass  # Ignore websocket errors
            
            try:
                # Determine if it's a Channel (supergroup) or Chat (legacy group)
                if access_hash is not None:
                    # Supergroup (Channel)
                    peer = InputPeerChannel(channel_id=group_id, access_hash=access_hash)
                    leave_r = await run_with_timeout(client(LeaveChannelRequest(channel=peer)), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
                    if leave_r is TIMEOUT_SENTINEL:
                        result["errors"].append(f"Operation timed out for {group_title}")
                        result["failed"] += 1
                        continue
                else:
                    # Legacy group (Chat) - need to use DeleteChatUserRequest
                    me = await run_with_timeout(client.get_me(), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
                    if me is TIMEOUT_SENTINEL:
                        result["errors"].append(f"Operation timed out for {group_title}")
                        result["failed"] += 1
                        continue
                    input_user = await client.get_input_entity(me)
                    # Convert to InputUser if needed
                    if hasattr(input_user, 'user_id'):
                        input_user_obj = InputUser(user_id=input_user.user_id, access_hash=input_user.access_hash)
                    else:
                        input_user_obj = input_user
                    del_r = await run_with_timeout(client(DeleteChatUserRequest(
                        chat_id=group_id,
                        user_id=input_user_obj
                    )), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
                    if del_r is TIMEOUT_SENTINEL:
                        result["errors"].append(f"Operation timed out for {group_title}")
                        result["failed"] += 1
                        continue
                
                result["left"] += 1
                
            except errors.FloodWaitError as e:
                # Handle flood wait - wait and retry
                wait_time = e.seconds
                result["errors"].append(f"FloodWait {wait_time}s for {group_title}")
                
                if websocket:
                    try:
                        await websocket.send_json({
                            "type": "flood_wait",
                            "index": index,
                            "wait_time": wait_time,
                            "message": f"Rate limited. Waiting {wait_time} seconds..."
                        })
                    except:
                        pass
                
                # Wait for the flood period
                await asyncio.sleep(wait_time)
                
                # Retry once after flood wait
                try:
                    if access_hash is not None:
                        peer = InputPeerChannel(channel_id=group_id, access_hash=access_hash)
                        await client(LeaveChannelRequest(channel=peer))
                    else:
                        # Legacy group - retry DeleteChatUserRequest
                        me = await client.get_me()
                        input_user = await client.get_input_entity(me)
                        if hasattr(input_user, 'user_id'):
                            input_user_obj = InputUser(user_id=input_user.user_id, access_hash=input_user.access_hash)
                        else:
                            input_user_obj = input_user
                        await client(DeleteChatUserRequest(
                            chat_id=group_id,
                            user_id=input_user_obj
                        ))
                    result["left"] += 1
                except Exception as retry_err:
                    result["failed"] += 1
                    result["errors"].append(f"Failed to leave {group_title} after retry: {str(retry_err)}")
                    
            except errors.ChatWriteForbidden:
                result["failed"] += 1
                result["errors"].append(f"Cannot leave {group_title}: Write forbidden")
                
            except errors.UserBannedInChannel:
                result["failed"] += 1
                result["errors"].append(f"Cannot leave {group_title}: User banned")
                
            except Exception as e:
                error_str = str(e).upper()
                if "ALREADY" in error_str or "NOT_MEMBER" in error_str:
                    # Already left or not a member - count as success
                    result["left"] += 1
                elif "FLOOD" in error_str:
                    result["failed"] += 1
                    result["errors"].append(f"Flood error for {group_title}: {str(e)}")
                elif "BANNED" in error_str or "FROZEN" in error_str:
                    result["status"] = "failed"
                    result["error"] = "BANNED"
                    result["failed"] += 1
                    result["errors"].append(f"Account banned/frozen: {str(e)}")
                    # Stop processing if account is banned
                    break
                else:
                    result["failed"] += 1
                    result["errors"].append(f"Error leaving {group_title}: {str(e)}")
            
            # Rate limiting: Wait between leaves (1-2 seconds)
            if group_idx < total_groups - 1:  # Don't wait after the last group
                delay = random.uniform(MIN_DELAY_SECONDS, MAX_DELAY_SECONDS)
                await asyncio.sleep(delay)
        
        # Determine final status
        if result["failed"] > 0 and result["left"] > 0:
            result["status"] = "partial"
        elif result["failed"] > 0:
            result["status"] = "failed"
            if result["error"] == "NONE":
                result["error"] = "SOME_FAILED"
        
        await client.disconnect()
        return result
        
    except errors.AuthKeyUnregisteredError:
        try:
            await client.disconnect()
        except:
            pass
        result["status"] = "failed"
        result["error"] = "UNAUTHORIZED"
        result["errors"].append("Session is not authorized")
        return result
    except Exception as e:
        try:
            await client.disconnect()
        except:
            pass
        result["status"] = "failed"
        result["error"] = "CONNECTION_ERROR"
        result["errors"].append(f"Connection error: {str(e)}")
        return result


async def leave_groups_parallel(
    sessions: List[Dict[str, Any]],
    groups_by_session: Dict[int, List[Dict[str, Any]]],
    websocket=None
) -> Dict[int, Dict[str, Any]]:
    """
    Leave groups for multiple sessions in parallel.
    Each session processes its groups sequentially with rate limiting.
    
    Args:
        sessions: List of session dicts with 'path' key
        groups_by_session: Dict mapping session index to list of groups
        websocket: Optional WebSocket for real-time updates
    
    Returns:
        Dict mapping session index to leave result
    """
    async def leave_with_index(session_info: Dict[str, Any], index: int):
        session_path = session_info.get("path")
        groups = groups_by_session.get(index, [])
        
        if not session_path:
            return index, {
                "session": "unknown",
                "status": "failed",
                "left": 0,
                "failed": len(groups),
                "error": "No session path provided",
                "errors": []
            }
        
        if websocket:
            try:
                await websocket.send_json({
                    "type": "session_start",
                    "index": index,
                    "total_groups": len(groups),
                    "message": f"Starting to leave groups for session {index + 1}..."
                })
            except:
                pass
        
        result = await leave_groups_for_session(
            session_path,
            groups,
            websocket,
            index
        )
        
        if websocket:
            try:
                await websocket.send_json({
                    "type": "session_complete",
                    "index": index,
                    "result": result
                })
            except:
                pass
        
        return index, result
    
    tasks = [leave_with_index(session_info, idx) for idx, session_info in enumerate(sessions)]
    results_list = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Handle exceptions
    results = {}
    for item in results_list:
        if isinstance(item, Exception):
            idx = results_list.index(item)
            results[idx] = {
                "session": sessions[idx].get("path", "unknown"),
                "status": "failed",
                "left": 0,
                "failed": len(groups_by_session.get(idx, [])),
                "error": "EXCEPTION",
                "errors": [f"Exception: {str(item)}"]
            }
        else:
            idx, result = item
            results[idx] = result
    
    return results

