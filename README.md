# LinkedIn Voice Bot

A Telegram bot that learns your LinkedIn writing voice from your past posts, then
turns raw, messy ideas you send it into on-voice LinkedIn drafts for your review.
Nothing is ever auto-published — every draft comes back to Telegram for you to
copy, edit, and post yourself.

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

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

```
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
GEMINI_API_KEY=...
```

Run in development (auto-restarts on file changes):

```bash
npm run dev
```

Run in production:

```bash
npm run build
npm start
```

The bot only responds to the chat ID in `TELEGRAM_CHAT_ID`; every other chat is
silently ignored. Data (posts, voice profiles, ideas, drafts, analysis history)
is stored in a local SQLite file at `./data/bot.db` (configurable via
`DATABASE_PATH`).

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
- `src/db/` - SQLite schema and repositories (users, posts, voice profiles,
  ideas, analyses, drafts, conversation state).
- `src/bot/` - Telegraf wiring, commands, message routing, formatting, and
  error/access-control middleware. This is the only layer that knows about
  Telegram.
- `src/container.ts` - single place that wires repositories, the AI provider,
  and domain services together.

## Testing

```bash
npm test
```

Tests cover Telegram message routing (idea capture, duplicates, unknown
commands, posts-collection flow), voice profile extraction and storage, idea
evaluation and drafting (including the research and forced-draft paths), AI
response validation/repair, and the SQLite repositories - all against a fake
AI provider and an in-memory database, so no network or credentials are
needed to run them.
