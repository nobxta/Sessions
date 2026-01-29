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

Point **api.sessionn.in** at your backend (A record or CNAME to your server IP). Use your host’s SSL/reverse proxy (e.g. Nginx, Caddy) or Pterodactyl’s public URL if it exposes HTTPS.
