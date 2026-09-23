import { Telegraf } from "telegraf";
import { message, channelPost } from "telegraf/filters";
import type { BotContext } from "./context.js";
import type { Container } from "../container.js";
import { accessControl, errorBoundary } from "./middleware.js";
import { handleStart } from "./commands/start.js";
import { handleHelp } from "./commands/help.js";
import { handlePosts, handleClearPosts } from "./commands/posts.js";
import { handleAnalyze } from "./commands/analyze.js";
import { handleProfile } from "./commands/profile.js";
import { handleIdeas } from "./commands/ideas.js";
import { handleWrite } from "./commands/write.js";
import { handleRewrite } from "./commands/rewrite.js";
import { startCollectingPosts, finishCollectingPosts, cancelCollectingPosts } from "./postsCollection.js";
import { handleTextMessage, handleNonTextMessage } from "./handlers/messageHandler.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("telegram");

/**
 * Every command, keyed by name, taking (ctx, args). Used both for normal
 * chat/group messages (via bot.command(), Telegraf's built-in dispatcher)
 * and for channel posts (Telegraf's .command() only matches `message`
 * updates, never `channel_post`, so a broadcast-channel bot needs its own
 * dispatch - see the channelPost handler below).
 */
const COMMAND_HANDLERS: Record<string, (ctx: BotContext, args: string) => Promise<void>> = {
  start: (ctx) => handleStart(ctx),
  help: (ctx) => handleHelp(ctx),
  addposts: (ctx) => startCollectingPosts(ctx),
  done: (ctx) => finishCollectingPosts(ctx),
  cancel: (ctx) => cancelCollectingPosts(ctx),
  posts: (ctx) => handlePosts(ctx),
  clearposts: (ctx, args) => handleClearPosts(ctx, args),
  analyze: (ctx) => handleAnalyze(ctx),
  profile: (ctx) => handleProfile(ctx),
  ideas: (ctx) => handleIdeas(ctx),
  write: (ctx, args) => handleWrite(ctx, args),
  rewrite: (ctx, args) => handleRewrite(ctx, args),
};

function parseCommand(text: string): { name: string; args: string } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  const [head, ...rest] = trimmed.slice(1).split(/\s+/);
  const name = head?.split("@")[0]?.toLowerCase();
  if (!name) return null;
  return { name, args: rest.join(" ") };
}

function commandArgs(ctx: BotContext): string {
  const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";
  const spaceIndex = text.indexOf(" ");
  return spaceIndex === -1 ? "" : text.slice(spaceIndex + 1);
}

export function createBot(token: string, container: Container, allowedChatId: string): Telegraf<BotContext> {
  const bot = new Telegraf<BotContext>(token);

  bot.use(errorBoundary());
  bot.use(accessControl(container, allowedChatId));

  for (const [name, handler] of Object.entries(COMMAND_HANDLERS)) {
    bot.command(name, (ctx) => handler(ctx, commandArgs(ctx)));
  }

  bot.on(message("text"), (ctx) => handleTextMessage(ctx, ctx.message.text));
  bot.on(message(), handleNonTextMessage);

  // Broadcast channels deliver posts as `channel_post` updates, never
  // `message` - a bot that's only wired for message updates (the block
  // above) silently sees nothing when posted to a channel it's admin of.
  bot.on(channelPost("text"), (ctx) => {
    const text = ctx.channelPost.text;
    const command = parseCommand(text);
    const handler = command ? COMMAND_HANDLERS[command.name] : undefined;
    if (command && handler) {
      return handler(ctx, command.args);
    }
    return handleTextMessage(ctx, text);
  });
  bot.on(channelPost(), handleNonTextMessage);

  bot.catch((err, ctx) => {
    log.error("Telegraf top-level error handler triggered", err);
    ctx.reply("Something went wrong. Please try again.").catch(() => undefined);
  });

  return bot;
}
