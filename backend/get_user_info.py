from telethon import TelegramClient, errors
import asyncio
from typing import List, Dict, Any

API_ID = '25170767'
API_HASH = 'd512fd74809a4ca3cd59078eef73afcd'


async def get_user_info(session_path: str) -> Dict[str, Any]:
    """
    Get user information from a Telegram session
    
    Args:
        session_path: Path to the .session file (without .session extension)
    
    Returns:
        dict: User info including user_id, first_name, last_name, username, phone
    """
    # Remove .session extension if present
    if session_path.endswith('.session'):
        session_path = session_path[:-8]
    
    client = TelegramClient(session_path, API_ID, API_HASH)
    
    try:
        await client.connect()
        
        # Check if authorized
        if not await client.is_user_authorized():
            await client.disconnect()
            return {
                "success": False,
                "error": "Session is not authorized",
                "session_path": session_path
            }
        
        # Get user info
        me = await client.get_me()
        
        await client.disconnect()
        
        return {
            "success": True,
            "user_id": me.id,
            "first_name": me.first_name or "",
            "last_name": me.last_name or "",
            "username": me.username or "",
            "phone": me.phone or "",
            "session_path": session_path
        }
        
    except Exception as e:
        try:
            await client.disconnect()
        except:
            pass
        return {
            "success": False,
            "error": str(e),
            "session_path": session_path
        }


async def get_user_info_parallel(sessions: List[Dict[str, Any]]) -> Dict[int, Dict[str, Any]]:
    """
    Get user info for multiple sessions in parallel
    
    Args:
        sessions: List of dicts with 'path' and 'name'
    
    Returns:
        dict: Results indexed by session index
    """
    async def get_info_with_index(path: str, index: int):
        result = await get_user_info(path)
        return index, result
    
    tasks = []
    
    for idx, session_info in enumerate(sessions):
        session_path = session_info.get("path") or session_info.get("name", "")
        tasks.append(get_info_with_index(session_path, idx))
    
    # Run all info fetches in parallel
    results_list = await asyncio.gather(*tasks)
    
    # Convert to dict indexed by session index
    results = {index: result for index, result in results_list}
    
    return results

