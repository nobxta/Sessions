"""
Bounded concurrency for session-processing tasks.
Limits simultaneous Telethon clients to avoid resource exhaustion.
"""
MAX_CONCURRENT_SESSIONS = 50
