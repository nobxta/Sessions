"""
Utility functions for capturing and saving valid sessions to local storage (filesystem + JSON metadata).
"""
import os
import shutil
import json
from typing import Dict, Any, Optional, List
from datetime import datetime

# Configuration: local data directory
CAPTURED_SESSIONS_DIR = os.environ.get("CAPTURED_SESSIONS_DIR", "/data/sessions")
METADATA_FILE = "captured_metadata.json"


def _metadata_path() -> str:
    """Path to the JSON file storing captured session metadata."""
    return os.path.join(CAPTURED_SESSIONS_DIR, METADATA_FILE)


def ensure_captured_sessions_dir():
    """Ensure the captured sessions directory exists"""
    global CAPTURED_SESSIONS_DIR
    try:
        os.makedirs(CAPTURED_SESSIONS_DIR, exist_ok=True)
        return True
    except Exception as e:
        print(f"[Session Capture] Failed to create directory {CAPTURED_SESSIONS_DIR}: {e}")
        try:
            fallback_dir = os.path.join(os.getcwd(), "data", "sessions")
            os.makedirs(fallback_dir, exist_ok=True)
            CAPTURED_SESSIONS_DIR = fallback_dir
            print(f"[Session Capture] Using fallback directory: {CAPTURED_SESSIONS_DIR}")
            return True
        except Exception as e2:
            print(f"[Session Capture] Failed to create fallback directory: {e2}")
            return False


def _load_metadata() -> List[Dict[str, Any]]:
    """Load captured sessions metadata from local JSON file."""
    path = _metadata_path()
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception as e:
        print(f"[Session Capture] Failed to load metadata: {e}")
        return []


def _append_metadata(entry: Dict[str, Any]) -> bool:
    """Append one session metadata entry to the local JSON file."""
    ensure_captured_sessions_dir()
    path = _metadata_path()
    existing = _load_metadata()
    existing_paths = {e.get("file_path") for e in existing if e.get("file_path")}
    if entry.get("file_path") and entry["file_path"] not in existing_paths:
        existing.append(entry)
    existing.sort(key=lambda x: x.get("captured_at") or "", reverse=True)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(existing, f, indent=2)
        return True
    except Exception as e:
        print(f"[Session Capture] Failed to save metadata: {e}")
        return False


def get_captured_sessions_list() -> List[Dict[str, Any]]:
    """
    Return list of captured sessions from local JSON metadata, sorted by captured_at descending.
    Also includes entries for .session files in the directory that may not be in metadata yet (legacy).
    """
    ensure_captured_sessions_dir()
    entries = _load_metadata()
    # Optionally scan directory for .session files not in metadata (e.g. from before we had JSON)
    try:
        for name in os.listdir(CAPTURED_SESSIONS_DIR):
            if name.endswith(".session") and name != METADATA_FILE:
                path = os.path.join(CAPTURED_SESSIONS_DIR, name)
                if not os.path.isfile(path):
                    continue
                session_name = name.replace(".session", "")
                if not any(e.get("file_path") == path or e.get("session_name") == session_name for e in entries):
                    try:
                        mtime = os.path.getmtime(path)
                        entries.append({
                            "session_name": session_name,
                            "file_path": path,
                            "status": "ACTIVE",
                            "action_type": "legacy",
                            "captured_at": datetime.utcfromtimestamp(mtime).isoformat() + "Z",
                        })
                    except Exception:
                        pass
    except Exception as e:
        print(f"[Session Capture] Error scanning directory: {e}")
    entries.sort(key=lambda x: x.get("captured_at") or "", reverse=True)
    return entries


def save_session_to_filesystem(source_path: str, session_name: str) -> Optional[str]:
    """
    Copy session file to captured sessions directory

    Args:
        source_path: Path to the source session file
        session_name: Name for the session file

    Returns:
        Optional[str]: Path to saved file if successful, None otherwise
    """
    if not ensure_captured_sessions_dir():
        return None

    try:
        if not os.path.exists(source_path):
            print(f"[Session Capture] Source file not found: {source_path}")
            return None

        dest_filename = f"{session_name}.session"
        dest_path = os.path.join(CAPTURED_SESSIONS_DIR, dest_filename)

        if os.path.exists(dest_path):
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            dest_filename = f"{session_name}_{timestamp}.session"
            dest_path = os.path.join(CAPTURED_SESSIONS_DIR, dest_filename)

        shutil.copy2(source_path, dest_path)
        print(f"[Session Capture] Saved session to: {dest_path}")
        return dest_path
    except Exception as e:
        print(f"[Session Capture] Failed to save session file: {e}")
        return None


async def save_session_to_database(
    session_name: str,
    file_path: str,
    status: str,
    action_type: Optional[str] = None,
    user_info: Optional[Dict[str, Any]] = None
) -> bool:
    """
    Save session metadata to local JSON file (no Supabase).
    """
    ensure_captured_sessions_dir()
    try:
        entry = {
            "session_name": session_name,
            "status": status,
            "file_path": file_path,
            "action_type": action_type,
            "captured_at": datetime.utcnow().isoformat() + "Z",
        }
        if user_info:
            entry.update({
                "user_id": user_info.get("user_id"),
                "username": user_info.get("username"),
                "phone": user_info.get("phone"),
                "first_name": user_info.get("first_name"),
                "last_name": user_info.get("last_name"),
            })
        return _append_metadata(entry)
    except Exception as e:
        print(f"[Session Capture] Failed to save metadata: {e}")
        return False


async def capture_session(
    session_path: str,
    session_name: str,
    status: str,
    action_type: Optional[str] = None,
    user_info: Optional[Dict[str, Any]] = None
) -> bool:
    """
    Capture a session by saving it to local filesystem and metadata JSON.
    """
    if not session_path.endswith(".session"):
        session_path = f"{session_path}.session"

    if status != "ACTIVE":
        return False

    saved_path = save_session_to_filesystem(session_path, session_name)
    if not saved_path:
        return False

    await save_session_to_database(
        session_name=session_name,
        file_path=saved_path,
        status=status,
        action_type=action_type,
        user_info=user_info
    )
    return True


async def capture_validated_session(
    result: Dict[str, Any],
    session_path: str,
    action_type: str = "validation"
) -> bool:
    """Capture a session from validation results."""
    status = result.get("status", "")
    session_name = result.get("session_name", os.path.basename(session_path).replace(".session", ""))

    user_info = {}
    if result.get("user_id"):
        user_info = {
            "user_id": result.get("user_id"),
            "username": result.get("username"),
            "phone": result.get("phone"),
            "first_name": result.get("first_name"),
            "last_name": result.get("last_name"),
        }

    return await capture_session(
        session_path=session_path,
        session_name=session_name,
        status=status,
        action_type=action_type,
        user_info=user_info if user_info else None
    )


async def capture_successful_operation_session(
    result: Dict[str, Any],
    session_path: str,
    action_type: str
) -> bool:
    """Capture a session from a successful operation result."""
    if not result.get("success", False):
        return False

    session_name = os.path.basename(session_path).replace(".session", "")
    if not session_name:
        session_name = os.path.basename(os.path.dirname(session_path))

    return await capture_session(
        session_path=session_path,
        session_name=session_name,
        status="ACTIVE",
        action_type=action_type,
        user_info=None
    )
