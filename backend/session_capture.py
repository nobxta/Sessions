"""
Utility functions for capturing and saving valid sessions to database and file system
"""
import os
import shutil
import asyncio
from typing import Dict, Any, Optional
from datetime import datetime

# Database imports
try:
    from supabase import create_client, Client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False
    print("[Session Capture] Supabase not available - sessions will only be saved to file system")

# Configuration
CAPTURED_SESSIONS_DIR = "/data/sessions"
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")  # Use service role key for backend

# Initialize Supabase client if available
supabase: Optional[Client] = None
if SUPABASE_AVAILABLE and SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("[Session Capture] Supabase client initialized")
    except Exception as e:
        print(f"[Session Capture] Failed to initialize Supabase: {e}")
        supabase = None


def ensure_captured_sessions_dir():
    """Ensure the captured sessions directory exists"""
    try:
        os.makedirs(CAPTURED_SESSIONS_DIR, exist_ok=True)
        return True
    except Exception as e:
        print(f"[Session Capture] Failed to create directory {CAPTURED_SESSIONS_DIR}: {e}")
        # Try fallback to local directory
        try:
            fallback_dir = os.path.join(os.getcwd(), "data", "sessions")
            os.makedirs(fallback_dir, exist_ok=True)
            global CAPTURED_SESSIONS_DIR
            CAPTURED_SESSIONS_DIR = fallback_dir
            print(f"[Session Capture] Using fallback directory: {CAPTURED_SESSIONS_DIR}")
            return True
        except Exception as e2:
            print(f"[Session Capture] Failed to create fallback directory: {e2}")
            return False


async def save_session_to_database(
    session_name: str,
    file_path: str,
    status: str,
    action_type: Optional[str] = None,
    user_info: Optional[Dict[str, Any]] = None
) -> bool:
    """
    Save session metadata to Supabase database
    
    Args:
        session_name: Name of the session
        file_path: Path where the session file is saved
        status: Session status (ACTIVE, FROZEN, etc.)
        action_type: Type of action that triggered capture (validation, change_name, etc.)
        user_info: Optional user information dict with user_id, username, phone, first_name, last_name
    
    Returns:
        bool: True if saved successfully, False otherwise
    """
    if not supabase:
        return False
    
    try:
        data = {
            "session_name": session_name,
            "status": status,
            "file_path": file_path,
            "action_type": action_type,
            "captured_at": datetime.utcnow().isoformat(),
        }
        
        if user_info:
            data.update({
                "user_id": user_info.get("user_id"),
                "username": user_info.get("username"),
                "phone": user_info.get("phone"),
                "first_name": user_info.get("first_name"),
                "last_name": user_info.get("last_name"),
            })
        
        result = supabase.table("captured_sessions").insert(data).execute()
        return True
    except Exception as e:
        print(f"[Session Capture] Failed to save to database: {e}")
        return False


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
        # Ensure source file exists
        if not os.path.exists(source_path):
            print(f"[Session Capture] Source file not found: {source_path}")
            return None
        
        # Generate unique filename if session already exists
        dest_filename = f"{session_name}.session"
        dest_path = os.path.join(CAPTURED_SESSIONS_DIR, dest_filename)
        
        # If file exists, add timestamp to make it unique
        if os.path.exists(dest_path):
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            dest_filename = f"{session_name}_{timestamp}.session"
            dest_path = os.path.join(CAPTURED_SESSIONS_DIR, dest_filename)
        
        # Copy the session file
        shutil.copy2(source_path, dest_path)
        print(f"[Session Capture] Saved session to: {dest_path}")
        return dest_path
    except Exception as e:
        print(f"[Session Capture] Failed to save session file: {e}")
        return None


async def capture_session(
    session_path: str,
    session_name: str,
    status: str,
    action_type: Optional[str] = None,
    user_info: Optional[Dict[str, Any]] = None
) -> bool:
    """
    Capture a session by saving it to both database and file system
    
    Args:
        session_path: Path to the session file (with or without .session extension)
        session_name: Name of the session
        status: Session status (ACTIVE, FROZEN, etc.)
        action_type: Type of action that triggered capture
        user_info: Optional user information
    
    Returns:
        bool: True if captured successfully, False otherwise
    """
    # Normalize session path
    if not session_path.endswith('.session'):
        session_path = f"{session_path}.session"
    
    # Only capture ACTIVE sessions
    if status != "ACTIVE":
        return False
    
    # Save to file system
    saved_path = save_session_to_filesystem(session_path, session_name)
    if not saved_path:
        return False
    
    # Save to database
    db_success = await save_session_to_database(
        session_name=session_name,
        file_path=saved_path,
        status=status,
        action_type=action_type,
        user_info=user_info
    )
    
    # Return True if at least file system save succeeded
    return True


async def capture_validated_session(
    result: Dict[str, Any],
    session_path: str,
    action_type: str = "validation"
) -> bool:
    """
    Capture a session from validation results
    
    Args:
        result: Validation result dict with status and user_info
        session_path: Path to the session file
        action_type: Type of action (default: "validation")
    
    Returns:
        bool: True if captured successfully
    """
    status = result.get("status", "")
    session_name = result.get("session_name", os.path.basename(session_path).replace('.session', ''))
    
    # Extract user info from result
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
    """
    Capture a session from a successful operation result
    
    Args:
        result: Operation result dict with success status
        session_path: Path to the session file
        action_type: Type of action (change_name, change_username, etc.)
    
    Returns:
        bool: True if captured successfully
    """
    # Only capture if operation was successful
    if not result.get("success", False):
        return False
    
    # Extract session name from path
    session_name = os.path.basename(session_path).replace('.session', '')
    if not session_name:
        session_name = os.path.basename(os.path.dirname(session_path))
    
    # For successful operations, we assume the session is ACTIVE
    # (since it just performed an action successfully)
    return await capture_session(
        session_path=session_path,
        session_name=session_name,
        status="ACTIVE",
        action_type=action_type,
        user_info=None  # User info not always available in operation results
    )

