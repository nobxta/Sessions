# Investigation Report: Intermittent API Failure (“Failed to fetch” with Backend 200 OK)

**Classification:** Root-cause analysis only — no code changes or fixes proposed.

**Context:**
- **Backend:** FastAPI on Uvicorn, bound to `0.0.0.0:3003`
- **Frontend:** Sends requests successfully; sometimes receives response, sometimes long wait then "Failed to fetch"
- **Backend logs:** Requests received and completed, e.g. `POST /api/check-spambot HTTP/1.0 200 OK`, `POST /api/extract-sessions HTTP/1.0 200 OK`
- **Observed:** Intermittent — same endpoints work sometimes and fail other times

---

## 1. All Possible Root Causes (Intermittent “Failed to fetch” Despite 200 OK)

| # | Cause | Category |
|---|--------|----------|
| 1 | Reverse proxy (e.g. Nginx) read/send timeout closing client connection before full response is delivered | Hosting / deployment |
| 2 | Load balancer or CDN timeout / idle timeout | Hosting / deployment |
| 3 | Proxy or LB closing connection after response headers sent but before body fully received by client | Network / Hosting |
| 4 | TCP connection reset (network instability, NAT/firewall idle timeout, mobile networks) | Network |
| 5 | Client or intermediate proxy aborting due to no application-level timeout (browser/platform limits) | Frontend |
| 6 | CORS preflight or response blocked for a subset of origins or request patterns | Frontend |
| 7 | Single Uvicorn worker / event loop blocked or saturated so response is sent late and client/proxy already timed out | Backend runtime |
| 8 | Backend response time variance (Telegram API latency, FloodWait, many sessions) causing some requests to exceed proxy/client timeout | Backend runtime / Network |
| 9 | Large response body or slow serialization so time-to-first-byte or full response exceeds timeout | Backend runtime / Network |
| 10 | Stale or wrong `API_BASE_URL` on first load causing requests to wrong host (connection refused / CORS) reported as “Failed to fetch” | Frontend |
| 11 | Container or process limits (memory, CPU throttling) causing occasional long pauses before response is sent | Hosting / Backend runtime |
| 12 | DNS or TLS revalidation delay on first request or after long idle | Network |

---

## 2. Categorized Analysis

### 2.1 Network layer issues

| Cause | How it produces the observed behavior | Server-side evidence / metrics to confirm |
|-------|--------------------------------------|-------------------------------------------|
| **Reverse proxy read/send timeout** | Proxy (e.g. Nginx default 60s) waits for backend response. If backend takes >60s, proxy closes connection to **client**. Backend may still complete and Uvicorn logs 200 when it finishes writing; client never receives full response and sees “Failed to fetch”. | Proxy access/error logs: 502/504 or “upstream timed out” when backend is slow; correlation of failure with request duration > proxy timeout (e.g. 60s). |
| **TCP reset / connection drop** | Network or middlebox (NAT, firewall, mobile carrier) closes the connection after a period of no data or after response starts. Client reports network error; server may have already sent or be sending response. | Backend: log if write to socket fails (broken pipe, connection reset). Network: packet captures showing RST; correlation with high latency or mobile/unstable networks. |
| **CDN / LB idle timeout** | If traffic goes through a CDN or LB with an idle timeout (e.g. 30–60s), long backend processing with no bytes sent can cause the LB to close the connection to the client. Backend can still complete and log 200. | LB/CDN logs: connection closed due to idle/timeout; metrics for request duration vs timeout threshold. |
| **DNS / TLS delay** | First request or post-idle request can hit DNS or TLS handshake delay. Combined with slow backend, total time can exceed proxy/client tolerance; later requests use cached DNS/TLS and succeed. | Client-side timing (DNS, TLS, TTFB); server-side: no direct evidence unless connection never established. |

### 2.2 Backend runtime issues

| Cause | How it produces the observed behavior | Server-side evidence / metrics to confirm |
|-------|--------------------------------------|-------------------------------------------|
| **Event loop blocking or saturation** | Single Uvicorn process, single event loop. Long-running or blocking work (Telethon I/O, CPU-heavy serialization) can delay other requests or delay sending the response. Response is sent after proxy/client has already timed out → 200 in logs, “Failed to fetch” on client. | Request duration histogram (P50, P95, P99); correlation of failures with high concurrency or with specific slow endpoints (e.g. check-spambot, validate). |
| **Variable response time (Telegram, FloodWait)** | Endpoints like `/api/check-spambot`, `/api/check-tgdna`, `/api/validate-sessions` call Telegram; no per-request timeout. Under load or FloodWait, one request can take 60–120+ seconds. When over proxy timeout → client fails, server logs 200. | Per-request duration logging; correlation of long durations with failures; logs from Telethon (e.g. FloodWait) if enabled. |
| **Worker exhaustion** | If multiple workers were used and all were busy, new requests could queue; by the time a worker responds, client/proxy may have closed the connection. (Current setup appears single-worker; still relevant if deployment uses workers.) | Queue depth; worker utilization; request wait time before handling. |
| **Large or slow response** | Large JSON (e.g. many sessions) or slow serialization delays time-to-first-byte and full response. Proxy or client may timeout during body transfer. | Response size and serialization time; TTFB and time-to-last-byte vs timeout values. |

### 2.3 Hosting / deployment issues

| Cause | How it produces the observed behavior | Server-side evidence / metrics to confirm |
|-------|--------------------------------------|-------------------------------------------|
| **Reverse proxy timeout (Nginx/Caddy)** | Proxy sits in front of Uvicorn (e.g. `proxy_pass http://127.0.0.1:3003`). Default `proxy_read_timeout` (Nginx 60s) applies. Backend responds after 60s → proxy closes to client, returns 502/504 or broken connection; Uvicorn may still log 200. | Proxy error/access logs: “upstream timed out” or 502/504; backend request duration > 60s for failed cases. |
| **Proxy not buffering / streaming** | Proxy might close downstream connection when upstream is slow to produce body; backend then completes and logs 200. | Same as above; proxy docs and config (buffering, timeouts). |
| **Container limits (CPU/memory)** | Throttling or OOM near the limit can cause occasional long pauses. Response is sent late; client/proxy times out. | Container/pod metrics: CPU throttling, memory usage, OOM events; correlation with spike in request duration and failures. |
| **Pterodactyl / panel timeouts** | If backend runs behind a game/app panel with its own timeouts, same “backend 200, client failed” pattern. | Panel logs and timeout settings; request duration vs panel timeout. |

### 2.4 Frontend-side causes

| Cause | How it produces the observed behavior | Server-side evidence / metrics to confirm |
|-------|--------------------------------------|-------------------------------------------|
| **No fetch timeout** | Most API calls use `fetch()` with no `AbortSignal`. Browser waits until connection closes. If proxy closes after 60s, user sees long wait then “Failed to fetch”. Intermittent when backend sometimes finishes before 60s. | Backend cannot distinguish; client-side: request duration at time of failure (~60s or proxy timeout). |
| **Aborted / navigated away** | User navigates or refreshes; browser aborts the request. Server may still complete and log 200. | Backend: optional logging of “client disconnected” if framework exposes it; otherwise no server evidence. |
| **CORS** | Response blocked by CORS (e.g. origin not in allowlist, credentials mismatch) is often reported as “Failed to fetch”. Can be intermittent if origin varies (www vs non-www, different domains). | Browser console CORS errors; server logs: OPTIONS and GET/POST for same request; verify `Origin` in logs matches `allow_origins`. |
| **Stale API_BASE_URL** | `API_BASE_URL` is set at load from cache/localStorage and updated asynchronously. First request might use wrong URL (e.g. localhost) → connection refused or wrong host → “Failed to fetch”. | Backend: requests never reach server for wrong host; for correct host, no distinction. Client-side: which URL was used when failure occurred. |

---

## 3. How Each Suspected Cause Produces the Exact Observed Behavior

**Observed behavior:**  
Sometimes API works; sometimes user waits a long time and then sees “Failed to fetch”. Backend logs show the request received and 200 OK.

- **Proxy/LB timeout:** Backend finishes and returns 200; proxy has already closed the connection to the client due to read/send timeout. Client only sees connection closed → “Failed to fetch”. Explains 200 in logs and intermittent success (when response time &lt; timeout).
- **TCP reset / network drop:** Response in flight or backend finishing; connection is closed by network. Server may log 200; client sees network error. Intermittent with network conditions.
- **Event loop / slow backend:** Response is sent late; by then proxy or client has closed the connection. Server still logs 200 when the handler completes. Intermittent with load and which endpoint is called.
- **No frontend timeout:** User experience is “long wait then failure” because the only “timeout” is the proxy or network closing the connection; frontend does not abort earlier.
- **CORS:** Browser blocks the response; from frontend perspective the request “failed” (often “Failed to fetch”). Server still processes and may log 200. Intermittent if origin or path varies.
- **Wrong API_BASE_URL:** Request goes to wrong host; no 200 on the real backend for that request. Can look “intermittent” if only first request or certain tabs use wrong URL.

---

## 4. Ranked Probability of Causes (Given Current Symptoms)

| Rank | Cause | Rationale |
|------|--------|-----------|
| 1 | **Reverse proxy read/send timeout (e.g. Nginx 60s)** | Logs show `HTTP/1.0` → request was proxied. No proxy timeout configured in repo → defaults (often 60s). Endpoints like check-spambot/validate can take 30–120+ seconds. Fits “sometimes works, sometimes fails” and “200 OK in backend”. |
| 2 | **Backend response time variance (Telegram latency, many sessions)** | Same endpoints sometimes fast (few sessions, fast DC), sometimes slow (many sessions, FloodWait, slow DC). When slow, exceeds typical proxy timeout. No per-request timeout in app. |
| 3 | **Event loop saturation (single worker)** | Single Uvicorn process. Concurrent long-running requests can delay others; delayed response can arrive after proxy/client timeout. |
| 4 | **TCP / network reset** | Possible on mobile or unstable networks; connection drops after long wait; server may still complete. |
| 5 | **CORS (origin mismatch)** | Could explain “Failed to fetch” with 200 if browser hides CORS errors; less likely if only some origins are used and CORS is fixed for them. |
| 6 | **Stale API_BASE_URL** | Only affects first load or specific navigation; less likely to be the main cause of “sometimes” for repeated use. |
| 7 | **Container / resource limits** | Possible if hosting has strict limits; would show as occasional long pauses and correlation with resource metrics. |
| 8 | **CDN / LB idle timeout** | Relevant only if a CDN/LB is in front of the proxy; same mechanism as proxy timeout. |
| 9 | **Large response body** | Could contribute if responses are very large and transfer is slow; secondary to overall request duration. |
| 10 | **DNS / TLS delay** | Usually affects first request; possible but less likely as primary cause of intermittent failure. |

---

## 5. Monitoring Checklist to Confirm Root Cause

Collect the following to validate which cause is responsible. No code changes implied; this is an evidence-gathering plan.

### 5.1 Logs

- [ ] **Reverse proxy (Nginx/Caddy) access logs:**  
  For each request: timestamp, upstream response time, status code returned to client (200/502/504), and bytes sent.  
  Compare: when client reports “Failed to fetch”, does the proxy log 502/504 or “upstream timed out”, and is upstream time &gt; 60s (or your configured timeout)?

- [ ] **Reverse proxy error logs:**  
  Look for “upstream timed out”, “connection reset”, “broken pipe” around the time of user-reported failures.

- [ ] **Backend request duration:**  
  For each POST to `/api/check-spambot`, `/api/extract-sessions`, `/api/validate-sessions`, etc., log request start and end time (or use middleware) and compute duration.  
  Store or sample (e.g. P95, P99) to see if failures correlate with duration &gt; 55–60s (or &gt; proxy timeout).

- [ ] **Backend write errors:**  
  If Uvicorn/FastAPI or ASGI server logs “broken pipe” or “connection reset” when writing response, that indicates client/proxy closed the connection before body was fully sent.

- [ ] **CORS:**  
  Log `Origin` and method for each request; confirm failed requests use an origin that is in `allow_origins` and that no OPTIONS failure occurs for that origin.

### 5.2 Metrics

- [ ] **Request duration histogram per endpoint:**  
  Especially for `/api/check-spambot`, `/api/check-tgdna`, `/api/extract-sessions`, `/api/validate-sessions`.  
  Check if P95/P99 is above 60s (or your proxy timeout).

- [ ] **Concurrent in-flight requests:**  
  When failures occur, how many requests were in progress? High concurrency + long-running handlers supports event-loop saturation.

- [ ] **Upstream response time at proxy:**  
  If proxy exports “upstream response time”, plot it; failures should cluster above proxy read timeout.

- [ ] **Container/pod (if applicable):**  
  CPU throttling, memory usage, OOM. Correlate with spikes in latency and failure rate.

### 5.3 Tracing / signals

- [ ] **Trace ID from frontend to backend:**  
  Frontend sends a header (e.g. `X-Request-ID`); backend logs it. When user reports “Failed to fetch”, use that ID to find backend log line and measure duration for that exact request.

- [ ] **Client-side timing (when possible):**  
  For a few failed requests, record: time from fetch start to “Failed to fetch”. If it clusters around 60s (or 30s, 120s), it suggests a fixed timeout (proxy or browser) is closing the connection.

- [ ] **Proxy timeout configuration:**  
  Document actual `proxy_read_timeout`, `proxy_send_timeout` (and equivalent in Caddy/LB). Compare with measured backend duration to confirm “response later than timeout” for failed cases.

### 5.4 Quick validation (no new code required)

- [ ] **Reproduce with slow backend:**  
  Add artificial delay (e.g. 70s) in one test environment for an endpoint. If client consistently gets “Failed to fetch” and proxy logs timeout while backend logs 200, proxy timeout is confirmed.

- [ ] **Same request from different networks:**  
  Compare failure rate from stable (e.g. office) vs unstable (e.g. mobile). If failures are much higher on unstable network, TCP/reset or client-side timeout is more likely.

- [ ] **Origin consistency:**  
  Ensure frontend always uses the same origin (e.g. always `https://sessionn.in` or always `https://www.sessionn.in`) and that it is in backend `allow_origins`. Reduces CORS as a variable.

---

## 6. Summary

- **Most likely:** Reverse proxy (e.g. Nginx) read/send timeout (e.g. 60s) closing the client connection when the backend takes longer than that to respond. Backend completes and logs 200; client sees “Failed to fetch”.
- **Strong contributor:** Large variance in backend response time (Telegram, many sessions, no per-request timeout) so that some requests exceed the proxy timeout and others do not.
- **Supporting:** Single Uvicorn worker and no frontend timeout align with “long wait then failure” and with backend still reporting 200.

Evidence to collect: proxy access/error logs and upstream response time, backend request duration per endpoint, and correlation of failures with duration &gt; proxy timeout. This report does not recommend any code or configuration changes; it is for investigation and root-cause confirmation only.
