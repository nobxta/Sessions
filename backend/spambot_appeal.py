"""
SpamBot Appeal: check status, verify temp-limited accounts, and submit appeals for hard-limited accounts.
Uses same session path pattern as other backend modules (path to .session file on server).
"""

from telethon import TelegramClient, events, errors
from telethon.tl.types import KeyboardButtonUrl
import asyncio
import re
import random
import logging
from typing import Dict, Any, List, Optional, Tuple

from spambot_checker import (
    check_session_health_spambot,
    classify_spambot_response,
    SessionHealthStatus,
)
from get_user_info import get_user_info

logger = logging.getLogger(__name__)

API_ID = "25170767"
API_HASH = "d512fd74809a4ca3cd59078eef73afcd"
SPAMBOT_USERNAMES = ["spambot", "SpamBot", "Spambot"]

# Status names for appeal UI (FREE = no limits, same as ACTIVE)
STATUS_FREE = "FREE"
STATUS_TEMP_LIMITED = "TEMP_LIMITED"
STATUS_HARD_LIMITED = "HARD_LIMITED"
STATUS_FROZEN = "FROZEN"
STATUS_ERROR = "ERROR"

APPEAL_TEXTS = [
    "I believe this is a mistake. I only message people I know personally and have never sent unsolicited messages.",
    "I think my account was limited by mistake. I have never sent spam or violated Telegram's Terms of Service.",
    "This limitation was applied in error. I use Telegram only for personal communication with contacts.",
    "I respectfully request a review. My account has been used only for legitimate personal messaging.",
    "I believe there has been a misunderstanding. I have not engaged in any spam or abusive behavior.",
]


def _normalize_status(spambot_status: str) -> str:
    """Map spambot_checker status to appeal UI status."""
    if spambot_status == SessionHealthStatus.ACTIVE:
        return STATUS_FREE
    if spambot_status == SessionHealthStatus.TEMP_LIMITED:
        return STATUS_TEMP_LIMITED
    if spambot_status == SessionHealthStatus.HARD_LIMITED:
        return STATUS_HARD_LIMITED
    if spambot_status == SessionHealthStatus.FROZEN:
        return STATUS_FROZEN
    return STATUS_ERROR


async def check_spambot_status(session_path: str) -> Tuple[str, str]:
    """
    Check account status with @SpamBot. Returns (status, response_text).
    status: "FREE", "TEMP_LIMITED", "HARD_LIMITED", "FROZEN", "ERROR"
    """
    if session_path.endswith(".session"):
        session_path = session_path[:-8]
    status, details = await check_session_health_spambot(session_path)
    normalized = _normalize_status(status)
    response_text = details if isinstance(details, str) else (details or "")
    return (normalized, response_text or "")


async def get_phone_for_session(session_path: str) -> str:
    """Get phone number for display; returns empty string on failure."""
    try:
        info = await get_user_info(session_path)
        if info.get("success") and info.get("phone"):
            return str(info["phone"]) or ""
    except Exception:
        pass
    return ""


async def _get_spambot_response(
    client: TelegramClient,
    bot_entity: Any,
    timeout: float = 12.0,
) -> Optional[str]:
    """Wait for one message from SpamBot. Returns message text or None."""
    bot_message = None
    message_received = asyncio.Event()

    @client.on(events.NewMessage(from_users=bot_entity.id))
    async def handler(event):
        nonlocal bot_message
        msg_text = (event.message.message or "").strip()
        if msg_text:
            bot_message = msg_text
            message_received.set()

    try:
        await asyncio.wait_for(message_received.wait(), timeout=timeout)
    except asyncio.TimeoutError:
        pass
    if not bot_message:
        try:
            async for msg in client.iter_messages(bot_entity, limit=3):
                if msg.from_id and getattr(msg.from_id, "user_id", None) == bot_entity.id:
                    bot_message = (msg.message or "").strip()
                    if bot_message:
                        break
        except Exception:
            pass
    return bot_message


async def _get_last_bot_message(client: TelegramClient, bot_entity: Any):
    """Get the most recent message from the bot (for link/button extraction)."""
    try:
        async for msg in client.iter_messages(bot_entity, limit=1):
            if msg.from_id and getattr(msg.from_id, "user_id", None) == bot_entity.id:
                return msg
    except Exception:
        pass
    return None


def _extract_verification_link(message_text: str, message_buttons: Any = None) -> Optional[str]:
    """Extract verification/CAPTCHA URL from message text or buttons."""
    if message_text:
        urls = re.findall(r"https?://[^\s\)\]\>]+", message_text)
        for u in urls:
            if "t.me" in u or "telegram" in u.lower() or "verify" in u.lower() or "captcha" in u.lower():
                return u
        if urls:
            return urls[0]
    if message_buttons:
        for row in message_buttons:
            for btn in row:
                if isinstance(btn, KeyboardButtonUrl) and btn.url:
                    return btn.url
    return None


async def verify_temp_limited(
    session_path: str,
    websocket: Any = None,
) -> List[Dict[str, Any]]:
    """
    For temp-limited accounts: send /start 3 times with delays and return each response.
    """
    if session_path.endswith(".session"):
        session_path = session_path[:-8]
    client = TelegramClient(session_path, API_ID, API_HASH)
    results = []
    try:
        await client.start()
        if not await client.is_user_authorized():
            await client.disconnect()
            return [{"status": STATUS_ERROR, "response": "Session not authorized"}]
        bot_entity = None
        for uname in SPAMBOT_USERNAMES:
            try:
                bot_entity = await client.get_entity(uname)
                break
            except Exception:
                continue
        if not bot_entity:
            await client.disconnect()
            return [{"status": STATUS_ERROR, "response": "Could not find @SpamBot"}]
        for i in range(3):
            try:
                await client.send_message(bot_entity, "/start")
                if websocket:
                    try:
                        await websocket.send_json({
                            "type": "progress",
                            "step": "verify_attempt",
                            "attempt": i + 1,
                            "message": f"Verification attempt {i + 1}/3",
                        })
                    except Exception:
                        pass
                await asyncio.sleep(2.0)
                text = await _get_spambot_response(client, bot_entity, timeout=10.0)
                status, _ = classify_spambot_response(text or "")
                normalized = _normalize_status(status)
                results.append({"status": normalized, "response": text or ""})
            except Exception as e:
                results.append({"status": STATUS_ERROR, "response": str(e)})
        await client.disconnect()
    except Exception as e:
        try:
            await client.disconnect()
        except Exception:
            pass
        results = [{"status": STATUS_ERROR, "response": str(e)}]
    return results


async def submit_appeal(
    session_path: str,
    websocket: Any,
) -> Dict[str, Any]:
    """
    Full appeal flow for hard-limited account:
    1. Send "This is a mistake" 2. Send "Yes" 3. Send "No! Never did that!"
    4. Extract verification link, send to frontend, wait for confirm
    5. Send "Done" 6. Send random appeal text 7. Return final response
    """
    if session_path.endswith(".session"):
        session_path = session_path[:-8]
    client = TelegramClient(session_path, API_ID, API_HASH)
    try:
        await client.start()
        if not await client.is_user_authorized():
            await client.disconnect()
            return {"success": False, "error": "Session not authorized", "final_response": None}
        bot_entity = None
        for uname in SPAMBOT_USERNAMES:
            try:
                bot_entity = await client.get_entity(uname)
                break
            except Exception:
                continue
        if not bot_entity:
            await client.disconnect()
            return {"success": False, "error": "Could not find @SpamBot", "final_response": None}

        async def send_progress(step: str, message: str):
            try:
                await websocket.send_json({"type": "progress", "step": step, "message": message})
            except Exception:
                pass

        await client.send_message(bot_entity, "/start")
        await asyncio.sleep(1.5)
        await send_progress("mistake", "Sent: 'This is a mistake'")
        await client.send_message(bot_entity, "This is a mistake")
        await asyncio.sleep(2.0)
        await send_progress("yes", "Sent: 'Yes'")
        await client.send_message(bot_entity, "Yes")
        await asyncio.sleep(2.0)
        await send_progress("never", "Sent: 'No! Never did that!'")
        await client.send_message(bot_entity, "No! Never did that!")
        await asyncio.sleep(2.0)
        last_msg = await _get_last_bot_message(client, bot_entity)
        reply_after_never = last_msg.message if last_msg else None
        button_rows = []
        if last_msg and getattr(last_msg, "reply_markup", None) and hasattr(last_msg.reply_markup, "rows"):
            for row in last_msg.reply_markup.rows:
                button_rows.append(getattr(row, "buttons", []) or [])
        verification_link = _extract_verification_link(reply_after_never or "", button_rows)
        if verification_link:
            await websocket.send_json({
                "type": "verification_required",
                "link": verification_link,
                "message": "Please complete verification in the link and click Confirm when done.",
            })
            while True:
                try:
                    msg = await asyncio.wait_for(websocket.receive_json(), timeout=300.0)
                    if msg.get("action") == "confirm_verification":
                        break
                except asyncio.TimeoutError:
                    await client.disconnect()
                    return {"success": False, "error": "Verification confirmation timeout", "final_response": None}
        await send_progress("done", "Sent: 'Done'")
        await client.send_message(bot_entity, "Done")
        await asyncio.sleep(1.5)
        appeal_text = random.choice(APPEAL_TEXTS)
        await send_progress("appeal_text", f"Sending appeal: {appeal_text[:50]}...")
        await client.send_message(bot_entity, appeal_text)
        await asyncio.sleep(3.0)
        final_response = await _get_spambot_response(client, bot_entity, timeout=15.0)
        await client.disconnect()
        return {"success": True, "final_response": final_response, "appeal_sent": appeal_text}
    except Exception as e:
        try:
            await client.disconnect()
        except Exception:
            pass
        logger.exception("submit_appeal failed")
        return {"success": False, "error": str(e), "final_response": None}


async def check_sessions_appeal_parallel(
    sessions: List[Dict[str, Any]],
    websocket: Any = None,
) -> Dict[int, Dict[str, Any]]:
    """
    Check all sessions; for each TEMP_LIMITED run verify_temp_limited and attach results.
    Returns dict index -> { session_name, path, phone, status, response, verify_results? }
    """

    async def task(session_info: Dict[str, Any], index: int) -> Tuple[int, Dict[str, Any]]:
        path = session_info.get("path") or ""
        name = session_info.get("name") or f"Session {index + 1}"
        if not path:
            return index, {
                "session_name": name,
                "path": path,
                "phone": "",
                "status": STATUS_ERROR,
                "response": "No session path",
                "index": index,
            }
        try:
            status, response_text = await check_spambot_status(path)
            phone = await get_phone_for_session(path)
            out = {
                "session_name": name,
                "path": path,
                "phone": phone,
                "status": status,
                "response": response_text,
                "index": index,
            }
            if status == STATUS_TEMP_LIMITED:
                if websocket:
                    try:
                        await websocket.send_json({
                            "type": "progress",
                            "index": index,
                            "message": f"Verifying temp-limited: {name}",
                        })
                    except Exception:
                        pass
                verify_results = await verify_temp_limited(path, websocket)
                out["verify_results"] = verify_results
            return index, out
        except Exception as e:
            return index, {
                "session_name": name,
                "path": path,
                "phone": "",
                "status": STATUS_ERROR,
                "response": str(e),
                "index": index,
            }

    tasks = [task(s, i) for i, s in enumerate(sessions)]
    results_list = await asyncio.gather(*tasks, return_exceptions=True)
    results = {}
    for item in results_list:
        if isinstance(item, Exception):
            idx = results_list.index(item)
            results[idx] = {
                "session_name": sessions[idx].get("name", f"Session {idx + 1}"),
                "path": sessions[idx].get("path", ""),
                "phone": "",
                "status": STATUS_ERROR,
                "response": str(item),
                "index": idx,
            }
        else:
            idx, data = item
            results[idx] = data
    return results
