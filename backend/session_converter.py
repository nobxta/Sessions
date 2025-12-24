import base64
import os
from typing import List, Dict, Any


def session_to_string(session_path: str) -> Dict[str, Any]:
    """
    Convert a .session file to base64 string format.
    
    Args:
        session_path: Path to the .session file
    
    Returns:
        Dict with success status, session name, and base64 string
    """
    try:
        # Ensure .session extension
        if not session_path.endswith('.session'):
            session_path = f"{session_path}.session"
        
        if not os.path.exists(session_path):
            return {
                "success": False,
                "session": session_path,
                "error": f"Session file not found: {session_path}"
            }
        
        # Read session file as binary
        with open(session_path, 'rb') as f:
            session_data = f.read()
        
        # Encode to base64 string
        session_string = base64.b64encode(session_data).decode('utf-8')
        
        # Get session name (filename without extension)
        session_name = os.path.basename(session_path).replace('.session', '')
        
        return {
            "success": True,
            "session": session_name,
            "session_path": session_path,
            "string": session_string,
            "size": len(session_data)
        }
        
    except Exception as e:
        return {
            "success": False,
            "session": session_path,
            "error": f"Conversion error: {str(e)}"
        }


def string_to_session(session_string: str, session_name: str, output_dir: str = None) -> Dict[str, Any]:
    """
    Convert a base64 string back to a .session file.
    
    Args:
        session_string: Base64 encoded session data
        session_name: Name for the session file (without .session extension)
        output_dir: Optional directory to save the session file
    
    Returns:
        Dict with success status, session path, and file info
    """
    try:
        # Decode base64 string
        try:
            session_data = base64.b64decode(session_string)
        except Exception as e:
            return {
                "success": False,
                "session": session_name,
                "error": f"Invalid base64 string: {str(e)}"
            }
        
        # Ensure session name doesn't have .session extension
        if session_name.endswith('.session'):
            session_name = session_name[:-8]
        
        # Determine output path
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)
            session_path = os.path.join(output_dir, f"{session_name}.session")
        else:
            session_path = f"{session_name}.session"
        
        # Write session file
        with open(session_path, 'wb') as f:
            f.write(session_data)
        
        return {
            "success": True,
            "session": session_name,
            "session_path": session_path,
            "size": len(session_data)
        }
        
    except Exception as e:
        return {
            "success": False,
            "session": session_name,
            "error": f"Conversion error: {str(e)}"
        }


def convert_sessions_to_strings(sessions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Convert multiple session files to strings in parallel.
    
    Args:
        sessions: List of session dicts with 'path' key
    
    Returns:
        List of conversion results
    """
    results = []
    for session_info in sessions:
        session_path = session_info.get("path")
        if not session_path:
            results.append({
                "success": False,
                "session": "unknown",
                "error": "No session path provided"
            })
            continue
        
        result = session_to_string(session_path)
        result["index"] = len(results)
        results.append(result)
    
    return results


def convert_strings_to_sessions(
    session_strings: List[Dict[str, Any]],
    output_dir: str = None
) -> List[Dict[str, Any]]:
    """
    Convert multiple strings to session files.
    
    Args:
        session_strings: List of dicts with 'string' and 'name' keys
        output_dir: Optional directory to save session files
    
    Returns:
        List of conversion results
    """
    results = []
    for idx, session_info in enumerate(session_strings):
        session_string = session_info.get("string", "").strip()
        session_name = session_info.get("name", f"session_{idx + 1}")
        
        if not session_string:
            results.append({
                "success": False,
                "session": session_name,
                "error": "No session string provided",
                "index": idx
            })
            continue
        
        result = string_to_session(session_string, session_name, output_dir)
        result["index"] = idx
        results.append(result)
    
    return results

