# Backend Stability Investigation Report

**Scope:** FastAPI/Uvicorn process appearing to restart or become unavailable after heavy session operations (spambot appeal, change-name, bulk session execution).  
**Constraints:** Investigation only — no application logic or architecture changes.  
**Date:** 2025-02-16  

---

## 1. Executive Summary

The codebase has **no explicit session-count or concurrency limits** on heavy endpoints. Every “parallel” operation builds **one asyncio task per session** and runs them with `asyncio.gather(*tasks)`, so **N sessions ⇒ N concurrent Telethon clients**. Several modules use `gather` **without `return_exceptions=True`**, so a single unhandled exception in any task can propagate and fail the whole request (and in edge cases affect worker stability). There is **no use of `sys.exit()` or `os._exit()`** in the backend. The most plausible causes of restarts/unavailability are **resource exhaustion** (memory, file descriptors) from unbounded concurrency and **exception propagation** from `gather` in six modules.

---

## 2. Heavy Execution Paths

### 2.1 `/api/check-spambot` (POST)

| Item | Detail |
|------|--------|
| **Handler** | `main.py` → `check_spambot()` (lines 1112–1149) |
| **Worker** | `spambot_checker.check_sessions_health_parallel(sessions)` |
| **Concurrency** | One task per session; `asyncio.gather(*tasks, return_exceptions=True)` (line 248) |
| **Per-task work** | One `TelegramClient` per session; `client.start()`, SpamBot chat, event handler `@client.on(events.NewMessage)`, wait for reply, disconnect |
| **Memory/CPU** | **N concurrent clients** (N = `len(sessions)`). No cap on N. Each client: TCP connection(s), TLS, session state, SQLite handle for `.session` file. Event handler registered per client; not explicitly removed (client disposed on `disconnect()`). |
| **Limit** | None. Frontend can send arbitrarily large `sessions` array. |

**File:** `backend/spambot_checker.py`  
- `check_sessions_health_parallel`: lines 218–267  
- `check_session_health_spambot`: lines 20–162 (creates client line 55, event handler 104, no `remove_event_handler`)  

---

### 2.2 `/api/check-spambot-appeal` (POST)

| Item | Detail |
|------|--------|
| **Handler** | `main.py` → `check_spambot_appeal_endpoint()` (lines 1153–1173) |
| **Worker** | `spambot_appeal.check_sessions_appeal_parallel(sessions)` |
| **Concurrency** | One task per session; `asyncio.gather(*tasks, return_exceptions=True)` (line 519) |
| **Per-task work** | For each session: `check_spambot_status(path)` → 1 client; `get_phone_for_session(path)` → **second** client (`get_user_info`); if TEMP_LIMITED then `verify_temp_limited(path)` → **third** client with 3× /start. So up to **3 sequential clients per session**, but only **1 client at a time per task**. N tasks ⇒ **N concurrent clients** at peak. |
| **Memory/CPU** | N concurrent Telethon clients; no limit on N. |
| **Limit** | None. |

**File:** `backend/spambot_appeal.py`  
- `check_sessions_appeal_parallel`: lines 447–535  
- `check_spambot_status`: 59–70 (uses `check_session_health_spambot`), `get_phone_for_session`: 73–82 (`get_user_info`), `verify_temp_limited`: 279–346 (one client, 3 attempts)  

---

### 2.3 `/api/change-names` (POST)

| Item | Detail |
|------|--------|
| **Handler** | `main.py` → `change_names()` (lines 524–562) |
| **Worker** | `change_names.change_names_parallel(sessions)` |
| **Concurrency** | One task per session; **`asyncio.gather(*tasks)` WITHOUT `return_exceptions=True`** (line 173) |
| **Per-task work** | One `TelegramClient` per session; connect, update profile, disconnect. |
| **Memory/CPU** | N concurrent clients. No cap. |
| **Crash risk** | **High.** Any unhandled exception in any task propagates from `gather` and fails the request; if the exception is not caught by FastAPI (e.g. `BaseException`), it can affect the worker. |

**File:** `backend/change_names.py`  
- `change_names_parallel`: lines 148–176  
- `change_name_for_session`: lines 12–145 (broad `except Exception`; `BaseException` would still propagate)  

---

### 2.4 Bulk Session Execution Endpoints (summary)

All of these use **one task per session** and **no concurrency limit**:

| Endpoint / flow | Module | `gather(..., return_exceptions=True)`? | Concurrent clients |
|----------------|--------|----------------------------------------|---------------------|
| `POST /api/validate-sessions` (ZIP) | `validate_sessions` | N/A (ZIP path uses **sequential** `validate_zip_file`) | 1 at a time |
| `WS /ws/validate` | `validate_sessions.validate_sessions_parallel` | **No** (line 418) | N |
| `POST /api/scan-chatlists` | `chatlist_scanner.scan_chatlists_parallel` | Yes | N |
| `WS /ws/join-chatlists` | `chatlist_joiner.process_chatlists_parallel` | Yes | N (1 client per session at a time; leave then join per link) |
| `POST /api/scan-groups` | `group_scanner.scan_groups_parallel` | Yes | N |
| `WS /ws/leave-groups` | `group_leaver.leave_groups_parallel` | Yes | N |
| `POST /api/check-tgdna` | `tgdna_checker.check_sessions_age_parallel` | Yes | N |
| `POST /api/session-metadata` | `session_metadata.extract_metadata_parallel` | Yes | N |
| `POST /api/get-user-info` | `get_user_info.get_user_info_parallel` | **No** (line 107) | N |
| `POST /api/change-usernames` | `change_usernames.change_usernames_parallel` | **No** | N |
| `POST /api/change-bios` | `change_bios.change_bios_parallel` | **No** | N |
| `POST /api/change-profile-pictures` (WS) | `change_profile_pictures.change_profile_pictures_parallel` | **No** | N |
| `POST /api/privacy-settings` | `privacy_settings_manager.apply_privacy_settings_parallel` | Yes | N |

So the **same pattern** holds: N sessions ⇒ N tasks ⇒ N concurrent Telethon clients, with **no semaphore or max-concurrency** anywhere.

---

## 3. Concurrency Patterns

### 3.1 Unbounded `asyncio.gather(*tasks)`

Every parallel session operation does the following:

1. Build a list of coroutines/tasks: one per session.  
2. Run `await asyncio.gather(*tasks)` or `await asyncio.gather(*tasks, return_exceptions=True)`.

There is **no**:

- `asyncio.Semaphore` to cap concurrent clients  
- Batching (e.g. 50 sessions at a time)  
- Configurable or hard-coded max N  

So if the client sends 500 or 1000 sessions, the server creates 500 or 1000 concurrent Telethon clients.

### 3.2 Where `return_exceptions=True` is **not** used

These modules use **`asyncio.gather(*tasks)` without `return_exceptions=True`**:

| File | Function | Line |
|------|----------|------|
| `get_user_info.py` | `get_user_info_parallel` | 107 |
| `change_profile_pictures.py` | (parallel function) | 239 |
| `change_names.py` | `change_names_parallel` | 173 |
| `change_usernames.py` | (parallel function) | 176 |
| `change_bios.py` | (parallel function) | 150 |
| `validate_sessions.py` | `validate_sessions_parallel` | 418 |

In those paths, the **first exception** raised by any task is propagated from `gather`. The request then fails (500 or connection error). If the exception is a `BaseException` (e.g. `asyncio.CancelledError` when the client disconnects) or leaves the loop in a bad state, it can contribute to worker instability.

### 3.3 Worst-case simultaneous resource usage (order-of-magnitude)

Assume one heavy request with **N = 500** sessions:

- **500 concurrent Telethon clients** (e.g. on check-spambot, check-spambot-appeal, change-names, validate, etc.).  
- Each client: 1 TCP connection (or more), TLS state, session state, SQLite file handle for the `.session` file, and in spambot/tgdna paths an event handler.  
- Rough order of magnitude per client: O(hundreds of KB) to low MB (connection buffers, TLS, Python/Telethon objects).  
- **Total:** hundreds of MB to low GB RAM and **500+ file descriptors** (sockets + SQLite files).  

If the system or process has a low `ulimit` (e.g. 1024 open files), **file descriptor exhaustion** is likely with a few hundred sessions. The process may then hit `OSError` (too many open files) or be killed by the OS/OOM.

---

## 4. Crash / Restart Triggers

### 4.1 Unhandled exceptions escaping worker tasks

- **Mechanism:** In the six modules above, `gather` without `return_exceptions=True` propagates the first exception from any task. Task code usually has `except Exception`; `BaseException` (e.g. `asyncio.CancelledError`, `SystemExit`, `KeyboardInterrupt`) is not caught and will propagate.  
- **Location:** `get_user_info.py:107`, `change_names.py:173`, `change_usernames.py:176`, `change_bios.py:150`, `change_profile_pictures.py:239`, `validate_sessions.py:418`.  
- **Effect:** Request fails; in rare cases (e.g. cancellation or loop corruption) can contribute to worker appearing to “reset” or become unstable.

### 4.2 Memory spikes

- **ZIP upload in `extract_sessions`:**  
  - **File:** `main.py` lines 111–114.  
  - **Code:** `content = await file.read()` then `tmp.write(content)`.  
  - **Effect:** Entire upload is loaded into memory. A large ZIP (e.g. hundreds of MB) causes a large RAM spike on a single request.  

- **ZIP extraction:**  
  - `extract_sessions`: `zip_ref.extractall(temp_dir)` (line 119) — extracts to disk; memory impact is mostly from decompression buffer.  
  - `validate_sessions.validate_zip_file` / `extract_sessions_from_zip`: same pattern.  

- **Concurrent clients:** As above, N sessions ⇒ N clients in memory at once; no cap, so N large ⇒ high memory and possible OOM (process kill/restart if run under a process manager).

### 4.3 File descriptor exhaustion

- Each Telethon client uses at least: 1 socket (+ TLS), 1 SQLite file handle for the session DB. So **≥ 2 FDs per client**.  
- With N = 500: **≥ 1000 FDs** for one request.  
- **Location:** Any endpoint that runs `*_parallel(sessions)` with large `sessions` (check-spambot, check-spambot-appeal, change-names, validate, etc.).  
- **Effect:** When the process hits the process or system FD limit, new connections or file opens can raise `OSError` (e.g. "Too many open files"). That can surface as unhandled exception in a worker and lead to request failure or worker exit, depending on how uvicorn handles it.

### 4.4 No infinite loops or blocking calls

- No `time.sleep`, `run_in_executor`, or synchronous `run()` of the event loop in the hot paths.  
- No `sys.exit()` or `os._exit()` in the backend (grep result: no matches).

### 4.5 Event handlers in SpamBot / TGDNA

- **spambot_checker.py:** `@client.on(events.NewMessage(from_users=bot_entity.id))` (line 104); handler is **not** explicitly removed; client is disconnected after use, so the client (and handler) are disposed.  
- **tgdna_checker.py:** Same pattern (line 126).  
- **spambot_appeal.py:** `_wait_for_next_bot_message` uses `remove_event_handler` in a `finally` (line 152); others rely on client disconnect.  
- So no long-lived handler leak, but during the run there are **N live event handlers** for N concurrent clients, adding to memory and callback load.

---

## 5. Server Lifecycle and Process Management

- **Process manager / container:** No Dockerfile or docker-compose in the repo. README suggests running **uvicorn** directly (e.g. `uvicorn main:app --reload --port 8000` or `--host 0.0.0.0 --port $SERVER_PORT`). So restarts are likely from:  
  - Uvicorn’s `--reload` (file change), or  
  - **Process exit** (e.g. OOM kill, unhandled exception that terminates the worker, or FD exhaustion).  
- **Explicit exit:** No `sys.exit()` or `os._exit()` in backend code.  
- **Fatal runtime exceptions:** Possible from:  
  - OOM (memory exhaustion from large ZIP + many clients).  
  - `OSError` from too many open files.  
  - Unhandled `BaseException` (e.g. `CancelledError`) in the six `gather` paths above propagating out of the request handler.

---

## 6. Exact Locations of Potential Crashes / Restarts

| Cause | File(s) | Function / line | Notes |
|-------|--------|------------------|--------|
| Unbounded concurrent Telethon clients | All `*_parallel` functions in: `spambot_checker`, `spambot_appeal`, `change_names`, `change_usernames`, `change_bios`, `change_profile_pictures`, `get_user_info`, `validate_sessions`, `chatlist_scanner`, `chatlist_joiner`, `group_scanner`, `group_leaver`, `tgdna_checker`, `session_metadata`, `privacy_settings_manager` | Each builds `tasks = [...]` then `await asyncio.gather(*tasks)` | N = len(sessions), no cap |
| Exception propagation from `gather` | `get_user_info.py` | Line 107 | `asyncio.gather(*tasks)` no return_exceptions |
| | `change_names.py` | Line 173 | Same |
| | `change_usernames.py` | Line 176 | Same |
| | `change_bios.py` | Line 150 | Same |
| | `change_profile_pictures.py` | Line 239 | Same |
| | `validate_sessions.py` | Line 418 | Same |
| Full upload in RAM | `main.py` | Lines 111–114 in `extract_sessions` | `content = await file.read()` |
| Per-session Telethon client creation | Each module that uses `TelegramClient(...)` inside a task | e.g. `spambot_checker.py:55`, `change_names.py:27`, `spambot_appeal.py` (multiple), `get_user_info.py:24`, etc. | 1 client per task; N tasks ⇒ N clients |
| FD usage | Same as “Unbounded concurrent clients” | — | ≥ 2 FDs per client |

---

## 7. Could a Single Endpoint Execution Terminate the Worker?

**Yes**, in these scenarios:

1. **OOM:** One request with a very large ZIP (e.g. 500 MB) in `extract_sessions` plus a subsequent or concurrent request with hundreds of sessions (e.g. check-spambot-appeal or change-names) can push the process over available memory and trigger an OOM kill.  
2. **FD exhaustion:** One request with a large N (e.g. 500+ sessions) on any heavy parallel endpoint can open 1000+ FDs. If the limit is 1024, the process can hit “Too many open files” and raise; if unhandled or not caught at the right level, the worker can exit.  
3. **Unhandled exception:** In the six modules without `return_exceptions=True`, an unhandled exception (including `CancelledError` on client disconnect) can propagate. Typically that only fails the request; in edge cases (e.g. loop or task state corruption) it could contribute to worker instability or exit.

So a **single** heavy request (large body or large N) can be enough to terminate or destabilize the worker.

---

## 8. Ranked Probability of Restart Causes

| Rank | Cause | Likelihood | Rationale |
|------|--------|------------|------------|
| 1 | **Resource exhaustion (memory + FDs)** from unbounded concurrent Telethon clients on check-spambot, check-spambot-appeal, change-names, or bulk validate/scan/leave | **High** | No concurrency limit; N can be hundreds; logs show long durations (e.g. 72s for check-spambot); “Started server process” after heavy use fits OOM or FD limit kill. |
| 2 | **Memory spike from full ZIP read** in `extract_sessions` | **Medium** | Single large upload can double process memory; combined with other traffic or subsequent heavy request can push to OOM. |
| 3 | **Exception propagation** from `gather` without `return_exceptions=True` (e.g. CancelledError on client disconnect, or rare exception in change_names/validate/get_user_info) | **Medium** | Explains failed requests and intermittent “API not found” or non-response if the worker is busy or restarts; less likely to be the sole cause of full process restart unless it leads to loop/worker exit. |
| 4 | **Process manager / OS** killing the process (OOM killer, or container limit) | **Medium** | No process manager in repo; if deployed under systemd/Docker/panel, they would restart the process after exit, matching “Started server process” in logs. |
| 5 | **Explicit exit or fatal exception in application code** | **Low** | No `sys.exit`/`os._exit`; most exceptions are caught; only edge-case `BaseException` or FD/OOM from above. |

---

## 9. Summary Table: Endpoints and Risk

| Endpoint / flow | Concurrent clients | return_exceptions? | Memory spike (single request) | FD pressure |
|-----------------|--------------------|--------------------|--------------------------------|-------------|
| `POST /api/check-spambot` | N | Yes | N × client | High (N large) |
| `POST /api/check-spambot-appeal` | N | Yes | N × client | High |
| `POST /api/change-names` | N | **No** | N × client | High |
| `POST /api/extract-sessions` | 0 | — | **Full upload in RAM** | Low |
| `WS /ws/validate` | N | **No** | N × client | High |
| `POST /api/validate-sessions` (ZIP) | 1 (sequential) | — | ZIP extract | Low |
| Other bulk POST/WS above | N | Mixed | N × client | High |

---

**End of report.** No fixes applied; investigation only as requested.
