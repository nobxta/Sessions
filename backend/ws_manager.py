"""
WebSocket connection manager for real-time job progress.
Maps job_id -> set of WebSocket connections; broadcast to all subscribers for a job.
"""

import asyncio
import logging
from typing import Any, Dict, Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WSManager:
    def __init__(self):
        self._job_connections: Dict[str, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, job_id: str):
        await websocket.accept()
        async with self._lock:
            if job_id not in self._job_connections:
                self._job_connections[job_id] = set()
            self._job_connections[job_id].add(websocket)
        logger.debug("[WS] connected job_id=%s", job_id)

    async def disconnect(self, websocket: WebSocket, job_id: str):
        async with self._lock:
            conns = self._job_connections.get(job_id)
            if conns:
                conns.discard(websocket)
                if not conns:
                    del self._job_connections[job_id]
        logger.debug("[WS] disconnected job_id=%s", job_id)

    async def send_to_job(self, job_id: str, data: Any):
        async with self._lock:
            conns = set(self._job_connections.get(job_id) or [])
        dead = []
        for ws in conns:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                conns = self._job_connections.get(job_id)
                if conns:
                    for ws in dead:
                        conns.discard(ws)


ws_manager = WSManager()
