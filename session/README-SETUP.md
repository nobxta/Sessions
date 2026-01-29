# Setup Instructions for Session Manager

## 1. Backend Setup

1. In the `backend` folder, create `.env` from `.env.example` (optional: set `SERVER_PORT`, `CAPTURED_SESSIONS_DIR`).
2. Install dependencies and run:
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

3. Data (captured sessions) is stored locally on the backend (no Supabase).

## 2. Frontend Setup

1. Create `.env.local` in the `session` folder with your backend URL:
```env
NEXT_PUBLIC_API_BASE_URL=https://api.sessionn.in
```

2. Install and run:
```bash
cd session
npm install
npm run dev
```

## 3. Usage

- Frontend: sessionn.in (or your domain)
- Backend: api.sessionn.in (or your API domain)
- Go to `/settings` to view or override the backend URL (saved in browser)
- Valid ACTIVE sessions are captured and stored on the backend in local storage
