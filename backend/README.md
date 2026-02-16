# Backend API

FastAPI backend server with Uvicorn.

## Setup

1. Create virtual environment:
```bash
python -m venv venv
```

2. Activate virtual environment:
- Windows: `venv\Scripts\activate`
- Linux/Mac: `source venv/bin/activate`

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. **Environment variables**  
   Copy `.env.example` to `.env` and set `SERVER_PORT` to the port you run the app on (e.g. the port Pterodactyl assigned). `.env` is gitignored.

## Run

Development (local):
```bash
uvicorn main:app --reload --port 8000
```

Production (e.g. on Pterodactyl – use the port your panel assigned):
```bash
uvicorn main:app --host 0.0.0.0 --port $SERVER_PORT
```

API docs: http://localhost:8000/docs

### SpamBot Appeal (Utilities)

| Option         | Frontend path      | Backend API / WebSocket           |
|----------------|--------------------|-----------------------------------|
| SpamBot Appeal | `/spambot-appeal`  | `POST /api/check-spambot-appeal`, `WS /ws/spambot-appeal` |

Point **api.sessionn.in** at your backend (A record or CNAME to your server IP). Use your host SSL/reverse proxy (e.g. Nginx, Caddy) or Pterodactyl public URL if it exposes HTTPS.

### WebSocket (404 on /ws/validate)

If you get **WebSocket connection failed** or **404** on `/ws/validate`, the reverse proxy in front of the backend is not forwarding WebSocket upgrades. Add this and restart the proxy.

**Nginx** (in the server block for api.sessionn.in):

```nginx
location /ws/ {
    proxy_pass http://127.0.0.1:3003;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_cache_bypass $http_upgrade;
}
```

**Caddy**: use `reverse_proxy` for `/ws/*` to your backend port with `header_up Connection` and `header_up Upgrade`.
