"""
Lightweight ASGI middleware for diagnostic logging:
- Request method, path, status code, and total processing duration.
- Client disconnect detection when response is not fully sent.
- Per-request memory (RSS) at start and end.
- [CLIENT_DISCONNECTED] when client closes connection before response completes.

Uses Python logging; does not modify request/response or business logic.

Example log output:
  [REQ] POST /api/check-spambot status=200 duration=72.34s
  [MEMORY] path=/api/check-spambot start=125.3 end=312.1
  [CLIENT_DISCONNECTED] path=/api/check-spambot duration=62.45
"""

import logging
import time

logger = logging.getLogger(__name__)


def _rss_mb():
    """Return process RSS memory in MB, or None if unavailable."""
    try:
        import psutil
        return psutil.Process().memory_info().rss / (1024 * 1024)
    except Exception:
        pass
    try:
        import resource
        usage = resource.getrusage(resource.RUSAGE_SELF)
        rss = getattr(usage, "ru_maxrss", None)
        if rss is None:
            return None
        # Linux: ru_maxrss is KB; macOS: bytes
        import sys
        if sys.platform == "darwin":
            return rss / (1024 * 1024)
        return rss / 1024
    except Exception:
        pass
    return None


class RequestDurationMiddleware:
    """
    ASGI middleware that logs:
    - [REQ] method, path, status, duration when response completes
    - [MEMORY] path, start=MB, end=MB (RSS at request start and end)
    - [CLIENT_DISCONNECTED] path, duration when client disconnects before response is fully sent.
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
        start_ts = time.time()
        status_code = 500
        response_completed = False
        mem_start = _rss_mb()

        async def send_wrapper(message):
            nonlocal status_code, response_completed
            if message.get("type") == "http.response.start":
                status_code = message.get("status", 500)
            try:
                await send(message)
            except Exception:
                duration = time.perf_counter() - start
                mem_end = _rss_mb()
                logger.warning(
                    "[CLIENT_DISCONNECTED] path=%s duration=%.2fs",
                    path,
                    duration,
                    exc_info=False,
                )
                if mem_start is not None or mem_end is not None:
                    logger.info(
                        "[MEMORY] path=%s start=%s end=%s",
                        path,
                        "%.1f" % mem_start if mem_start is not None else "N/A",
                        "%.1f" % mem_end if mem_end is not None else "N/A",
                    )
                raise
            if message.get("type") == "http.response.body" and not message.get("more_body", True):
                response_completed = True
                duration = time.perf_counter() - start
                mem_end = _rss_mb()
                logger.info(
                    "[REQ] %s %s status=%s duration=%.2fs",
                    method,
                    path,
                    status_code,
                    duration,
                )
                if mem_start is not None or mem_end is not None:
                    logger.info(
                        "[MEMORY] path=%s start=%s end=%s",
                        path,
                        "%.1f" % mem_start if mem_start is not None else "N/A",
                        "%.1f" % mem_end if mem_end is not None else "N/A",
                    )

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            duration = time.perf_counter() - start
            if not response_completed:
                mem_end = _rss_mb()
                logger.info(
                    "[REQ] %s %s status=%s duration=%.2fs",
                    method,
                    path,
                    status_code,
                    duration,
                )
                if mem_start is not None or mem_end is not None:
                    logger.info(
                        "[MEMORY] path=%s start=%s end=%s",
                        path,
                        "%.1f" % mem_start if mem_start is not None else "N/A",
                        "%.1f" % mem_end if mem_end is not None else "N/A",
                    )
            raise


def request_duration_logger(app):
    """Wrap an ASGI app with RequestDurationMiddleware. Reusable for FastAPI/Starlette."""
    return RequestDurationMiddleware(app)
