# Investigation Report: Session Execution Sometimes Stops or Fails After Upload/Extraction

**Classification:** Root-cause analysis only — no code changes or fixes proposed.

**Context:**
- Users upload a ZIP of Telegram sessions; extraction works correctly.
- When executing operations (check spambot, change name, change bio, etc.), the backend sometimes does not complete execution or stops progressing.
- Hypothesis: invalid / logged-out / re-login or 2FA-required sessions cause Telethon to wait or throw unhandled exceptions, leading to stuck workers.

---

## 1. Execution Trace: Endpoint → Worker → Session Loop → Telethon

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  HTTP/WebSocket Layer (main.py)                                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│  POST /api/check-spambot     → check_sessions_health_parallel(sessions)            │
│  POST /api/change-names      → change_names_parallel(sessions)                    │
│  POST /api/change-bios       → change_bios_parallel(sessions)                      │
│  POST /api/change-usernames  → change_usernames_parallel(sessions)                  │
│  POST /api/get-user-info    → get_user_info_parallel(sessions)                    │
│  POST /api/check-tgdna      → check_sessions_age_parallel(sessions)              │
│  POST /api/check-spambot-appeal → check_sessions_appeal_parallel(sessions)        │
│  WS /ws/validate            → validate_sessions_parallel(session_paths, ws, ...)   │
│  WS /ws/join-chatlists       → process_chatlists_parallel(...)                    │
│  ... (scan-groups, leave-groups, change-profile-pictures, etc.)                    │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  Parallel worker layer                                                           │
│  • Builds one asyncio task per session: task(session_info, index)                 │
│  • Awaits: asyncio.gather(*tasks) or asyncio.gather(*tasks, return_exceptions=…)  │
│  • No per-task timeout; no asyncio.wait_for() around any task.                    │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  Per-session function (e.g. check_session_health_spambot, change_name_for_session)│
│  • Normalizes session path (strip .session).                                      │
│  • Creates TelegramClient(session_path, API_ID, API_HASH).                        │
│  • Either: await client.connect()  OR  await client.start()                        │
│  • Then: is_user_authorized(), get_me(), get_entity(), send_message(), etc.      │
│  • Finally: client.disconnect() (often in try/except/finally).                     │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  Telethon (TelegramClient)                                                        │
│  • connect(): TCP/TLS to Telegram DC — no timeout applied in this codebase.       │
│  • start(): connect + auth check; if session invalid, can raise or (theoretically │
│    in interactive mode) prompt — in headless server, no input → raise.            │
│  • API calls (get_me, get_entity, send_message, iter_messages): no timeout       │
│    applied in this codebase.                                                      │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Summary:** Execution flows from FastAPI endpoint → single call to a `*_parallel(sessions)` function → `asyncio.gather` over one task per session → per-session function that creates a Telethon client and calls `connect()` or `start()` then various API methods. There is no application-level timeout around any of these steps.

---

## 2. Where Execution Can Block, Wait, or Silently Stop

### 2.1 Telethon connection and auth (no timeout)

| File | Function | Call | Risk |
|------|----------|------|------|
| `validate_sessions.py` | `check_session_status` | `await client.connect()` | Blocks indefinitely if TCP/TLS or Telegram DC does not respond. |
| `change_names.py` | `change_name_for_session` | `await client.connect()` | Same. |
| `change_bios.py` | `change_bio_for_session` | `await client.connect()` | Same. |
| `change_usernames.py` | (per-session) | `await client.connect()` | Same. |
| `get_user_info.py` | `get_user_info` | `await client.connect()` | Same. |
| `change_profile_pictures.py` | `change_profile_picture_for_session` | `await client.connect()` | Same. |
| `group_scanner.py`, `group_leaver.py` | (per-session) | `await client.connect()` | Same. |
| `chatlist_scanner.py`, `chatlist_joiner.py` | (per-session) | `await client.connect()` | Same. |
| `privacy_settings_manager.py` | (per-session) | `await client.connect()` | Same. |
| `session_metadata.py` | (per-session) | `await client.connect()` | Same. |
| **spambot_checker.py** | `check_session_health_spambot` | **`await client.start()`** | Connects + auth; no timeout. For invalid session, `start()` typically raises (e.g. `SessionPasswordNeededError`, `AuthKeyUnregisteredError`) in headless use — but connection phase can still hang. |
| **spambot_appeal.py** | `verify_temp_limited`, `submit_appeal` | **`await client.start()`** | Same as above. |
| **tgdna_checker.py** | `check_session_age_tgdna` | **`await client.start()`** | Same. |

- **Exact locations:** Every `await client.connect()` and `await client.start()` in the repo is called without `asyncio.wait_for(..., timeout=...)`. So any network hang or very slow DC response blocks that coroutine (and therefore that task) until the OS or Telethon’s own defaults (if any) apply — the codebase does not enforce an upper bound.
- **Login prompts:** In a headless server there is no `input()`. Telethon’s `start()` with an unauthorized session will not block waiting for phone/code/password; it will raise (e.g. `SessionPasswordNeededError`, `AuthKeyUnregisteredError`). So “waiting for user input” is not the primary blocker; the primary risk is **connection or API call taking forever** (no timeout).

### 2.2 API calls with no timeout

After connect/start, all API usage is untimed in this codebase, e.g.:

- `get_me()`, `get_entity()`, `get_dialogs()`, `send_message()`, `iter_messages()`, `upload_file()`, `UpdateProfileRequest`, etc.

If Telegram or the network stalls on any of these, the coroutine blocks until the operation completes or fails. That can make execution appear to “stop progressing” for a long time.

### 2.3 FloodWait: intentional long wait

- **group_leaver.py** (lines 103–120): On `errors.FloodWaitError` it does `await asyncio.sleep(e.seconds)` then retries. So one session can block its task (and thus the whole batch) for the number of seconds Telegram returns (can be tens or hundreds of seconds).
- **privacy_settings_manager.py** (lines 105–107, 149–151): Similarly waits with `await asyncio.sleep(e.seconds)` on FloodWait.

So execution does not “silently stop” here, but it can **pause for a long time** (FloodWait) and look like a hang.

### 2.4 Exceptions that are swallowed or not logged

- **get_user_info.py** (lines 51–60): Broad `except Exception` returns a dict with `error: str(e)` but does not log. So repeated failures for a bad session are invisible in logs.
- **spambot_appeal.py** – **get_phone_for_session** (lines 67–75): `except Exception: pass` then returns `""`. Failure is silent.
- **spambot_appeal.py** – **_get_last_bot_message** (lines 114–118): `except Exception: pass` then returns `None`. No log.
- **spambot_checker.py** (lines 67–71): `for username in possible_usernames: try: bot_entity = await client.get_entity(username); break; except: continue` — any exception (including network/auth) is swallowed with no log.
- **tgdna_checker.py** (lines 66–71): Same pattern for `get_entity(username)` — `except: continue` with no log.

So when a session is dead or invalid, several code paths catch the error and continue (or return a fallback) **without logging**. That makes it hard to see that the failure was due to a bad session or a specific Telethon error.

### 2.5 Dead / invalid session handling

- **validate_sessions.check_session_status**: Handles `AuthKeyUnregisteredError`, `SessionPasswordNeededError`, and generic `Exception`; returns UNAUTHORIZED and disconnects. So **validation** path does skip invalid sessions and does not wait for re-login.
- **spambot_checker.check_session_health_spambot**: Handles `AuthKeyUnregisteredError`, `UserDeactivatedError`, and generic `Exception`; returns FAILED and disconnects. No explicit `SessionPasswordNeededError`; it would be caught by the generic `Exception` and return FAILED. So dead session is skipped, but **there is no timeout** before that — if `start()` or any prior step blocks, the task never reaches the exception handler.
- **change_names / change_bios / get_user_info / etc.**: Use `connect()` then `is_user_authorized()`. If the session is invalid, `is_user_authorized()` or a later call can raise; those are caught and a failure dict is returned. Again, **if `connect()` blocks forever**, the task never gets to that logic.

So: when the code path is reached, dead sessions are skipped and do not wait for re-login. The problem is **reaching** that path when `connect()` or `start()` (or a subsequent API call) blocks with no timeout.

### 2.6 Reconnect / indefinite wait

- The codebase does **not** implement retry loops that wait indefinitely for reconnect. On failure, it typically disconnects and returns a result (or raises after a single attempt).
- So “reconnect and wait indefinitely” is not the cause. The cause is **first connection or first API call** blocking with no timeout.

---

## 3. Parallel Worker Execution: Does One Stuck Session Block the Batch?

**Yes.** Every parallel flow uses a single:

```python
results_list = await asyncio.gather(*tasks)   # or with return_exceptions=True
```

- **asyncio.gather** waits for **all** tasks to finish. If one task never completes (e.g. stuck on `connect()` or `start()` or an API call with no timeout), the whole `gather` never completes. So **one stuck session blocks the entire batch** for that request.
- **return_exceptions=True** (used in spambot_checker, spambot_appeal, tgdna_checker, session_metadata, group_scanner, group_leaver, chatlist_joiner, chatlist_scanner, privacy_settings_manager) only affects **raised** exceptions: they are returned as results instead of cancelling the gather. It does **not** help when a task **blocks** (never returns and never raises). So even with `return_exceptions=True`, one blocking task still blocks the whole batch.

**Conclusion:** A single session that blocks (e.g. on connect/start or a slow DC) is enough for the entire batch to appear to “stop progressing” until that one task completes or the process is killed.

---

## 4. Logging Gaps That Hide the Real Failure

| Location | Issue |
|----------|--------|
| **get_user_info** | On any exception, returns `{ "success": False, "error": str(e) }` with no `logger` call. Failures are invisible in server logs. |
| **spambot_appeal.get_phone_for_session** | `except Exception: pass` then return `""`. No log. |
| **spambot_appeal._get_last_bot_message** | `except Exception: pass` then return `None`. No log. |
| **spambot_checker** (get_entity loop) | `except: continue` with no log. Same in **tgdna_checker**. |
| **change_names / change_bios / change_usernames** | Exceptions are turned into result dicts; no structured logging of which session failed or which Telethon error. |
| **validate_sessions.validate_with_progress** | Has try/except and sends result over WebSocket; exception is logged to a debug file but not necessarily to the main app logger. |

So when execution “stops,” there is often no log line that clearly points to “session X stuck on connect” or “session X raised AuthKeyUnregisteredError.” The real failure is easy to miss.

---

## 5. Root Cause Summary

1. **No timeout on connection or API use**  
   Every `client.connect()` and `client.start()` and all subsequent Telethon API calls run without `asyncio.wait_for(..., timeout=...)`. A single bad network path or unresponsive DC can block one task indefinitely.

2. **One blocked task blocks the whole batch**  
   All session operations run under one `asyncio.gather(*tasks)`. One task that never returns (e.g. stuck on connect/start or an API call) causes the entire request to hang until that task finishes or the process is killed.

3. **client.start() in spambot/tgdna flows**  
   Used in spambot_checker, spambot_appeal (verify_temp_limited, submit_appeal), and tgdna_checker. Same lack of timeout; for invalid sessions Telethon will raise in headless mode, but the connection phase can still block.

4. **FloodWait handled by sleeping**  
   group_leaver and privacy_settings_manager explicitly `await asyncio.sleep(e.seconds)` on FloodWait. That can make a single session (and thus the batch) pause for a long time (e.g. 60–300+ seconds), which can look like “execution stopped.”

5. **Swallowed exceptions and missing logs**  
   Several paths use `except: pass` or broad `except Exception` without logging. When a session fails (e.g. invalid auth, network error), the root cause is hard to see in logs.

6. **Dead sessions are skipped only if the code path is reached**  
   Invalid/unregistered/2FA-required sessions are handled and skipped in validation and spambot/tgdna code **when** the code runs. If the task is stuck earlier (connect/start or first API call), the “skip invalid session” logic never runs, so the batch stays stuck.

---

## 6. High-Probability Failure Points (Ranked)

| Rank | Location | Scenario |
|------|----------|----------|
| 1 | **Any `await client.connect()` / `await client.start()`** (validate_sessions, change_names, change_bios, change_usernames, get_user_info, spambot_checker, spambot_appeal, tgdna_checker, change_profile_pictures, group_*, chatlist_*, privacy_settings, session_metadata) | Network or DC unresponsive → connect/start never completes → one task blocks → entire batch hangs. |
| 2 | **asyncio.gather(*tasks) without per-task timeout** (all `*_parallel` functions) | Single blocking task prevents gather from completing → request never returns. |
| 3 | **spambot_checker / tgdna_checker / spambot_appeal** using **client.start()** | Same as (1); start() includes connection + auth. No timeout. |
| 4 | **Telethon API calls** (get_me, get_entity, send_message, iter_messages, etc.) | No timeout; slow or stuck API call blocks that session’s task and thus the batch. |
| 5 | **group_leaver / privacy_settings_manager** FloodWait handling | `await asyncio.sleep(e.seconds)` blocks the task (and batch) for e.seconds (can be large). Looks like execution “stopped” for a long time. |
| 6 | **Swallowed exceptions** (get_entity loops, get_phone_for_session, _get_last_bot_message) | Real failure (e.g. auth error, network) is not logged; debugging “why did it stop?” is harder. |
| 7 | **change_names / change_bios / get_user_info** using **gather without return_exceptions** | If any task raises an **unhandled** exception (e.g. from a code path that doesn’t catch it), the whole gather raises. Most paths do catch Exception, so this is lower probability but still a gap. |

---

## 7. Scenarios Where a Dead Session Causes Execution to Hang

1. **Session file is invalid or auth key revoked:**  
   `connect()` may succeed but a later step (e.g. first API call) triggers Telegram to close the connection or respond slowly. If there is no timeout on that API call, the task can block. Alternatively, the DC is slow to respond during connect → connect() blocks → task never completes → batch hangs.

2. **Session requires 2FA or re-login:**  
   In headless mode, `start()` should raise `SessionPasswordNeededError` (or similar) rather than block. So 2FA itself is unlikely to cause an infinite hang. But if the failure happens only after a long or hanging operation (e.g. connect or first request), the hang is still possible.

3. **Network or DC issues:**  
   TCP/TLS or Telegram server slow/unresponsive → `connect()` or any API call blocks → one task stuck → entire batch stuck.

4. **FloodWait with large seconds:**  
   One session hits FloodWait; code does `await asyncio.sleep(e.seconds)` → that task (and thus the batch) is blocked for that many seconds. User sees “no progress” for a long time.

---

## 8. Summary Table: Execution Stops / Fails

| Question | Answer |
|----------|--------|
| Can Telethon trigger login prompts that block? | In headless use, no; it raises. Connection/API can still block (no timeout). |
| Can execution wait for user input? | Not in the current code; no input() in these paths. |
| Can the event loop block? | Yes: any single task blocked in connect/start or API call blocks that task; gather then waits for it, so the request handler does not complete. |
| Are exceptions swallowed or not logged? | Yes in several places (get_user_info, get_phone_for_session, _get_last_bot_message, get_entity loops in spambot_checker/tgdna_checker). |
| Are dead sessions skipped? | Yes, when the code path is reached (validation, spambot, etc.). They are not skipped if the task is stuck earlier (e.g. on connect). |
| Is there a timeout for connect() or API calls? | No; none applied in this codebase. |
| Does one stuck session block the batch? | Yes; asyncio.gather waits for all tasks; one blocking task blocks the whole request. |

This report is analysis only; no fixes or code rewrites are proposed.
