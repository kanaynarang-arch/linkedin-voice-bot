# LinkedIn Voice Bot

A Telegram bot that learns your LinkedIn writing voice from your past posts, then
turns raw, messy ideas you send it into on-voice LinkedIn drafts for your review.
Nothing is ever auto-published — every draft comes back to Telegram for you to
copy, edit, and post yourself.

Runs two ways from the same codebase:
- **Locally**, via long-polling (`npm run dev`) - simplest for development.
- **On Vercel**, via a Telegram webhook (`api/telegram.ts`) - Vercel Functions
  only run in response to a request, so there's no long-lived polling loop in
  production; Telegram calls the function directly instead.

## How it works

```
Telegram  ->  Content ingestion  ->  Voice analysis  ->  Voice Profile (stored)
                                                              |
Raw note  ->  Gemini scoring (0.0-10.0)  ->  score < 6.0? reject + stop
                    |
                    v (score >= 6.0)
              Google News RSS (optional context)  ->  Gemini drafting  ->  Telegram (Review Gate)
```

- **Voice extraction**: send your existing LinkedIn posts with `/addposts`, then
  run `/analyze`. Gemini extracts tone, rhythm, vocabulary, hooks, structure,
  storytelling patterns, thinking style, signature/avoidance patterns, and a
  ranked "core voice fingerprint" - distinguishing traits that show up in
  nearly every post ("stable") from ones that show up sometimes ("occasional").
- **Scoring gate**: every raw note is scored by Gemini from 0.0-10.0 across
  eight LinkedIn-content dimensions (professional relevance, knowledge value,
  original perspective, dwell/read potential, conversation potential,
  timeliness, share/save utility, authenticity). Scores below
  `MIN_CONTENT_SCORE` (default 6.0) are rejected before any news lookup or
  drafting happens - a weak note never reaches those steps, and a news
  article can never be used to push a weak note past the gate. This scoring
  call never sees your Voice Profile: it judges the idea, not the writing.
- **Google News RSS**: only for notes that pass the gate. Extracts the note's
  underlying concepts, runs a small set of focused Google News searches, and
  evaluates candidates using only their RSS metadata (title/description/
  source/date) - never scraping article pages. At most one qualifying hook
  (score >= 6.0) is offered to drafting; if nothing is genuinely relevant, the
  post is drafted without news rather than forcing an unrelated angle.
- **Drafting**: Gemini turns the raw note into a post using your Voice
  Profile and, if one was found and genuinely fits, the selected news hook as
  supporting context - never as proof of your claim. The drafting call cannot
  reconsider the score; that decision is already made.
- **Review loop**: every draft is returned as plain text with `/rewrite` to
  revise with feedback, `/write` to regenerate from scratch (or force a draft
  on a note the score gate rejected), and `/approve` / `/reject` to record
  your decision. Nothing is ever published automatically - you always post it
  yourself.

## Requirements

- Node.js 20+
- A Telegram bot token (create one via [@BotFather](https://t.me/BotFather))
- Your Telegram chat ID (e.g. from [@userinfobot](https://t.me/userinfobot))
- A Gemini API key ([Google AI Studio](https://aistudio.google.com/apikey))
- A Postgres database (Supabase, via Vercel's Marketplace, is the intended one -
  see [Deploying to Vercel](#deploying-to-vercel) - but any Postgres works,
  including a local one for development)

## Local setup

```bash
npm install
cp .env.example .env
```

Fill in `.env` (at minimum):

```
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
GEMINI_API_KEY=...
DATABASE_URL=...   # any Postgres connection string
```

Apply the schema once, then run:

```bash
npm run migrate
npm run dev
```

`npm run dev` runs in local long-polling mode and auto-restarts on file
changes. The bot only responds to the chat ID in `TELEGRAM_CHAT_ID`; every
other chat is silently ignored.

## Deploying to Vercel

1. **Push this repo to GitHub** (if you haven't already) and import it at
   [vercel.com/new](https://vercel.com/new). No build configuration is
   needed - `api/telegram.ts` is picked up automatically as a Vercel Function.
2. **Add a Postgres database**: in the project's Storage tab, add the
   **Supabase** integration from the Marketplace. This provisions a database
   and injects several connection strings (`POSTGRES_URL`,
   `POSTGRES_URL_NON_POOLING`, etc.) but not `DATABASE_URL` itself - copy the
   value of `POSTGRES_URL_NON_POOLING` into a `DATABASE_URL` environment
   variable (Settings -> Environment Variables). The direct, non-pooled
   connection is used deliberately: Supabase's pooled connection runs through
   PgBouncer in transaction mode, which doesn't support the prepared
   statements `pg` uses for parameterized queries.
3. **Set the remaining environment variables**: `TELEGRAM_BOT_TOKEN`,
   `TELEGRAM_CHAT_ID`, `GEMINI_API_KEY`, and a `TELEGRAM_WEBHOOK_SECRET` (any
   random string, e.g. `openssl rand -hex 24`) to verify that webhook calls
   really come from Telegram. Redeploy after adding them.
4. **Apply the schema** against the new database: pull the env vars locally
   (`vercel env pull .env.local` if you have the CLI, or copy `DATABASE_URL`
   from the dashboard into your `.env`) and run `npm run migrate`.
5. **Register the webhook** so Telegram knows to call your deployment: set
   `PUBLIC_URL` in your environment to your deployed URL (e.g.
   `https://your-app.vercel.app`) and run `npm run set-webhook`. This is a
   one-time step - re-run it only if the deployment URL changes.

Your bot is now live on Vercel. The same repo's `npm run dev` still works
locally in polling mode for development against the same (or a separate)
Postgres database.

## Commands

| Command | What it does |
|---|---|
| `/start` | Welcome and quick overview |
| `/help` | Full command list |
| `/addposts` | Start adding your existing LinkedIn posts (one per message, or separated by a `---` line) |
| `/done` | Finish adding posts |
| `/cancel` | Stop adding posts (anything already added stays saved) |
| `/posts` | See how many posts you've stored, with a preview |
| `/clearposts confirm` | Delete all stored posts |
| `/analyze` | Build (or rebuild) your Voice Profile from stored posts |
| `/profile` | View your current Voice Profile |
| `/ideas` | List recently captured ideas and their status |
| `/write [id]` | Draft a post for an idea (defaults to your most recent; pass an id to force a draft on one the score gate rejected) |
| `/rewrite [id] <feedback>` | Revise a draft with feedback (defaults to your most recent idea) |
| `/approve [id]` | Record that you approve a draft (defaults to your most recent draft). Never publishes anything. |
| `/reject [id]` | Record that you reject a draft (defaults to your most recent draft). It stays saved. |

Anything else you send is treated as a raw content idea: scored, optionally
given a news hook, and drafted if it passes the gate.

## Architecture

- `src/ai/` - provider-agnostic AI interface (`AIProvider`) plus the Gemini
  implementation. Gemini is the only model provider - it performs both the
  scoring call and the drafting call. Swapping models/providers later means
  writing one new class in this folder; nothing else changes.
- `src/news/` - Google News RSS retrieval: URL building, XML parsing, and a
  `GoogleNewsClient` interface (with a recency-query-with-fallback
  implementation) that the domain layer depends on instead of the network
  directly, so tests never make live requests.
- `src/domain/` - core logic: voice profile extraction, the LinkedIn content
  score, the Google News hook-relevance evaluator, the idea pipeline (score ->
  gate -> news -> draft), and the shared domain types.
- `src/db/` - Postgres schema and repositories (users, posts, voice profiles,
  ideas, idea_scores, drafts, conversation state), behind a small `Database`
  interface so the app doesn't care whether it's talking to Supabase or a
  local Postgres. Each draft stores its own status (`pending`/`approved`/
  `rejected`) and, if one was offered, the single news hook it was given.
- `src/bot/` - Telegraf wiring, commands, message routing, formatting, and
  error/access-control middleware. This is the only layer that knows about
  Telegram.
- `src/container.ts` - single place that wires repositories, the AI provider,
  the Google News client, and domain services together.
- `src/index.ts` - local entrypoint (long-polling), for development.
- `api/telegram.ts` - Vercel Function entrypoint (webhook), for production.
- `scripts/migrate.ts` - applies the schema to `DATABASE_URL` (idempotent -
  safe to re-run, including as an upgrade from the pre-audit schema).
- `scripts/setWebhook.ts` - registers the Vercel deployment URL with Telegram.

## Testing

```bash
npm test
```

Tests cover Telegram message routing (idea capture, duplicates, unknown
commands, posts-collection flow, approve/reject), voice profile extraction
and storage, the scoring gate (boundary values, malformed/out-of-range AI
output, voice-profile independence), Google News RSS (URL building, XML
parsing, recency fallback, staleness detection) and the hook-relevance
evaluator, the idea pipeline end to end (score -> gate -> news -> draft,
retrieval-failure handling, forced/rewrite paths), AI response
validation/repair, Telegram output formatting (including the NEWS SOURCE
verify block), and the Postgres repositories - all against a fake AI
provider, a fake Google News client, and an in-memory Postgres database
(pg-mem), so no network or credentials are needed to run them.
