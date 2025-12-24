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

## Run

Development server with auto-reload:
```bash
uvicorn main:app --reload --port 8000
```

Production server:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

API docs available at: http://localhost:8000/docs

