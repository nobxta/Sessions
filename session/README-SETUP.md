# Setup Instructions for Session Manager

## 1. Supabase Setup

1. Create a Supabase project at https://supabase.com
2. Go to SQL Editor and run the SQL from `supabase-schema.sql`
3. Get your project URL and anon key from Settings > API
4. Add them to your `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

## 2. Backend Setup

1. Install required Python packages:
```bash
pip install requests
```

2. The Telegram bot is already configured in `backend/telegram_notifier.py`
   - Bot Token: `7725313939:AAHWnACKbDXJStCniRiACxVFvBnAgRpmO3k`
   - User ID: `5495140274`

3. The backend will automatically send notifications when:
   - Session downloads are generated
   - New session files are created

## 3. Frontend Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env.local` with your Supabase credentials

3. Run the development server:
```bash
npm run dev
```

## 4. Usage

- Go to `/settings` to configure your backend URL
- The backend URL is stored in Supabase and persists across sessions
- Usage statistics are automatically tracked for all features
- View stats on the Settings page

