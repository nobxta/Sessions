# Investigation: API "Failed to fetch" — Instrumentation & Log Patterns

**Purpose:** Determine why endpoints such as `/api/check-spambot-appeal` show "Failed to fetch" on the frontend while the backend logs show the process started but the request does not complete.

**Scope:** Investigation only. No business logic or endpoint contracts were changed. Instrumentation added: middleware (client disconnect + memory), per-endpoint REQ_START/REQ_END and `response_sent` logging.

---

## 1. Instrumentation Added

### 1.1 ASGI Middleware (`request_duration_middleware.py`)

- **Request completion:** `[REQ] METHOD path status=CODE duration=X.XXs`
- **Per-request memory:** `[MEMORY] path=... start=X.X end=Y.Y` (RSS in MB; uses `psutil` if available, else `resource.getrusage` on Linux/macOS; "N/A" if unavailable)
- **Client disconnect:** When the client closes the connection before the response body is fully sent, the middleware logs:
  - `[CLIENT_DISCONNECTED] path=<endpoint> duration=<seconds>`
  - Then `[MEMORY] path=... start=... end=...` for that request

RSS is sampled at request start and at response completion (or at disconnect). No business logic or response content is modified.

### 1.2 Heavy POST Endpoints (in `main.py`)

For each of:

- `/api/check-spambot`
- `/api/check-spambot-appeal`
- `/api/change-names`
- `/api/change-bios`
- `/api/change-usernames`
- `/api/validate-sessions`

**Start of handler:**

- `[REQ_START] path=<path> ts=<unix_time>`

**End of handler (in a `finally` block):**

- `[REQ_END] path=<path> duration=<seconds> response_sent=<True|False>`

`response_sent` is set to `True` only immediately before a successful `return` of the response. If the handler raises (e.g. HTTPException or unhandled exception) or never returns (e.g. client disconnect, process kill), `response_sent` remains `False`.

---

## 2. Log Patterns: What They Indicate

### 2.1 Requests exceeding ~60s (common proxy timeout)

- **What to look for:** `[REQ]` or `[REQ_END]` with `duration` ≥ 60s (e.g. 60.xx, 61.xx).
- **Interpretation:** The request took longer than many proxy/load-balancer timeouts (often 60s). The client or proxy may have closed the connection and shown "Failed to fetch" even if the backend later finishes and logs completion.
- **Cross-check:** If you see `[CLIENT_DISCONNECTED] path=... duration=~60` for the same path around the same time, that strongly suggests a **proxy or client timeout**: client/proxy closed the connection at ~60s; backend may still log `[REQ_END]` later with `response_sent=False` (or no `[REQ_END]` if the disconnect happens before handler exit).

### 2.2 Memory spikes during execution

- **What to look for:** `[MEMORY] path=... start=X.X end=Y.Y` with a large increase (e.g. `end` >> `start`).
- **Interpretation:** The request caused significant RSS growth. If this correlates with "Failed to fetch" and/or restarts, consider OOM or GC pauses. Compare with `[REQ_END]` / `[CLIENT_DISCONNECTED]` timestamps and duration to see if long duration coincides with high memory.

### 2.3 Client disconnected before backend completed

- **What to look for:**  
  - `[CLIENT_DISCONNECTED] path=<endpoint> duration=<seconds>`  
  - For the same request (same path, nearby timestamp): `[REQ_END] path=... duration=... response_sent=False` or no `[REQ_END]` at all (handler still running when client disconnected).
- **Interpretation:** The client (or proxy) closed the connection before the response was fully sent. User sees "Failed to fetch" while the server may continue processing. This is the classic **proxy timeout** pattern when `duration` in `[CLIENT_DISCONNECTED]` is near 60s.

### 2.4 Server process restarts after heavy endpoints

- **What to look for:**  
  - A `[REQ_START] path=...` (or `[REQ]` start) for a heavy endpoint.  
  - No matching `[REQ_END]` and no `[CLIENT_DISCONNECTED]` for that path at that time.  
  - Shortly after, a new process (e.g. new startup logs, new request handling).
- **Interpretation:** The process likely crashed or was killed (e.g. OOM, watchdog). The client would see "Failed to fetch" and no response.  
- **Optional:** If you have process lifecycle logs (e.g. supervisor, Docker, systemd), correlate with these gaps to confirm restarts.

---

## 3. Distinguishing proxy timeout vs process crash

| Observation | Proxy timeout (e.g. 60s) | Process crash / kill |
|------------|---------------------------|------------------------|
| `[CLIENT_DISCONNECTED]` | Often present, `duration` ~60s | Often absent |
| `[REQ_END]` | May appear later with `response_sent=False` | Often missing for that request |
| `[REQ] ... duration=` | May be >60s if backend finishes after client left | No completion log for that request |
| `[REQ_START]` without `[REQ_END]` | Can occur if disconnect triggers before `finally` runs; often with `[CLIENT_DISCONNECTED]` | Same; but no `[CLIENT_DISCONNECTED]` suggests crash/kill |
| `[MEMORY]` | May show growth if request was long-running | Large spike before process disappears suggests OOM |

**Summary:**

- **Proxy timeout:** Look for `[CLIENT_DISCONNECTED] path=... duration=~60` and/or `[REQ_END] response_sent=False` with duration ≥ 60. Frontend fails at ~60s; backend may still log completion.
- **Process crash:** Look for `[REQ_START]` with no `[REQ_END]` and no `[CLIENT_DISCONNECTED]`, and (if available) process restart or OOM in system/host logs.

---

## 4. How to Use This in Practice

1. Reproduce "Failed to fetch" (e.g. run a heavy `/api/check-spambot-appeal` or similar).
2. In backend logs, find the corresponding path and timestamp:
   - `[REQ_START] path=/api/check-spambot-appeal ts=...`
   - Then look for, in order:
     - `[CLIENT_DISCONNECTED] path=/api/check-spambot-appeal duration=...`
     - `[REQ_END] path=/api/check-spambot-appeal duration=... response_sent=...`
     - `[REQ] POST /api/check-spambot-appeal status=... duration=...`
     - `[MEMORY] path=/api/check-spambot-appeal start=... end=...`
3. Apply the table above to classify:
   - Duration ≥ 60s → consider increasing proxy/load-balancer timeout or optimizing the endpoint.
   - `[CLIENT_DISCONNECTED]` at ~60s → client/proxy timeout; backend may still be running.
   - No `[REQ_END]` and no `[CLIENT_DISCONNECTED]` → possible crash/kill; check host/process logs and memory.

This report and the added instrumentation are for investigation only; they do not change API behavior or business logic.
