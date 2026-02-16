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

from async_timeout import run_with_timeout, CONNECT_TIMEOUT, API_TIMEOUT, TIMEOUT_SENTINEL
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


async def _wait_for_next_bot_message(
    client: TelegramClient,
    bot_entity: Any,
    timeout: float = 20.0,
):
    """
    Wait for the next NEW message from the bot (after this call).
    Returns the full Message object (with .message and .reply_markup) or None on timeout.
    """
    next_message = None
    received = asyncio.Event()

    @client.on(events.NewMessage(from_users=bot_entity.id))
    async def handler(event):
        nonlocal next_message
        next_message = event.message
        received.set()

    try:
        await asyncio.wait_for(received.wait(), timeout=timeout)
        return next_message
    except asyncio.TimeoutError:
        return None
    finally:
        try:
            client.remove_event_handler(handler)
        except Exception:
            pass


def _is_verification_request(message_text: str) -> bool:
    """True if SpamBot is asking for human verification (e.g. 'Please verify you are a human')."""
    if not message_text:
        return False
    t = message_text.lower()
    return "verify" in t and "human" in t


def _build_button_rows_from_message(msg: Any) -> List[List[Any]]:
    """Extract list of button rows from message reply_markup for link extraction."""
    rows = []
    if not msg or not getattr(msg, "reply_markup", None):
        return rows
    rm = msg.reply_markup
    if not hasattr(rm, "rows"):
        return rows
    for row in rm.rows:
        buttons = getattr(row, "buttons", None) or []
        rows.append(buttons if isinstance(buttons, list) else [])
    return rows


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
        r = await run_with_timeout(client.start(), CONNECT_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if r is TIMEOUT_SENTINEL:
            try:
                await client.disconnect()
            except Exception:
                pass
            return [{"status": STATUS_ERROR, "response": "Connection timed out"}]
        is_auth = await run_with_timeout(client.is_user_authorized(), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if is_auth is TIMEOUT_SENTINEL or not is_auth:
            await client.disconnect()
            return [{"status": STATUS_ERROR, "response": "Session not authorized" if is_auth is not TIMEOUT_SENTINEL else "Operation timed out"}]
        bot_entity = None
        for uname in SPAMBOT_USERNAMES:
            try:
                bot_entity = await run_with_timeout(client.get_entity(uname), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
                if bot_entity is not TIMEOUT_SENTINEL:
                    break
            except Exception:
                continue
        if not bot_entity or bot_entity is TIMEOUT_SENTINEL:
            await client.disconnect()
            return [{"status": STATUS_ERROR, "response": "Could not find @SpamBot"}]
        for i in range(3):
            try:
                send_r = await run_with_timeout(client.send_message(bot_entity, "/start"), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
                if send_r is TIMEOUT_SENTINEL:
                    results.append({"status": STATUS_ERROR, "response": "Operation timed out"})
                    continue
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
        r = await run_with_timeout(client.start(), CONNECT_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if r is TIMEOUT_SENTINEL:
            try:
                await client.disconnect()
            except Exception:
                pass
            return {"success": False, "error": "Connection timed out", "final_response": None}
        is_auth = await run_with_timeout(client.is_user_authorized(), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if is_auth is TIMEOUT_SENTINEL or not is_auth:
            await client.disconnect()
            return {"success": False, "error": "Session not authorized" if is_auth is not TIMEOUT_SENTINEL else "Operation timed out", "final_response": None}
        bot_entity = None
        for uname in SPAMBOT_USERNAMES:
            try:
                bot_entity = await run_with_timeout(client.get_entity(uname), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
                if bot_entity is not TIMEOUT_SENTINEL:
                    break
            except Exception:
                continue
        if not bot_entity or bot_entity is TIMEOUT_SENTINEL:
            await client.disconnect()
            return {"success": False, "error": "Could not find @SpamBot", "final_response": None}

        async def send_progress(step: str, message: str):
            try:
                await websocket.send_json({"type": "progress", "step": step, "message": message})
            except Exception:
                pass

        send_r = await run_with_timeout(client.send_message(bot_entity, "/start"), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if send_r is TIMEOUT_SENTINEL:
            await client.disconnect()
            return {"success": False, "error": "Operation timed out", "final_response": None}
        await asyncio.sleep(1.5)
        await send_progress("mistake", "Sent: 'This is a mistake'")
        send_r = await run_with_timeout(client.send_message(bot_entity, "This is a mistake"), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if send_r is TIMEOUT_SENTINEL:
            await client.disconnect()
            return {"success": False, "error": "Operation timed out", "final_response": None}
        await asyncio.sleep(2.0)
        await send_progress("yes", "Sent: 'Yes'")
        send_r = await run_with_timeout(client.send_message(bot_entity, "Yes"), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if send_r is TIMEOUT_SENTINEL:
            await client.disconnect()
            return {"success": False, "error": "Operation timed out", "final_response": None}
        await asyncio.sleep(2.0)
        await send_progress("never", "Sent: 'No! Never did that!'")
        send_r = await run_with_timeout(client.send_message(bot_entity, "No! Never did that!"), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if send_r is TIMEOUT_SENTINEL:
            await client.disconnect()
            return {"success": False, "error": "Operation timed out", "final_response": None}
        # Wait for SpamBot's next message: "Please verify you are a human" [with link/button]
        await send_progress("wait_verify", "Waiting for SpamBot verification message...")
        verification_msg = await _wait_for_next_bot_message(client, bot_entity, timeout=20.0)
        if not verification_msg:
            await client.disconnect()
            return {"success": False, "error": "No verification message from SpamBot (timeout)", "final_response": None}
        reply_after_never = (verification_msg.message or "").strip()
        button_rows = _build_button_rows_from_message(verification_msg)
        verification_link = _extract_verification_link(reply_after_never, button_rows)
        is_verification = _is_verification_request(reply_after_never) or bool(verification_link)
        if is_verification:
            await websocket.send_json({
                "type": "verification_required",
                "link": verification_link or "",
                "message": reply_after_never or "Please verify you are a human. Complete the step in the link below and click 'I've completed verification' when done.",
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
        send_r = await run_with_timeout(client.send_message(bot_entity, "Done"), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if send_r is TIMEOUT_SENTINEL:
            await client.disconnect()
            return {"success": False, "error": "Operation timed out", "final_response": None}
        # Wait for SpamBot: "Please write me some details about your case" before sending appeal text
        await send_progress("wait_details", "Waiting for SpamBot to request details...")
        _ = await _wait_for_next_bot_message(client, bot_entity, timeout=15.0)
        await asyncio.sleep(0.5)
        appeal_text = random.choice(APPEAL_TEXTS)
        await send_progress("appeal_text", f"Sending appeal: {appeal_text[:50]}...")
        send_r = await run_with_timeout(client.send_message(bot_entity, appeal_text), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if send_r is TIMEOUT_SENTINEL:
            await client.disconnect()
            return {"success": False, "error": "Operation timed out", "final_response": None}
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
