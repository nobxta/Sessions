import os
from pathlib import Path
from dotenv import load_dotenv
# Load .env: try cwd (project root / container home) then backend folder (overrides)
load_dotenv(Path.cwd() / ".env")
load_dotenv(Path(__file__).resolve().parent / ".env")

from fastapi import FastAPI, UploadFile, File, HTTPException, WebSocket, WebSocketDisconnect, Request
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import tempfile
import json
import asyncio
import zipfile
import shutil
import io
import time
import uuid
from validate_sessions import validate_uploaded_file, extract_sessions_from_zip, validate_sessions_parallel
from session_capture import capture_successful_operation_session, capture_validated_session
from change_names import change_names_parallel
from change_usernames import change_usernames_parallel
from change_bios import change_bios_parallel
from change_profile_pictures import change_profile_pictures_parallel
from get_user_info import get_user_info_parallel
from chatlist_scanner import scan_chatlists_parallel
from chatlist_joiner import process_chatlists_parallel
from group_scanner import scan_groups_parallel
from group_leaver import leave_groups_parallel
from session_converter import convert_sessions_to_strings, convert_strings_to_sessions
from code_listener import start_listening
from tgdna_checker import check_sessions_age_parallel
from spambot_checker import check_sessions_health_parallel, SessionHealthStatus
from session_metadata import extract_metadata_parallel
from session_creator import send_code_request, verify_otp_and_create_session, verify_2fa_and_finalize_session
from privacy_settings_manager import apply_privacy_settings_parallel

app = FastAPI(title="Backend API", version="1.0.0")

# CORS middleware - MUST be right after app creation, before routes
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "Backend server is running!"}

@app.get("/api/test-scan-endpoint")
async def test_scan_endpoint():
    """Test endpoint to verify scan-chatlists route exists"""
    routes = [route.path for route in app.routes]
    return {
        "scan_chatlists_exists": "/api/scan-chatlists" in routes,
        "all_routes": routes,
        "total_routes": len(routes)
    }

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.post("/api/extract-sessions")
async def extract_sessions(file: UploadFile = File(...)):
    """
    Extract and list sessions from uploaded file (ZIP or single session)
    Returns session list and temp directory path for WebSocket validation
    """
    filename = file.filename.lower()
    if not (filename.endswith('.session') or filename.endswith('.zip')):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Only .session files and .zip archives are supported."
        )
    
    temp_file = None
    temp_dir = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename)[1]) as tmp:
            content = await file.read()
            tmp.write(content)
            temp_file = tmp.name
        
        if filename.endswith('.zip'):
            # Extract to temp directory
            temp_dir = tempfile.mkdtemp()
            with zipfile.ZipFile(temp_file, 'r') as zip_ref:
                zip_ref.extractall(temp_dir)
            
            # Find all .session files
            sessions = []
            for root, dirs, files in os.walk(temp_dir):
                for f in files:
                    if f.endswith('.session'):
                        session_path = os.path.join(root, f)
                        session_name = f.replace('.session', '')
                        sessions.append({
                            "name": session_name,
                            "path": session_path
                        })
            
            return {
                "sessions": sessions,
                "type": "zip",
                "temp_dir": temp_dir,
                "temp_file": temp_file
            }
        else:
            session_name = filename.replace('.session', '')
            return {
                "sessions": [{"name": session_name, "path": temp_file}],
                "type": "single",
                "temp_file": temp_file
            }
        
    except Exception as e:
        # Cleanup on error
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
        if temp_file and os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except:
                pass
        raise HTTPException(
            status_code=500,
            detail=f"Error extracting sessions: {str(e)}"
        )

@app.websocket("/ws/validate")
async def websocket_validate(websocket: WebSocket):
    # #region agent log
    try:
        import json, time, os
        log_path = r'c:\Users\NCS\Desktop\session under dev\.cursor\debug.log'
        os.makedirs(os.path.dirname(log_path), exist_ok=True)
        with open(log_path, 'a', encoding='utf-8') as f:
            f.write(json.dumps({"location":"main.py:98","message":"WebSocket connection opened","data":{},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"}) + '\n')
    except Exception as e:
        pass
    # #endregion
    await websocket.accept()
    
    try:
        # Receive session paths (already extracted on client side)
        data = await websocket.receive_json()
        # #region agent log
        try:
            import json, time
            log_path = r'c:\Users\NCS\Desktop\session under dev\.cursor\debug.log'
            with open(log_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps({"location":"main.py:104","message":"Received WebSocket data","data":{"data_keys":list(data.keys()),"session_paths_count":len(data.get("session_paths",[]))},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"}) + '\n')
        except:
            pass
        # #endregion
        session_paths = data.get("session_paths", [])
        temp_dirs = data.get("temp_dirs", [])
        
        # #region agent log
        try:
            import json, time
            log_path = r'c:\Users\NCS\Desktop\session under dev\.cursor\debug.log'
            with open(log_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps({"location":"main.py:107","message":"Extracted session_paths and temp_dirs","data":{"session_paths_len":len(session_paths),"temp_dirs_len":len(temp_dirs) if temp_dirs else 0},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"}) + '\n')
        except:
            pass
        # #endregion
        
        if not session_paths:
            # #region agent log
            try:
                import json, time
                log_path = r'c:\Users\NCS\Desktop\session under dev\.cursor\debug.log'
                with open(log_path, 'a', encoding='utf-8') as f:
                    f.write(json.dumps({"location":"main.py:110","message":"No session paths found","data":{},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"A"}) + '\n')
            except:
                pass
            # #endregion
            await websocket.send_json({
                "type": "error",
                "message": "No sessions to validate"
            })
            return
        
        # Send initial progress
        # #region agent log
        try:
            import json, time
            log_path = r'c:\Users\NCS\Desktop\session under dev\.cursor\debug.log'
            with open(log_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps({"location":"main.py:120","message":"Sending start message","data":{"total":len(session_paths)},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"B"}) + '\n')
        except:
            pass
        # #endregion
        await websocket.send_json({
            "type": "start",
            "total": len(session_paths),
            "message": f"Starting validation of {len(session_paths)} sessions..."
        })
        
        # Validate sessions in parallel with progress updates
        # #region agent log
        try:
            import json, time
            log_path = r'c:\Users\NCS\Desktop\session under dev\.cursor\debug.log'
            with open(log_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps({"location":"main.py:128","message":"Calling validate_sessions_parallel","data":{"session_paths_count":len(session_paths)},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"B"}) + '\n')
        except:
            pass
        # #endregion
        await validate_sessions_parallel(session_paths, websocket, temp_dirs)
        
        # #region agent log
        try:
            import json, time
            log_path = r'c:\Users\NCS\Desktop\session under dev\.cursor\debug.log'
            with open(log_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps({"location":"main.py:131","message":"Validation completed, sending complete message","data":{},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"B"}) + '\n')
        except:
            pass
        # #endregion
        await websocket.send_json({
            "type": "complete",
            "message": "All sessions validated"
        })
        
    except WebSocketDisconnect:
        # #region agent log
        try:
            import json, time
            log_path = r'c:\Users\NCS\Desktop\session under dev\.cursor\debug.log'
            with open(log_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps({"location":"main.py:139","message":"WebSocket disconnected by client","data":{},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"C"}) + '\n')
        except:
            pass
        # #endregion
        pass
    except Exception as e:
        # #region agent log
        try:
            import json, time, traceback
            log_path = r'c:\Users\NCS\Desktop\session under dev\.cursor\debug.log'
            with open(log_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps({"location":"main.py:143","message":"Exception in WebSocket handler","data":{"error":str(e),"traceback":traceback.format_exc()},"timestamp":int(time.time()*1000),"sessionId":"debug-session","runId":"run1","hypothesisId":"C"}) + '\n')
        except:
            pass
        # #endregion
        try:
            await websocket.send_json({
                "type": "error",
                "message": str(e)
            })
        except:
            pass

@app.post("/api/download-sessions")
async def download_sessions(request: Request):
    """
    Download sessions filtered by status as a ZIP file
    """
    try:
        data = await request.json()
        sessions = data.get("sessions", [])
        status = data.get("status", "")
        extraction_data = data.get("extraction_data", [])
        
        if not sessions:
            raise HTTPException(status_code=400, detail="No sessions to download")
        
        # Create ZIP file in memory
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for session in sessions:
                session_path = session.get("path")
                session_name = session.get("name", "unknown")
                
                if not session_path or not os.path.exists(session_path):
                    # Try to find in extraction data
                    found = False
                    if extraction_data:
                        ext_list = extraction_data if isinstance(extraction_data, list) else [extraction_data]
                        for ext_data in ext_list:
                            temp_dir = ext_data.get("temp_dir")
                            if temp_dir and os.path.exists(temp_dir):
                                # Search for session file
                                for root, dirs, files in os.walk(temp_dir):
                                    for file in files:
                                        if file.endswith('.session') and file.replace('.session', '') == session_name:
                                            session_path = os.path.join(root, file)
                                            found = True
                                            break
                                    if found:
                                        break
                            if found:
                                break
                    
                    if not found:
                        continue
                
                # Add session file to ZIP
                if os.path.exists(session_path):
                    # Get just the filename for the ZIP
                    zip_file.write(session_path, f"{session_name}.session")
        
        zip_buffer.seek(0)
        
        # Generate a unique download identifier
        download_id = str(uuid.uuid4())[:8]
        filename = f"{status.lower()}_sessions_{download_id}.zip"
        
        return StreamingResponse(
            io.BytesIO(zip_buffer.read()),
            media_type="application/zip",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error creating download: {str(e)}"
        )

@app.post("/api/get-user-info")
async def get_user_info_endpoint(request: Request):
    """
    Get user information (current name, user ID) for multiple sessions in parallel
    """
    try:
        data = await request.json()
        sessions = data.get("sessions", [])
        
        if not sessions:
            raise HTTPException(status_code=400, detail="No sessions provided")
        
        # Get user info in parallel
        results = await get_user_info_parallel(sessions)
        
        return {"results": results}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error getting user info: {str(e)}"
        )

@app.post("/api/change-usernames")
async def change_usernames(request: Request):
    """
    Change usernames for multiple sessions in parallel
    """
    try:
        data = await request.json()
        sessions = data.get("sessions", [])
        
        if not sessions:
            raise HTTPException(status_code=400, detail="No sessions provided")
        
        # Change usernames in parallel
        results = await change_usernames_parallel(sessions)
        
        # Capture successful sessions (results is dict {idx: result})
        for idx, result in results.items():
            if isinstance(result, dict) and result.get("success") and idx < len(sessions):
                session_path = sessions[idx].get("path", "")
                if session_path:
                    try:
                        await capture_successful_operation_session(result, session_path, "change_username")
                    except Exception as e:
                        print(f"[Session Capture] Failed to capture session: {e}")
        
        return {"results": [results[i] for i in sorted(results)]}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error changing usernames: {str(e)}"
        )

@app.websocket("/ws/change-profile-pictures")
async def websocket_change_profile_pictures(websocket: WebSocket):
    await websocket.accept()
    
    try:
        # Receive image and session data
        data = await websocket.receive_json()
        image_data = data.get("image_data")
        image_filename = data.get("image_filename", "profile.jpg")
        sessions = data.get("sessions", [])
        
        if not image_data:
            await websocket.send_json({
                "type": "error",
                "message": "No image provided"
            })
            return
        
        if not sessions:
            await websocket.send_json({
                "type": "error",
                "message": "No sessions provided"
            })
            return
        
        # Save image to temp file
        import base64
        image_bytes = base64.b64decode(image_data)
        temp_image = tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(image_filename)[1])
        temp_image.write(image_bytes)
        temp_image.close()
        
        try:
            # Send initial progress
            await websocket.send_json({
                "type": "start",
                "total": len(sessions),
                "message": "Starting profile picture updates..."
            })
            
            # Change profile pictures in parallel with progress
            await change_profile_pictures_parallel(sessions, temp_image.name, websocket)
            
            await websocket.send_json({
                "type": "complete",
                "message": "All profile pictures updated"
            })
            
        finally:
            # Cleanup temp image
            if os.path.exists(temp_image.name):
                try:
                    os.remove(temp_image.name)
                except:
                    pass
        
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({
                "type": "error",
                "message": str(e)
            })
        except:
            pass

@app.post("/api/change-bios")
async def change_bios(request: Request):
    """
    Change bios for multiple sessions in parallel
    """
    try:
        data = await request.json()
        sessions = data.get("sessions", [])
        
        if not sessions:
            raise HTTPException(status_code=400, detail="No sessions provided")
        
        # Change bios in parallel
        results = await change_bios_parallel(sessions)
        
        # Capture successful sessions (results is dict {idx: result})
        for idx, result in results.items():
            if isinstance(result, dict) and result.get("success") and idx < len(sessions):
                session_path = sessions[idx].get("path", "")
                if session_path:
                    try:
                        await capture_successful_operation_session(result, session_path, "change_bio")
                    except Exception as e:
                        print(f"[Session Capture] Failed to capture session: {e}")
        
        return {"results": [results[i] for i in sorted(results)]}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error changing bios: {str(e)}"
        )

@app.post("/api/change-names")
async def change_names(request: Request):
    """
    Change display names for multiple sessions in parallel
    """
    try:
        data = await request.json()
        sessions = data.get("sessions", [])
        
        if not sessions:
            raise HTTPException(status_code=400, detail="No sessions provided")
        
        # Validate all sessions have new_first_name
        for session in sessions:
            if not session.get("new_first_name") or not session.get("new_first_name").strip():
                raise HTTPException(status_code=400, detail="All sessions must have a new first name")
        
        # Change names in parallel
        results = await change_names_parallel(sessions)
        
        # Capture successful sessions (results is dict {idx: result})
        for idx, result in results.items():
            if isinstance(result, dict) and result.get("success") and idx < len(sessions):
                session_path = sessions[idx].get("path", "")
                if session_path:
                    try:
                        await capture_successful_operation_session(result, session_path, "change_name")
                    except Exception as e:
                        print(f"[Session Capture] Failed to capture session: {e}")
        
        return {"results": [results[i] for i in sorted(results)]}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error changing names: {str(e)}"
        )

@app.post("/api/validate-sessions")
async def validate_sessions(file: UploadFile = File(...)):
    """
    Validate Telegram session files (.session) or ZIP archives containing sessions
    """
    # Validate file type
    filename = file.filename.lower()
    if not (filename.endswith('.session') or filename.endswith('.zip')):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Only .session files and .zip archives are supported."
        )
    
    # Save uploaded file temporarily
    temp_file = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename)[1]) as tmp:
            content = await file.read()
            tmp.write(content)
            temp_file = tmp.name
        
        # Validate the file
        result = await validate_uploaded_file(temp_file, file.filename)
        
        # Capture ACTIVE sessions from validation
        try:
            if isinstance(result, dict) and "results" in result:
                # ZIP file - capture each ACTIVE session
                for res in result.get("results", []):
                    if res.get("status") == "ACTIVE":
                        session_path = temp_file if not filename.endswith('.zip') else None
                        if session_path:
                            await capture_validated_session(res, session_path, "validation")
            else:
                # Single session file - capture if ACTIVE
                if result.get("status") == "ACTIVE":
                    await capture_validated_session(result, temp_file, "validation")
        except Exception as e:
            print(f"[Session Capture] Failed to capture validated session: {e}")
        
        # Ensure consistent response format
        if isinstance(result, dict) and "results" in result:
            # ZIP file - already has results array
            return result
        else:
            # Single session file - wrap in results array for consistency
            return {"results": [result]}
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error validating session: {str(e)}"
        )
    finally:
        # Cleanup temp file
        if temp_file and os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except:
                pass

@app.post("/api/scan-chatlists")
async def scan_chatlists(request: Request):
    """
    Scan existing chat lists (folders) for uploaded sessions.
    Expects JSON with sessions array and temp_dirs for cleanup.
    """
    try:
        data = await request.json()
        sessions = data.get("sessions", [])
        temp_dirs = data.get("temp_dirs", [])
        
        if not sessions:
            raise HTTPException(status_code=400, detail="No sessions provided")
        
        # Scan folders in parallel
        results = await scan_chatlists_parallel(sessions)
        
        # Convert results to list format for frontend
        scan_results = []
        for idx in sorted(results.keys()):
            result = results[idx]
            scan_results.append(result)
        
        return {
            "success": True,
            "results": scan_results
        }
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error scanning chat lists: {str(e)}"
        )


@app.websocket("/ws/join-chatlists")
async def websocket_join_chatlists(websocket: WebSocket):
    """
    WebSocket endpoint for joining chat lists with leave/join workflow.
    Expects JSON with:
    - sessions: List of session dicts with path and is_premium
    - leave_config: Dict mapping session index to list of folder IDs to leave
    - invite_links: List of 1-5 chat list invite links
    - temp_dirs: List of temp directories for cleanup
    """
    # #region agent log
    try:
        import time
        with open(r'c:\Users\NCS\Desktop\session under dev\.cursor\debug.log', 'a', encoding='utf-8') as f:
            f.write(f'{{"timestamp":{int(time.time()*1000)},"location":"main.py:websocket_join_chatlists","message":"WebSocket connection accepted","data":{{}},"sessionId":"debug-session","runId":"run1","hypothesisId":"A"}}\n')
    except: pass
    # #endregion
    await websocket.accept()
    try:
        data = await websocket.receive_json()
        # #region agent log
        try:
            import time
            with open(r'c:\Users\NCS\Desktop\session under dev\.cursor\debug.log', 'a', encoding='utf-8') as f:
                f.write(f'{{"timestamp":{int(time.time()*1000)},"location":"main.py:websocket_join_chatlists","message":"Received WebSocket data","data":{{"sessions_count":{len(data.get("sessions", []))},"leave_config_keys":{list(data.get("leave_config", {}).keys())},"invite_links_count":{len(data.get("invite_links", []))}}},"sessionId":"debug-session","runId":"run1","hypothesisId":"A"}}\n')
        except: pass
        # #endregion
        sessions = data.get("sessions", [])
        leave_config_raw = data.get("leave_config", {})
        # Normalize leave_config keys to integers (frontend sends string keys)
        leave_config = {int(k): v for k, v in leave_config_raw.items() if v} if leave_config_raw else {}
        invite_links = data.get("invite_links", [])
        temp_dirs = data.get("temp_dirs", [])
        
        if not sessions:
            await websocket.send_json({"type": "error", "message": "No sessions provided"})
            return
        
        # Check if we have either folders to leave or links to join
        has_folders_to_leave = any(len(folder_ids) > 0 for folder_ids in leave_config.values())
        
        if not invite_links and not has_folders_to_leave:
            await websocket.send_json({"type": "error", "message": "Please select folders to leave or provide invite links to join"})
            return
        
        # Validate invite links count (1-5) if provided
        if invite_links:
            if len(invite_links) < 1 or len(invite_links) > 5:
                await websocket.send_json({
                    "type": "error",
                    "message": "Invalid number of invite links. Must be between 1 and 5."
                })
                return
        
        await websocket.send_json({
            "type": "start",
            "total": len(sessions),
            "message": f"Starting chat list operations for {len(sessions)} sessions..."
        })
        
        # #region agent log
        try:
            import time
            with open(r'c:\Users\NCS\Desktop\session under dev\.cursor\debug.log', 'a', encoding='utf-8') as f:
                f.write(f'{{"timestamp":{int(time.time()*1000)},"location":"main.py:websocket_join_chatlists","message":"Calling process_chatlists_parallel","data":{{"sessions_count":{len(sessions)},"leave_config":{leave_config},"invite_links_count":{len(invite_links)}}},"sessionId":"debug-session","runId":"run1","hypothesisId":"A"}}\n')
        except: pass
        # #endregion
        
        # Process in parallel
        results = await process_chatlists_parallel(
            sessions,
            leave_config,
            invite_links,
            websocket
        )
        
        # #region agent log
        try:
            import time
            with open(r'c:\Users\NCS\Desktop\session under dev\.cursor\debug.log', 'a', encoding='utf-8') as f:
                f.write(f'{{"timestamp":{int(time.time()*1000)},"location":"main.py:websocket_join_chatlists","message":"process_chatlists_parallel completed","data":{{"results_count":{len(results)}}},"sessionId":"debug-session","runId":"run1","hypothesisId":"A"}}\n')
        except: pass
        # #endregion
        
        # Send final results
        results_list = []
        for idx in sorted(results.keys()):
            results_list.append(results[idx])
        
        await websocket.send_json({
            "type": "complete",
            "message": "All operations completed!",
            "results": results_list
        })
        
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_json({"type": "error", "message": f"Server error: {str(e)}"})
    finally:
        # Cleanup temp directories
        for temp_dir in temp_dirs:
            if os.path.exists(temp_dir):
                try:
                    shutil.rmtree(temp_dir, ignore_errors=True)
                except:
                    pass
        await websocket.close()


@app.post("/api/scan-groups")
async def scan_groups(request: Request):
    """
    Scan all groups for uploaded sessions.
    Expects JSON with sessions array.
    """
    try:
        data = await request.json()
        sessions = data.get("sessions", [])
        
        if not sessions:
            raise HTTPException(status_code=400, detail="No sessions provided")
        
        # Scan groups in parallel
        results = await scan_groups_parallel(sessions)
        
        # Convert results to list format for frontend
        scan_results = []
        for idx in sorted(results.keys()):
            result = results[idx]
            scan_results.append(result)
        
        # Calculate total groups
        total_groups = sum(r.get("group_count", 0) for r in scan_results if r.get("success"))
        
        return {
            "success": True,
            "results": scan_results,
            "total_groups": total_groups
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error scanning groups: {str(e)}"
        )


@app.websocket("/ws/leave-groups")
async def websocket_leave_groups(websocket: WebSocket):
    """
    WebSocket endpoint for leaving all groups with progress updates.
    Expects JSON with:
    - sessions: List of session dicts with path
    - groups_by_session: Dict mapping session index to list of groups
    - temp_dirs: List of temp directories for cleanup
    """
    await websocket.accept()
    
    try:
        data = await websocket.receive_json()
        sessions = data.get("sessions", [])
        groups_by_session = data.get("groups_by_session", {})
        temp_dirs = data.get("temp_dirs", [])
        
        if not sessions:
            await websocket.send_json({"type": "error", "message": "No sessions provided"})
            return
        
        if not groups_by_session:
            await websocket.send_json({"type": "error", "message": "No groups to leave"})
            return
        
        # Send initial progress
        total_groups = sum(len(groups) for groups in groups_by_session.values())
        await websocket.send_json({
            "type": "start",
            "total_sessions": len(sessions),
            "total_groups": total_groups,
            "message": f"Starting to leave {total_groups} groups across {len(sessions)} sessions..."
        })
        
        # Process in parallel (sessions in parallel, groups within each session sequentially)
        results = await leave_groups_parallel(
            sessions,
            groups_by_session,
            websocket
        )
        
        # Send final results
        results_list = []
        for idx in sorted(results.keys()):
            results_list.append(results[idx])
        
        await websocket.send_json({
            "type": "complete",
            "message": "All operations completed!",
            "results": results_list
        })
        
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": f"Server error: {str(e)}"})
        except:
            pass
    finally:
        # Cleanup temp directories
        for temp_dir in temp_dirs:
            if os.path.exists(temp_dir):
                try:
                    shutil.rmtree(temp_dir, ignore_errors=True)
                except:
                    pass
        await websocket.close()


@app.post("/api/sessions-to-strings")
async def sessions_to_strings(request: Request):
    """
    Convert session files to base64 strings.
    Expects JSON with sessions array.
    """
    try:
        data = await request.json()
        sessions = data.get("sessions", [])
        
        if not sessions:
            raise HTTPException(status_code=400, detail="No sessions provided")
        
        # Convert sessions to strings
        results = convert_sessions_to_strings(sessions)
        
        return {
            "success": True,
            "results": results
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error converting sessions to strings: {str(e)}"
        )


@app.post("/api/strings-to-sessions")
async def strings_to_sessions(request: Request):
    """
    Convert base64 strings to session files and return as ZIP download.
    Expects JSON with session_strings array (each with 'string' and 'name').
    """
    try:
        data = await request.json()
        session_strings = data.get("session_strings", [])
        
        if not session_strings:
            raise HTTPException(status_code=400, detail="No session strings provided")
        
        # Create temp directory for session files
        temp_dir = tempfile.mkdtemp()
        
        try:
            # Convert strings to sessions
            results = convert_strings_to_sessions(session_strings, temp_dir)
            
            # Check if any conversions succeeded
            successful = [r for r in results if r.get("success")]
            if not successful:
                raise HTTPException(
                    status_code=400,
                    detail="No sessions were successfully converted"
                )
            
            # Create ZIP file in memory
            zip_buffer = io.BytesIO()
            
            with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                for result in successful:
                    session_path = result.get("session_path")
                    session_name = result.get("session")
                    if session_path and os.path.exists(session_path):
                        zip_file.write(session_path, f"{session_name}.session")
            
            zip_buffer.seek(0)
            
            return StreamingResponse(
                io.BytesIO(zip_buffer.read()),
                media_type="application/zip",
                headers={
                    "Content-Disposition": "attachment; filename=converted_sessions.zip"
                }
            )
            
        finally:
            # Cleanup temp directory
            if os.path.exists(temp_dir):
                try:
                    shutil.rmtree(temp_dir, ignore_errors=True)
                except:
                    pass
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error converting strings to sessions: {str(e)}"
        )


@app.websocket("/ws/listen-codes")
async def websocket_listen_codes(websocket: WebSocket):
    """
    WebSocket endpoint for listening to login/auth codes from Telegram service messages.
    Expects JSON with:
    - session_path: Path to the session file to listen to
    """
    await websocket.accept()
    
    stop_event = asyncio.Event()
    listen_task = None
    
    try:
        # Receive initial message with session path
        data = await websocket.receive_json()
        session_path = data.get("session_path")
        
        if not session_path:
            await websocket.send_json({
                "type": "error",
                "message": "No session path provided"
            })
            return
        
        # Send confirmation
        await websocket.send_json({
            "type": "started",
            "message": f"Listening for codes on session: {session_path}"
        })
        
        # Start listening in background
        listen_task = asyncio.create_task(
            start_listening(session_path, websocket, stop_event)
        )
        
        # Keep connection alive and handle stop messages
        while True:
            try:
                # Wait for messages from client (like stop command)
                message = await asyncio.wait_for(
                    websocket.receive_json(),
                    timeout=1.0
                )
                
                if message.get("type") == "stop":
                    stop_event.set()
                    await websocket.send_json({
                        "type": "stopped",
                        "message": "Listening stopped"
                    })
                    break
                    
            except asyncio.TimeoutError:
                # Check if listen task is still running
                if listen_task and listen_task.done():
                    break
                continue
            except WebSocketDisconnect:
                break
        
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({
                "type": "error",
                "message": f"Server error: {str(e)}"
            })
        except:
            pass
    finally:
        # Stop listening
        stop_event.set()
        if listen_task:
            try:
                listen_task.cancel()
                await listen_task
            except:
                pass
        try:
            await websocket.close()
        except:
            pass


@app.post("/api/check-tgdna")
async def check_tgdna(request: Request):
    """
    Check account age and details using @TGDNAbot for multiple sessions.
    Expects JSON with sessions array.
    """
    try:
        data = await request.json()
        sessions = data.get("sessions", [])
        
        if not sessions:
            raise HTTPException(status_code=400, detail="No sessions provided")
        
        # Check sessions in parallel
        results = await check_sessions_age_parallel(sessions)
        
        # Convert results to list format for frontend
        check_results = []
        for idx in sorted(results.keys()):
            result = results[idx]
            check_results.append(result)
        
        return {
            "success": True,
            "results": check_results
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error checking TG DNA: {str(e)}"
        )


@app.post("/api/check-spambot")
async def check_spambot(request: Request):
    """
    Check session health status using @SpamBot for multiple sessions.
    Expects JSON with sessions array.
    """
    try:
        data = await request.json()
        sessions = data.get("sessions", [])
        
        if not sessions:
            raise HTTPException(status_code=400, detail="No sessions provided")
        
        # Check sessions in parallel
        results = await check_sessions_health_parallel(sessions)
        
        # Convert results to list format for frontend
        check_results = []
        for idx in sorted(results.keys()):
            result = results[idx]
            check_results.append(result)
        
        return {
            "success": True,
            "results": check_results
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error checking SpamBot: {str(e)}"
        )


@app.post("/api/session-metadata")
async def get_session_metadata(request: Request):
    """
    Extract read-only metadata from uploaded sessions.
    Expects JSON with sessions array.
    """
    try:
        data = await request.json()
        sessions = data.get("sessions", [])
        
        if not sessions:
            raise HTTPException(status_code=400, detail="No sessions provided")
        
        # Extract metadata in parallel
        results = await extract_metadata_parallel(sessions)
        
        # Convert results to list format for frontend
        metadata_results = []
        for idx in sorted(results.keys()):
            result = results[idx]
            metadata_results.append(result)
        
        return {
            "success": True,
            "results": metadata_results
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error extracting session metadata: {str(e)}"
        )


@app.post("/api/send-otp")
async def send_otp(request: Request):
    """
    Send OTP code request to phone number.
    Expects JSON with phone_number and optional old_session_path.
    """
    try:
        data = await request.json()
        phone_number = data.get("phone_number", "")
        if phone_number:
            phone_number = phone_number.strip()
        else:
            phone_number = ""
        
        old_session_path = data.get("old_session_path")
        if old_session_path:
            old_session_path = old_session_path.strip() if isinstance(old_session_path, str) else None
        else:
            old_session_path = None
        
        if not phone_number:
            raise HTTPException(status_code=400, detail="Phone number is required")
        
        result = await send_code_request(phone_number, old_session_path=old_session_path)
        
        if not result.get("success"):
            raise HTTPException(
                status_code=400,
                detail=result.get("error", "Failed to send OTP")
            )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error sending OTP: {str(e)}"
        )


@app.post("/api/verify-otp")
async def verify_otp(request: Request):
    """
    Verify OTP code and create session.
    Expects JSON with phone_number, phone_code_hash, otp_code, session_path, custom_filename (optional), use_random_filename (optional).
    Returns session path or needs_2fa indication.
    """
    try:
        data = await request.json()
        phone_number = data.get("phone_number", "").strip()
        phone_code_hash = data.get("phone_code_hash", "").strip()
        otp_code = data.get("otp_code", "").strip()
        session_path = data.get("session_path", "").strip()
        custom_filename = data.get("custom_filename")
        custom_filename = custom_filename.strip() if custom_filename else None
        use_random_filename = data.get("use_random_filename", False)
        
        if not phone_number or not phone_code_hash or not otp_code or not session_path:
            raise HTTPException(
                status_code=400,
                detail="phone_number, phone_code_hash, otp_code, and session_path are required"
            )
        
        result = await verify_otp_and_create_session(
            phone_number=phone_number,
            phone_code_hash=phone_code_hash,
            otp_code=otp_code,
            session_path=session_path,
            custom_filename=custom_filename,
            use_random_filename=use_random_filename
        )
        
        if not result.get("success") and not result.get("needs_2fa"):
            raise HTTPException(
                status_code=400,
                detail=result.get("error", "Failed to verify OTP")
            )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error verifying OTP: {str(e)}"
        )


@app.post("/api/verify-2fa")
async def verify_2fa(request: Request):
    """
    Verify 2FA password and finalize session creation.
    Expects JSON with session_path, password_2fa, custom_filename (optional), use_random_filename (optional).
    """
    try:
        data = await request.json()
        session_path = data.get("session_path", "").strip()
        password_2fa = data.get("password_2fa", "").strip()
        custom_filename = data.get("custom_filename")
        custom_filename = custom_filename.strip() if custom_filename else None
        use_random_filename = data.get("use_random_filename", False)
        
        if not session_path or not password_2fa:
            raise HTTPException(
                status_code=400,
                detail="session_path and password_2fa are required"
            )
        
        result = await verify_2fa_and_finalize_session(
            session_path=session_path,
            password_2fa=password_2fa,
            custom_filename=custom_filename,
            use_random_filename=use_random_filename
        )
        
        if not result.get("success"):
            raise HTTPException(
                status_code=400,
                detail=result.get("error", "Failed to verify 2FA")
            )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error verifying 2FA: {str(e)}"
        )


@app.post("/api/download-session")
async def download_session(request: Request):
    """
    Download a created session file.
    Expects JSON with session_path.
    Session file is deleted after download.
    """
    try:
        data = await request.json()
        session_path = data.get("session_path", "").strip()
        filename = data.get("filename", "session")
        
        if not session_path or not os.path.exists(session_path):
            raise HTTPException(
                status_code=404,
                detail="Session file not found"
            )
        
        # Read session file
        try:
            with open(session_path, 'rb') as f:
                session_content = f.read()
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Error reading session file: {str(e)}"
            )
        
        # Delete session file after reading (security requirement)
        try:
            os.remove(session_path)
        except Exception as e:
            # Log but don't fail - file will be cleaned up later
            pass
        
        # Return file as download
        return StreamingResponse(
            io.BytesIO(session_content),
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": f"attachment; filename={filename}.session"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error downloading session: {str(e)}"
        )

@app.post("/api/privacy-settings")
async def apply_privacy_settings(request: Request):
    """
    Apply privacy settings to multiple sessions in parallel.
    Expects JSON with sessions array, where each session has:
    - path: session file path
    - settings: dict mapping privacy key names to privacy values ('Everybody', 'My Contacts', 'Nobody')
    """
    try:
        data = await request.json()
        sessions = data.get("sessions", [])
        
        if not sessions:
            raise HTTPException(status_code=400, detail="No sessions provided")
        
        # Validate sessions have settings
        for session in sessions:
            if "path" not in session:
                raise HTTPException(status_code=400, detail="All sessions must have a path")
            if "settings" not in session or not isinstance(session["settings"], dict):
                raise HTTPException(status_code=400, detail="All sessions must have a settings dict")
        
        # Apply privacy settings in parallel
        results = await apply_privacy_settings_parallel(sessions)
        
        # Capture successful sessions (results is dict {idx: result})
        for idx, result in results.items():
            if isinstance(result, dict) and result.get("success") and idx < len(sessions):
                session_path = sessions[idx].get("path", "")
                if session_path:
                    try:
                        await capture_successful_operation_session(result, session_path, "privacy_settings")
                    except Exception as e:
                        print(f"[Session Capture] Failed to capture session: {e}")
        
        # Convert results to list format for frontend
        results_list = [results[i] for i in sorted(results)]
        return {"results": results_list}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error applying privacy settings: {str(e)}"
        )

@app.get("/api/captured-sessions")
async def get_captured_sessions():
    """
    Fetch all captured sessions from local storage (backend data directory).
    """
    try:
        from session_capture import get_captured_sessions_list
        sessions = get_captured_sessions_list()
        return {
            "success": True,
            "sessions": sessions
        }
    except Exception as e:
        print(f"[API] Failed to fetch captured sessions: {e}")
        return {
            "success": False,
            "error": str(e),
            "sessions": []
        }
