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
Raw idea  ->  Idea analysis  ->  Current-context research  ->  Draft generation  ->  Telegram (human review)
```

- **Voice extraction**: send your existing LinkedIn posts with `/addposts`, then
  run `/analyze`. Gemini extracts tone, rhythm, vocabulary, hooks, structure,
  storytelling patterns, thinking style, signature/avoidance patterns, and a
  ranked "core voice fingerprint" - distinguishing traits that show up in
  nearly every post ("stable") from ones that show up sometimes ("occasional").
- **Idea capture**: send any raw thought as a normal Telegram message. The bot
  judges honestly whether it has enough substance for a post, picks the
  strongest angle if so, optionally pulls in current news/data via Gemini's
  Google Search grounding when it would genuinely help, and drafts a post in
  your voice.
- **Review loop**: every draft is returned as plain text with `/rewrite` to
  revise with feedback or `/write` to regenerate from scratch.

## Requirements

- Node.js 20+
- A Telegram bot token (create one via [@BotFather](https://t.me/BotFather))
- Your Telegram chat ID (e.g. from [@userinfobot](https://t.me/userinfobot))
- A Gemini API key ([Google AI Studio](https://aistudio.google.com/apikey))
- A Postgres database (Neon, via Vercel's Marketplace, is the intended one -
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
2. **Add a Postgres database**: in the project's Storage tab, add the **Neon**
   integration from the Marketplace. This provisions a database and injects
   `DATABASE_URL` into your project automatically.
3. **Set the remaining environment variables** in the project's Settings ->
   Environment Variables: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`,
   `GEMINI_API_KEY`, and a `TELEGRAM_WEBHOOK_SECRET` (any random string, e.g.
   `openssl rand -hex 24`) to verify that webhook calls really come from
   Telegram. Redeploy after adding them.
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
| `/write [id]` | Draft a post for an idea (defaults to your most recent; pass an id to force a draft on one marked "not worth developing") |
| `/rewrite [id] <feedback>` | Revise a draft with feedback (defaults to your most recent idea) |

Anything else you send is treated as a raw content idea.

## Architecture

- `src/ai/` - provider-agnostic AI interface (`AIProvider`, `ResearchProvider`)
  plus the Gemini implementation. Swapping models/providers later means
  writing one new class in this folder; nothing else changes.
- `src/domain/` - core logic: voice profile extraction, the idea pipeline
  (evaluate -> research -> draft), and the Voice Profile / idea / draft types.
- `src/db/` - Postgres schema and repositories (users, posts, voice profiles,
  ideas, analyses, drafts, conversation state), behind a small `Database`
  interface so the app doesn't care whether it's talking to Neon or a local
  Postgres.
- `src/bot/` - Telegraf wiring, commands, message routing, formatting, and
  error/access-control middleware. This is the only layer that knows about
  Telegram.
- `src/container.ts` - single place that wires repositories, the AI provider,
  and domain services together.
- `src/index.ts` - local entrypoint (long-polling), for development.
- `api/telegram.ts` - Vercel Function entrypoint (webhook), for production.
- `scripts/migrate.ts` - applies the schema to `DATABASE_URL`.
- `scripts/setWebhook.ts` - registers the Vercel deployment URL with Telegram.

## Testing

```bash
npm test
```

Tests cover Telegram message routing (idea capture, duplicates, unknown
commands, posts-collection flow), voice profile extraction and storage, idea
evaluation and drafting (including the research and forced-draft paths), AI
response validation/repair, and the Postgres repositories - all against a
fake AI provider and an in-memory Postgres database (pg-mem), so no network
or credentials are needed to run them.
