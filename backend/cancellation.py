"""
Cancellation registry for in-flight session operations.

Usage (backend):
    from cancellation import register_token, cancel_token, release_token

    event = register_token(token_id)          # register a token the frontend sent
    ...
    release_token(token_id)                    # always call in finally

Usage (operation modules):
    async def process(session):
        if cancel_event and cancel_event.is_set():
            return {"success": False, "cancelled": True, ...}
        async with semaphore:
            if cancel_event and cancel_event.is_set():
                return {"success": False, "cancelled": True, ...}
            ...
"""

import asyncio
from typing import Dict, Optional

_registry: Dict[str, asyncio.Event] = {}


def register_token(token_id: str) -> asyncio.Event:
    """Register a cancel token and return its asyncio.Event."""
    ev = asyncio.Event()
    _registry[token_id] = ev
    return ev


def cancel_token(token_id: str) -> bool:
    """Set the cancel event for a token. Returns True if found."""
    if token_id in _registry:
        _registry[token_id].set()
        return True
    return False


def release_token(token_id: str) -> None:
    """Remove a token from the registry (call in finally block)."""
    _registry.pop(token_id, None)


def is_cancelled(token_id: str) -> bool:
    ev = _registry.get(token_id)
    return ev is not None and ev.is_set()
