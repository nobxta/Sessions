# Session Manager - Next.js Frontend

This is a Next.js application that replicates the functionality of the React + Vite frontend.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env.local` file (or copy from `.env.example`):
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

- `/app` - Next.js App Router pages and layout
- `/components` - Reusable React components
- `/lib` - Utility functions and configuration
- `/app/globals.css` - Global styles and Tailwind imports

## Routes

All routes are file-based in the `/app` directory:
- `/` - Dashboard
- `/validate-sessions` - Validate Sessions
- `/change-name` - Change Name
- `/change-username` - Change Username
- `/change-bio` - Change Bio
- `/change-profile-picture` - Change Profile Picture
- `/privacy-settings` - Privacy Settings
- `/join-chatlists` - Join Chat Lists
- `/leave-all-groups` - Leave All Groups
- `/session-converter` - Session Converter
- `/code-extractor` - Code Extractor
- `/tgdna-checker` - TG DNA Checker
- `/spambot-checker` - SpamBot Checker
- `/session-maker` - Session Maker
- `/session-metadata` - Session Metadata Viewer

## Key Differences from React Router Version

- Uses Next.js App Router instead of React Router
- File-based routing instead of route configuration
- `useRouter()` from `next/navigation` instead of `useNavigate()`
- `process.env.NEXT_PUBLIC_*` instead of `import.meta.env.VITE_*`
- All client components marked with `'use client'` directive
- TypeScript support included

