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

-- Superseded by idea_scores (the Gemini scoring call) + the news_*/status
-- columns on drafts below - the old worth_developing/angle gate and its
-- Gemini-search-grounding "research" step aren't part of the required
-- Meera workflow (score -> Google News RSS -> draft), so this table is
-- retired. CASCADE drops the now-dangling drafts.analysis_id FK
-- constraint (not the drafts table or its rows).
DROP TABLE IF EXISTS analyses CASCADE;

CREATE TABLE IF NOT EXISTS idea_scores (
  id SERIAL PRIMARY KEY,
  idea_id INTEGER NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  linkedin_score NUMERIC(3,1) NOT NULL,
  professional_relevance NUMERIC(3,1) NOT NULL,
  knowledge_value NUMERIC(3,1) NOT NULL,
  original_perspective NUMERIC(3,1) NOT NULL,
  dwell_read_potential NUMERIC(3,1) NOT NULL,
  conversation_potential NUMERIC(3,1) NOT NULL,
  timeliness NUMERIC(3,1) NOT NULL,
  share_save_utility NUMERIC(3,1) NOT NULL,
  authenticity_anti_slop NUMERIC(3,1) NOT NULL,
  reasoning TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_idea_scores_idea ON idea_scores(idea_id);

-- status: the Review Gate decision (section 36-37 of the Meera workflow) -
-- 'pending' until Meera explicitly sends /approve or /reject. Approving
-- only records her decision; it never publishes anything.
-- news_*/used_news_hook: the single selected Google News RSS hook (if
-- any) offered to the drafting call, and whether the draft actually used
-- it - kept as flat nullable columns (not a JSON blob) matching this
-- project's convention for fixed-shape structured data, and because a
-- draft carries at most one hook (section 27: zero or one, never a dump).
CREATE TABLE IF NOT EXISTS drafts (
  id SERIAL PRIMARY KEY,
  idea_id INTEGER NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  feedback TEXT,
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  news_title TEXT,
  news_source TEXT,
  news_google_url TEXT,
  news_published_at TIMESTAMPTZ,
  news_hook_strength NUMERIC(3,1),
  news_connection_type TEXT,
  news_relevance_reason TEXT,
  news_hook_connection TEXT,
  used_news_hook BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Idempotent upgrade path for a database that already has the old
-- pre-audit shape (analysis_id FK, no status/news columns).
ALTER TABLE drafts DROP COLUMN IF EXISTS analysis_id;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS news_title TEXT;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS news_source TEXT;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS news_google_url TEXT;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS news_published_at TIMESTAMPTZ;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS news_hook_strength NUMERIC(3,1);
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS news_connection_type TEXT;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS news_relevance_reason TEXT;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS news_hook_connection TEXT;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS used_news_hook BOOLEAN NOT NULL DEFAULT FALSE;

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
