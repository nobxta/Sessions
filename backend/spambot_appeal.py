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
from concurrency_config import MAX_CONCURRENT_SESSIONS
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
    "I believe this restriction has been applied by mistake. I use Telegram only to communicate with people I personally know, including friends, family members, and professional contacts. I have never intentionally sent unsolicited advertisements or spam messages. This account is extremely important to me because it contains years of personal conversations, contacts, and important communication history. I kindly request a manual review of my account so this issue can be resolved as soon as possible.",
    "I respectfully request a review of my account, as I believe the limitation was applied incorrectly. I primarily use Telegram for normal daily communication with my family, friends, and known contacts. I have never engaged in mass messaging, spam distribution, or any activity that violates Telegram’s Terms of Service. This account holds critical personal data and conversations that are very important to me, and I would greatly appreciate your urgent assistance in restoring access.",
    "I think there has been a misunderstanding regarding my account. I run a small clothing business and use Telegram only to communicate with my existing customers who have voluntarily contacted me for orders and product updates. I do not send unsolicited promotional messages to strangers. This account is essential for my business operations, and losing access affects my ability to serve my clients. I kindly request a careful review and restoration of my account at the earliest possible time.",
    "I believe my account was mistakenly flagged. I am a medical professional and use Telegram mainly to communicate with other doctors, colleagues, and known patients for coordination and professional discussions. I do not participate in spam messaging or unsolicited promotions. This account is very important for my professional communication network, and I would sincerely appreciate a prompt manual review to correct this error.",
    "I respectfully believe that this action may have been triggered in error. I use Telegram strictly for legitimate communication purposes, including coordinating work-related discussions and staying in touch with known contacts. I have never intentionally sent bulk or unsolicited messages. This account contains valuable professional contacts and important conversation records, so I kindly request an urgent review and restoration of my account.",
    "I believe there has been an error in the restriction placed on my account. My Telegram usage is limited to communication with my personal contacts, business clients who have directly connected with me, and trusted groups that I am a member of. I have always tried to follow Telegram’s policies carefully and have never engaged in spam activity. This account is extremely important to my daily communication and business continuity, so I sincerely request your assistance in reviewing and restoring my account as soon as possible."
]

# Frozen-account appeal: random names (10), emails, years, and short messages for questionnaire
FROZEN_NAMES = [
    "James Wilson", "Emma Martinez", "Oliver Brown", "Sophia Davis", "Liam Anderson",
    "Isabella Taylor", "Noah Thomas", "Ava Jackson", "Nobii Smith", "Mia Johnson",
]
FROZEN_EMAIL_DOMAINS = ["gmail.com", "outlook.com", "yahoo.com", "icloud.com", "protonmail.com"]
FROZEN_YEARS = ["2019", "2020", "2021", "2022", "2023", "2024"]
FROZEN_SHORT_MESSAGES = [
    "a friend suggested me about telegram",
    "i like to chat with family",
    "chatting with friends and family",
    "personal and work communication",
    "keeping in touch with contacts",
]
FROZEN_DAILY_USE = ["chatting", "I like to chat with family", "Messaging friends and groups", "Personal communication"]
FROZEN_DISCOVERY = "a friend"


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
    """Extract verification/CAPTCHA URL from message text or buttons (legacy helper)."""
    return _extract_verification_link_from_message_text_and_buttons(message_text, message_buttons)


def _extract_verification_link_from_message(msg: Any) -> Optional[str]:
    """
    Extract verification link from SpamBot message using all available sources.
    Tries: (1) URL button in reply_markup, (2) URL in message entities,
    (3) regex on message text, (4) URL in button text.
    """
    if not msg:
        return None
    verification_link = None
    spambot_text = (getattr(msg, "message", None) or getattr(msg, "text", None) or "") or ""

    logger.debug("SpamBot verification message text: %s", spambot_text[:200] if spambot_text else "(empty)")
    logger.debug("Has reply_markup: %s", getattr(msg, "reply_markup", None) is not None)

    # Method 1: URL from inline/keyboard button (most common)
    reply_markup = getattr(msg, "reply_markup", None)
    if reply_markup and hasattr(reply_markup, "rows"):
        rows = getattr(reply_markup, "rows", []) or []
        if not isinstance(rows, (list, tuple)):
            rows = [rows] if rows else []
        logger.debug("Number of button rows: %s", len(rows))
        for row_idx, row in enumerate(rows):
            buttons = getattr(row, "buttons", None) or []
            if not isinstance(buttons, (list, tuple)):
                buttons = [buttons] if buttons else []
            buttons = list(buttons)
            for btn_idx, button in enumerate(buttons):
                logger.debug("Row %s Button %s type: %s has url: %s", row_idx, btn_idx, type(button).__name__, getattr(button, "url", None))
                if getattr(button, "url", None):
                    verification_link = (button.url or "").strip()
                    if verification_link:
                        logger.debug("Found URL in button: %s", verification_link[:80])
                        break
            if verification_link:
                break

    # Method 2: URL from message entities (e.g. MessageEntityTextUrl)
    if not verification_link and getattr(msg, "entities", None):
        entities = msg.entities or []
        logger.debug("Message has %s entities", len(entities))
        for entity in entities:
            if getattr(entity, "url", None):
                verification_link = (entity.url or "").strip()
                if verification_link:
                    logger.debug("Found URL in entity: %s", verification_link[:80])
                    break

    # Method 3: Regex on plain text
    if not verification_link and spambot_text:
        urls = re.findall(r"https?://[^\s\)\]\>\"\'\`]+", spambot_text)
        if urls:
            for u in urls:
                if "t.me" in u or "telegram" in u.lower() or "verify" in u.lower() or "captcha" in u.lower():
                    verification_link = u
                    break
            if not verification_link and urls:
                verification_link = urls[0]
            if verification_link:
                logger.debug("Found URL in text: %s", verification_link[:80])

    # Method 4: URL in button text (e.g. button displays URL as text)
    if not verification_link and reply_markup and hasattr(reply_markup, "rows"):
        for row in getattr(reply_markup, "rows", []) or []:
            for button in getattr(row, "buttons", []) or []:
                button_text = (getattr(button, "text", None) or "") or ""
                if "http" in button_text.lower():
                    urls = re.findall(r"https?://[^\s\)\]]+", button_text)
                    if urls:
                        verification_link = urls[0]
                        logger.debug("Found URL in button text: %s", verification_link[:80])
                        break
            if verification_link:
                break

    logger.debug("Final verification_link: %s", verification_link[:80] if verification_link else None)
    return verification_link


def _extract_verification_link_from_message_text_and_buttons(message_text: str, message_buttons: Any = None) -> Optional[str]:
    """Extract verification URL from text and pre-built button rows (for callers that already have them)."""
    if message_text:
        urls = re.findall(r"https?://[^\s\)\]\>\"\'\`]+", message_text)
        for u in urls:
            if "t.me" in u or "telegram" in u.lower() or "verify" in u.lower() or "captcha" in u.lower():
                return u
        if urls:
            return urls[0]
    if message_buttons:
        for row in message_buttons:
            for btn in row:
                url = getattr(btn, "url", None)
                if url:
                    return url
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
    logger.info("[SESSION START] %s", session_path)
    client = TelegramClient(session_path, API_ID, API_HASH)
    results = []
    try:
        logger.info("[SESSION ACTION] %s connect", session_path)
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
        logger.info("[SESSION END] %s success", session_path)
    except Exception as e:
        try:
            await client.disconnect()
        except Exception:
            pass
        logger.warning("[SESSION FAIL] %s error=%s", session_path, str(e))
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
    logger.info("[SESSION START] %s", session_path)
    client = TelegramClient(session_path, API_ID, API_HASH)
    try:
        logger.info("[SESSION ACTION] %s connect", session_path)
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
        reply_after_never = (getattr(verification_msg, "message", None) or getattr(verification_msg, "text", None) or "").strip()
        verification_link = _extract_verification_link_from_message(verification_msg)
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
        logger.info("[SESSION END] %s success", session_path)
        return {"success": True, "final_response": final_response, "appeal_sent": appeal_text}
    except Exception as e:
        try:
            await client.disconnect()
        except Exception:
            pass
        logger.warning("[SESSION FAIL] %s error=%s", session_path, str(e))
        logger.exception("submit_appeal failed")
        return {"success": False, "error": str(e), "final_response": None}


def _frozen_reply_for_message(text: str) -> Optional[str]:
    """Return the reply to send for frozen-appeal questionnaire, or None if not matched."""
    if not text:
        return None
    t = text.lower()
    if "full legal name" in t or ("legal name" in t and "enter" in t):
        return random.choice(FROZEN_NAMES)
    if "contact email" in t or ("email" in t and "enter" in t):
        name_part = random.choice(FROZEN_NAMES).split()[0].lower()
        domain = random.choice(FROZEN_EMAIL_DOMAINS)
        return f"{name_part}@{domain}"
    if "year" in t and ("sign up" in t or "signup" in t):
        return random.choice(FROZEN_YEARS)
    if "how you discovered" in t or "who invited" in t:
        return FROZEN_DISCOVERY
    if "general description" in t and ("telegram" in t or "discovered" in t):
        return FROZEN_DISCOVERY
    if "please send me a text message" in t:
        return random.choice(FROZEN_SHORT_MESSAGES)
    if "average daily use" in t or "daily use" in t or "daily use of telegram" in t:
        return random.choice(FROZEN_DAILY_USE)
    if "by submitting" in t and "acknowledge" in t:
        return "Confirm"
    if "acknowledge" in t and "agree" in t:
        return "Confirm"
    return None


async def submit_appeal_frozen(
    session_path: str,
    websocket: Any,
) -> Dict[str, Any]:
    """
    Full appeal flow for frozen (blocked) account. Same chat as hard limit:
    /start → "This is a mistake" → "Yes" → appeal details → questionnaire (name, email, year,
    discovery, text message x2, daily use) → Confirm → verify human (link) → Done → success.
    """
    if session_path.endswith(".session"):
        session_path = session_path[:-8]
    logger.info("[SESSION START] %s (frozen appeal)", session_path)
    client = TelegramClient(session_path, API_ID, API_HASH)
    try:
        logger.info("[SESSION ACTION] %s connect", session_path)
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
        # Wait for "Please write us more details about your case"
        await send_progress("wait_details", "Waiting for SpamBot to request details...")
        details_msg = await _wait_for_next_bot_message(client, bot_entity, timeout=15.0)
        if not details_msg:
            await client.disconnect()
            return {"success": False, "error": "No details request from SpamBot (timeout)", "final_response": None}
        appeal_text = random.choice(APPEAL_TEXTS)
        await send_progress("appeal_text", "Sending appeal details...")
        send_r = await run_with_timeout(client.send_message(bot_entity, appeal_text), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
        if send_r is TIMEOUT_SENTINEL:
            await client.disconnect()
            return {"success": False, "error": "Operation timed out", "final_response": None}
        await asyncio.sleep(1.5)

        # Questionnaire loop: reply to each bot message until we get verification or success
        max_steps = 25
        for _ in range(max_steps):
            msg = await _wait_for_next_bot_message(client, bot_entity, timeout=20.0)
            if not msg:
                await client.disconnect()
                return {"success": False, "error": "No response from SpamBot (timeout)", "final_response": None}
            msg_text = (getattr(msg, "message", None) or getattr(msg, "text", None) or "").strip()
            msg_lower = msg_text.lower()

            # Success message
            if "successfully submitted" in msg_lower or "thank you" in msg_lower and "appeal" in msg_lower:
                await client.disconnect()
                logger.info("[SESSION END] %s frozen appeal success", session_path)
                return {"success": True, "final_response": msg_text, "appeal_sent": appeal_text}

            # Verification: send link to UI, wait for confirm, send Done
            if _is_verification_request(msg_text):
                verification_link = _extract_verification_link_from_message(msg)
                await websocket.send_json({
                    "type": "verification_required",
                    "link": verification_link or "",
                    "message": msg_text or "Please verify you are a human. Open the link, complete the step, then click Done.",
                })
                while True:
                    try:
                        wmsg = await asyncio.wait_for(websocket.receive_json(), timeout=300.0)
                        if wmsg.get("action") == "confirm_verification":
                            break
                    except asyncio.TimeoutError:
                        await client.disconnect()
                        return {"success": False, "error": "Verification confirmation timeout", "final_response": None}
                await send_progress("done", "Sent: 'Done'")
                send_r = await run_with_timeout(client.send_message(bot_entity, "Done"), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
                if send_r is TIMEOUT_SENTINEL:
                    await client.disconnect()
                    return {"success": False, "error": "Operation timed out", "final_response": None}
                await asyncio.sleep(3.0)
                final_msg = await _wait_for_next_bot_message(client, bot_entity, timeout=15.0)
                final_text = (getattr(final_msg, "message", None) or getattr(final_msg, "text", None) or "") if final_msg else ""
                await client.disconnect()
                logger.info("[SESSION END] %s frozen appeal success", session_path)
                return {"success": True, "final_response": final_text or msg_text, "appeal_sent": appeal_text}

            reply = _frozen_reply_for_message(msg_text)
            if reply:
                await send_progress("questionnaire", f"Replying: {reply[:40]}...")
                send_r = await run_with_timeout(client.send_message(bot_entity, reply), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
                if send_r is TIMEOUT_SENTINEL:
                    await client.disconnect()
                    return {"success": False, "error": "Operation timed out", "final_response": None}
                await asyncio.sleep(1.2)
                continue

            # Unmatched: might be "Please send me a text message" with different wording
            if "text message" in msg_lower and "send" in msg_lower:
                reply = random.choice(FROZEN_SHORT_MESSAGES)
                await send_progress("questionnaire", "Sending text message...")
                send_r = await run_with_timeout(client.send_message(bot_entity, reply), API_TIMEOUT, default=TIMEOUT_SENTINEL, session_path=session_path)
                if send_r is TIMEOUT_SENTINEL:
                    await client.disconnect()
                    return {"success": False, "error": "Operation timed out", "final_response": None}
                await asyncio.sleep(1.2)

        await client.disconnect()
        return {"success": False, "error": "Questionnaire loop exceeded max steps", "final_response": None}
    except Exception as e:
        try:
            await client.disconnect()
        except Exception:
            pass
        logger.warning("[SESSION FAIL] %s frozen appeal error=%s", session_path, str(e))
        logger.exception("submit_appeal_frozen failed")
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

    semaphore = asyncio.Semaphore(MAX_CONCURRENT_SESSIONS)
    async def sem_task(session_info: Dict[str, Any], index: int) -> Tuple[int, Dict[str, Any]]:
        async with semaphore:
            return await task(session_info, index)
    tasks = [sem_task(s, i) for i, s in enumerate(sessions)]
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
