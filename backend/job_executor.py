"""
Background execution wrapper with concurrency limits.
Runs session batches in the background, updates job progress, and broadcasts to WebSocket subscribers.
"""

import asyncio
import logging
from typing import Any, Callable, Dict, List

from concurrency_config import MAX_CONCURRENT_SESSIONS
from job_manager import job_manager
from ws_manager import ws_manager

logger = logging.getLogger(__name__)


class JobExecutor:
    def __init__(self):
        self.max_concurrent_sessions = min(10, MAX_CONCURRENT_SESSIONS)

    async def execute_session_batch(
        self,
        job_id: str,
        sessions: List[Dict[str, Any]],
        process_func: Callable,
        session_timeout: int = 60,
        **kwargs: Any,
    ) -> Dict[int, Any]:
        """
        Run process_func(session, index, **kwargs) for each session with bounded concurrency.
        Updates job progress and broadcasts to WebSocket. Returns {index: result}.
        """
        semaphore = asyncio.Semaphore(self.max_concurrent_sessions)
        results: Dict[int, Any] = {}
        total = len(sessions)

        async def run_one(session: Dict[str, Any], index: int) -> tuple:
            async with semaphore:
                if job_manager.is_cancelled(job_id):
                    return index, {"cancelled": True}
                try:
                    result = await asyncio.wait_for(
                        process_func(session, index, **kwargs),
                        timeout=session_timeout,
                    )
                    return index, result
                except asyncio.TimeoutError:
                    return index, {"error": "Session timed out", "index": index}
                except Exception as e:
                    logger.exception("[JOB_EXEC] job_id=%s index=%s error", job_id, index)
                    return index, {"error": str(e), "index": index}

        async def run_all():
            tasks = [run_one(sess, idx) for idx, sess in enumerate(sessions)]
            done = 0
            for coro in asyncio.as_completed(tasks):
                index, result = await coro
                results[index] = result
                done += 1
                await job_manager.update_progress(job_id, done, index, result)
                await ws_manager.send_to_job(
                    job_id,
                    {
                        "type": "progress",
                        "completed": done,
                        "total": total,
                        "index": index,
                        "result": result,
                    },
                )
                if job_manager.is_cancelled(job_id):
                    break
            await job_manager.complete_job(job_id, results)

        await run_all()
        return results


job_executor = JobExecutor()
