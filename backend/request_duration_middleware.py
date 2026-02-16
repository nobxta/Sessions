"""
Lightweight ASGI middleware for diagnostic logging:
- Request method, path, status code, and total processing duration.
- Client disconnect detection when response is not fully sent.

Uses Python logging; does not modify request/response or business logic.

Example log output:
  [REQ] POST /api/check-spambot status=200 duration=72.34s
  [REQ] POST /api/extract-sessions status=200 duration=0.12s
  [DISCONNECT] Client disconnected before response completed for /api/check-spambot
"""

import logging
import time

logger = logging.getLogger(__name__)


class RequestDurationMiddleware:
    """
    ASGI middleware that logs [REQ] for every HTTP request (method, path, status, duration)
    and [DISCONNECT] when the client disconnects before the response is fully sent.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "?")
        path = scope.get("path", "?")
        start = time.perf_counter()
        status_code = 500
        response_completed = False

        async def send_wrapper(message):
            nonlocal status_code, response_completed
            if message.get("type") == "http.response.start":
                status_code = message.get("status", 500)
            try:
                await send(message)
            except Exception:
                logger.warning(
                    "[DISCONNECT] Client disconnected before response completed for %s",
                    path,
                    exc_info=False,
                )
                raise
            if message.get("type") == "http.response.body" and not message.get("more_body", True):
                response_completed = True
                duration = time.perf_counter() - start
                logger.info(
                    "[REQ] %s %s status=%s duration=%.2fs",
                    method,
                    path,
                    status_code,
                    duration,
                )

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            duration = time.perf_counter() - start
            if not response_completed:
                logger.info(
                    "[REQ] %s %s status=%s duration=%.2fs",
                    method,
                    path,
                    status_code,
                    duration,
                )
            raise


def request_duration_logger(app):
    """Wrap an ASGI app with RequestDurationMiddleware. Reusable for FastAPI/Starlette."""
    return RequestDurationMiddleware(app)
