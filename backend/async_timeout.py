"""
Minimal timeout wrapper for Telethon connect/start and API calls.
When a call exceeds the timeout, the session is treated as failed so the batch can continue.
"""
import asyncio
import logging

logger = logging.getLogger(__name__)

CONNECT_TIMEOUT = 20
API_TIMEOUT = 40

# Sentinel returned by run_with_timeout on timeout; callers check "if result is TIMEOUT_SENTINEL"
TIMEOUT_SENTINEL = object()


async def run_with_timeout(coro, timeout, default=None, session_path=None):
    try:
        return await asyncio.wait_for(coro, timeout=timeout)
    except asyncio.TimeoutError:
        if session_path is not None:
            logger.warning("[TIMEOUT] session %s exceeded %ss", session_path, timeout)
        return default
