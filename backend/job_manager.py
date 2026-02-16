"""
In-memory job lifecycle management for background operations.
Jobs are created, executed in the background, and progress/result is stored for polling and WebSocket.
"""

import asyncio
import logging
import time
import uuid
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


class JobManager:
    def __init__(self):
        self._jobs: Dict[str, Dict[str, Any]] = {}
        self._lock = asyncio.Lock()
        self.max_concurrent_jobs = 5
        self._running_count = 0
        self._queue: List[tuple] = []  # (job_id, coro)

    def create_job(self, job_type: str, total: int, meta: Optional[Dict[str, Any]] = None) -> str:
        job_id = str(uuid.uuid4())
        self._jobs[job_id] = {
            "id": job_id,
            "type": job_type,
            "status": "pending",
            "total": total,
            "completed": 0,
            "results": {},
            "error": None,
            "created_at": time.time(),
            "cancelled": False,
            "meta": meta or {},
        }
        logger.info("[JOB] created job_id=%s type=%s total=%s", job_id, job_type, total)
        return job_id

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        return self._jobs.get(job_id)

    def get_job_status(self, job_id: str) -> Optional[Dict[str, Any]]:
        job = self._jobs.get(job_id)
        if not job:
            return None
        return {
            "id": job["id"],
            "type": job["type"],
            "status": job["status"],
            "total": job["total"],
            "completed": job["completed"],
            "results": job["results"],
            "error": job["error"],
            "created_at": job["created_at"],
            "meta": job.get("meta", {}),
        }

    async def update_progress(self, job_id: str, completed: int, index: Optional[int] = None, result: Any = None):
        async with self._lock:
            job = self._jobs.get(job_id)
            if not job or job["status"] not in ("pending", "running"):
                return
            job["completed"] = completed
            if index is not None and result is not None:
                job["results"][index] = result
            job["status"] = "running"

    async def complete_job(self, job_id: str, results: Dict[int, Any]):
        async with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            if job.get("cancelled"):
                job["status"] = "cancelled"
            else:
                job["status"] = "completed"
                job["results"] = dict(results)
                job["completed"] = len(results)
            logger.info("[JOB] completed job_id=%s status=%s", job_id, job["status"])

    async def fail_job(self, job_id: str, error: str):
        async with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            job["status"] = "failed"
            job["error"] = error
            logger.warning("[JOB] failed job_id=%s error=%s", job_id, error)

    def cancel_job(self, job_id: str) -> bool:
        job = self._jobs.get(job_id)
        if not job:
            return False
        if job["status"] not in ("pending", "running"):
            return False
        job["cancelled"] = True
        logger.info("[JOB] cancel requested job_id=%s", job_id)
        return True

    def is_cancelled(self, job_id: str) -> bool:
        job = self._jobs.get(job_id)
        return bool(job and job.get("cancelled"))

    async def execute_job(self, job_id: str, coro: Callable):
        async def _run():
            job = self._jobs.get(job_id)
            if not job:
                async with self._lock:
                    self._running_count -= 1
                    self._maybe_start_queued()
                return
            async with self._lock:
                if job.get("cancelled"):
                    job["status"] = "cancelled"
                    self._running_count -= 1
                    self._maybe_start_queued()
                    return
                job["status"] = "running"
            try:
                await coro()
            except asyncio.CancelledError:
                await self.fail_job(job_id, "Job cancelled")
            except Exception as e:
                logger.exception("[JOB] job_id=%s exception", job_id)
                await self.fail_job(job_id, str(e))
            finally:
                async with self._lock:
                    self._running_count -= 1
                    self._maybe_start_queued()

        async with self._lock:
            if self._running_count >= self.max_concurrent_jobs:
                self._queue.append((job_id, coro))
                return
            self._running_count += 1
        asyncio.create_task(_run())

    def _maybe_start_queued(self):
        while self._queue and self._running_count < self.max_concurrent_jobs:
            next_job_id, next_coro = self._queue.pop(0)
            self._running_count += 1
            asyncio.create_task(self._run_queued_job(next_job_id, next_coro))

    async def _run_queued_job(self, job_id: str, coro: Callable):
        job = self._jobs.get(job_id)
        if not job:
            async with self._lock:
                self._running_count -= 1
                self._maybe_start_queued()
            return
        async with self._lock:
            if job.get("cancelled"):
                job["status"] = "cancelled"
                self._running_count -= 1
                self._maybe_start_queued()
                return
            job["status"] = "running"
        try:
            await coro()
        except asyncio.CancelledError:
            await self.fail_job(job_id, "Job cancelled")
        except Exception as e:
            logger.exception("[JOB] job_id=%s exception", job_id)
            await self.fail_job(job_id, str(e))
        finally:
            async with self._lock:
                self._running_count -= 1
                self._maybe_start_queued()

    def get_all_jobs(self, limit: int = 50) -> List[Dict[str, Any]]:
        items = sorted(self._jobs.values(), key=lambda j: j["created_at"], reverse=True)
        return [self.get_job_status(j["id"]) for j in items[:limit] if self.get_job_status(j["id"])]


job_manager = JobManager()
