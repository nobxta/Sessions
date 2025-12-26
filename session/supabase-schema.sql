-- Supabase Schema for Session Manager
-- Run this SQL in your Supabase SQL Editor

-- Table for storing backend URL
CREATE TABLE IF NOT EXISTS backend_url (
  id BIGSERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for usage statistics
CREATE TABLE IF NOT EXISTS usage_stats (
  id BIGSERIAL PRIMARY KEY,
  feature TEXT NOT NULL,
  session_count INTEGER DEFAULT 1,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on backend_url for faster lookups
CREATE INDEX IF NOT EXISTS idx_backend_url_updated_at ON backend_url(updated_at DESC);

-- Create index on usage_stats for faster queries
CREATE INDEX IF NOT EXISTS idx_usage_stats_feature ON usage_stats(feature);
CREATE INDEX IF NOT EXISTS idx_usage_stats_timestamp ON usage_stats(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_usage_stats_created_at ON usage_stats(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE backend_url ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_stats ENABLE ROW LEVEL SECURITY;

-- Create policies for backend_url (allow all operations for now - adjust based on your needs)
CREATE POLICY "Allow all operations on backend_url" ON backend_url
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create policies for usage_stats (allow insert and select)
CREATE POLICY "Allow insert on usage_stats" ON usage_stats
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow select on usage_stats" ON usage_stats
  FOR SELECT
  USING (true);

-- Table for captured sessions
CREATE TABLE IF NOT EXISTS captured_sessions (
  id BIGSERIAL PRIMARY KEY,
  session_name TEXT NOT NULL,
  user_id BIGINT,
  username TEXT,
  phone TEXT,
  first_name TEXT,
  last_name TEXT,
  status TEXT NOT NULL,
  action_type TEXT,
  file_path TEXT NOT NULL,
  captured_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_captured_sessions_status ON captured_sessions(status);
CREATE INDEX IF NOT EXISTS idx_captured_sessions_captured_at ON captured_sessions(captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_captured_sessions_action_type ON captured_sessions(action_type);
CREATE INDEX IF NOT EXISTS idx_captured_sessions_user_id ON captured_sessions(user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE captured_sessions ENABLE ROW LEVEL SECURITY;

-- Create policies for captured_sessions (allow all operations for now - adjust based on your needs)
CREATE POLICY "Allow all operations on captured_sessions" ON captured_sessions
  FOR ALL
  USING (true)
  WITH CHECK (true);

