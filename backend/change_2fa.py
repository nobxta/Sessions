from telethon import TelegramClient, errors
from telethon.tl.functions.account import GetPasswordRequest, UpdatePasswordSettingsRequest
from telethon.tl.types import account
from telethon.crypto.authkey import AuthKey
import telethon.helpers as helpers
from async_timeout import run_with_timeout, CONNECT_TIMEOUT, API_TIMEOUT, TIMEOUT_SENTINEL
import asyncio
import hashlib
import os
from typing import List, Dict, Any, Optional
from concurrency_config import MAX_CONCURRENT_SESSIONS
import logging

logger = logging.getLogger(__name__)
API_ID = '25170767'
API_HASH = 'd512fd74809a4ca3cd59078eef73afcd'


async def change_2fa_for_session(
    session_path: str,
    current_password: Optional[str],
    new_password: Optional[str],
) -> Dict[str, Any]:
    """
    Change or disable 2FA for a single Telegram session.

    Args:
        session_path: Path to .session file
        current_password: Current 2FA password (None / empty = account has no 2FA)
        new_password: New 2FA password (None / empty = disable 2FA)

    Returns:
        dict with success, error, needs_current_password (if wrong password)
    """
    if session_path.endswith('.session'):
        session_path = session_path[:-8]

    client = TelegramClient(session_path, API_ID, API_HASH)

    try:
        r = await run_with_timeout(client.connect(), CONNECT_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if r is TIMEOUT_SENTINEL:
            return {"success": False, "error": "Connection timed out", "session_path": session_path}

        is_auth = await run_with_timeout(client.is_user_authorized(), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if is_auth is TIMEOUT_SENTINEL or not is_auth:
            await client.disconnect()
            return {"success": False, "error": "Session not authorized", "session_path": session_path}

        # Edit 2FA via Telethon's built-in helper
        await client.edit_2fa(
            current_password=current_password or None,
            new_password=new_password or None,
        )

        await client.disconnect()
        action = "disabled" if not new_password else "changed"
        logger.info("[2FA] %s %s", session_path, action)
        return {"success": True, "action": action, "session_path": session_path}

    except errors.PasswordHashInvalidError:
        await client.disconnect()
        return {
            "success": False,
            "error": "Wrong current 2FA password",
            "wrong_password": True,
            "session_path": session_path,
        }
    except errors.FloodWaitError as e:
        await client.disconnect()
        return {"success": False, "error": f"Rate limited. Wait {e.seconds}s", "session_path": session_path}
    except errors.UserDeactivatedError:
        await client.disconnect()
        return {"success": False, "error": "Account deactivated", "session_path": session_path}
    except errors.UserDeactivatedBanError:
        await client.disconnect()
        return {"success": False, "error": "Account banned", "session_path": session_path}
    except errors.RPCError as e:
        await client.disconnect()
        return {"success": False, "error": f"Telegram error: {str(e)}", "session_path": session_path}
    except Exception as e:
        try:
            await client.disconnect()
        except:
            pass
        logger.warning("[2FA FAIL] %s error=%s", session_path, str(e))
        return {"success": False, "error": str(e), "session_path": session_path}


async def change_2fa_parallel(
    sessions: List[Dict[str, Any]],
    default_current_password: Optional[str],
    new_password: Optional[str],
    cancel_event=None,
) -> List[Dict[str, Any]]:
    """
    Change 2FA for multiple sessions in parallel.

    Each session dict:
      - path: str
      - current_password: str (optional, overrides default_current_password for this session)

    cancel_event: optional asyncio.Event; when set, pending sessions are skipped
    Returns list of result dicts with session_path, success, error, wrong_password.
    """
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_SESSIONS)

    async def process(session: dict) -> Dict[str, Any]:
        path = session.get("path") or session.get("name", "")
        if cancel_event and cancel_event.is_set():
            return {"success": False, "cancelled": True, "session_path": path}
        cur_pass = session.get("current_password") or default_current_password or None
        async with semaphore:
            if cancel_event and cancel_event.is_set():
                return {"success": False, "cancelled": True, "session_path": path}
            return await change_2fa_for_session(path, cur_pass, new_password)

    results = await asyncio.gather(*[process(s) for s in sessions])
    return list(results)
