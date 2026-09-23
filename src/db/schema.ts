export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  telegram_chat_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS linkedin_posts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_linkedin_posts_user ON linkedin_posts(user_id);

CREATE TABLE IF NOT EXISTS voice_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_json TEXT NOT NULL,
  post_count INTEGER NOT NULL,
  model TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_voice_profiles_user ON voice_profiles(user_id);

CREATE TABLE IF NOT EXISTS ideas (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'captured',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ideas_user ON ideas(user_id);

CREATE TABLE IF NOT EXISTS analyses (
  id SERIAL PRIMARY KEY,
  idea_id INTEGER NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  idea_summary TEXT NOT NULL,
  worth_developing BOOLEAN NOT NULL,
  reasoning TEXT NOT NULL,
  angle TEXT,
  research_json TEXT,
  model TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analyses_idea ON analyses(idea_id);

CREATE TABLE IF NOT EXISTS drafts (
  id SERIAL PRIMARY KEY,
  idea_id INTEGER NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  analysis_id INTEGER NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  feedback TEXT,
  model TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_drafts_idea ON drafts(idea_id);
-- Backstop against the version-number race: two concurrent draft writes
-- for the same idea (e.g. a duplicate Telegram webhook delivery) can
-- both compute the same "next version" before either commits. This
-- turns that into a clear constraint-violation error instead of two
-- silently-ambiguous rows sharing a version number.
CREATE UNIQUE INDEX IF NOT EXISTS idx_drafts_idea_version ON drafts(idea_id, version);

CREATE TABLE IF NOT EXISTS conversation_states (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  data_json TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Same backstop for voice profiles: guarantees at most one active
-- profile per user at the database level, regardless of how the
-- application races two concurrent /analyze calls.
CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_profiles_one_active ON voice_profiles(user_id) WHERE is_active;

-- Telegram idempotency: a webhook call that runs long enough (a slow AI
-- pipeline under cold start) can outlast Telegram's delivery timeout,
-- triggering a retry of the *same* update while the first attempt is
-- still in flight. Recording update_id lets the access-control
-- middleware skip an update it has already started processing.
CREATE TABLE IF NOT EXISTS processed_updates (
  update_id BIGINT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;
