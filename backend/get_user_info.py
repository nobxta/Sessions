from telethon import TelegramClient, errors
import asyncio
from typing import List, Dict, Any
from async_timeout import run_with_timeout, CONNECT_TIMEOUT, API_TIMEOUT, TIMEOUT_SENTINEL
from concurrency_config import MAX_CONCURRENT_SESSIONS
import logging

logger = logging.getLogger(__name__)
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
    logger.info("[SESSION START] %s", session_path)
    client = TelegramClient(session_path, API_ID, API_HASH)
    
    try:
        logger.info("[SESSION ACTION] %s connect", session_path)
        r = await run_with_timeout(client.connect(), CONNECT_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if r is TIMEOUT_SENTINEL:
            logger.warning("[SESSION FAIL] %s error=%s", session_path, "Connection timed out")
            return {
                "success": False,
                "error": "Connection timed out",
                "session_path": session_path
            }
        
        # Check if authorized
        is_auth = await run_with_timeout(client.is_user_authorized(), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if is_auth is TIMEOUT_SENTINEL:
            await client.disconnect()
            return {
                "success": False,
                "error": "Operation timed out",
                "session_path": session_path
            }
        if not is_auth:
            await client.disconnect()
            return {
                "success": False,
                "error": "Session is not authorized",
                "session_path": session_path
            }
        
        # Get user info
        me = await run_with_timeout(client.get_me(), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if me is TIMEOUT_SENTINEL:
            await client.disconnect()
            return {
                "success": False,
                "error": "Operation timed out",
                "session_path": session_path
            }
        
        await client.disconnect()
        logger.info("[SESSION END] %s success", session_path)
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
        logger.warning("[SESSION FAIL] %s error=%s", session_path, str(e))
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
    
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_SESSIONS)
    async def sem_task(path: str, index: int):
        async with semaphore:
            return await get_info_with_index(path, index)
    tasks = []
    for idx, session_info in enumerate(sessions):
        session_path = session_info.get("path") or session_info.get("name", "")
        tasks.append(sem_task(session_path, idx))
    
    # Run all info fetches in parallel
    results_list = await asyncio.gather(*tasks)
    
    # Convert to dict indexed by session index
    results = {index: result for index, result in results_list}
    
    return results

