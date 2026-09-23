import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
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

function commandArgs(ctx: BotContext): string {
  const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";
  const spaceIndex = text.indexOf(" ");
  return spaceIndex === -1 ? "" : text.slice(spaceIndex + 1);
}

export function createBot(token: string, container: Container, allowedChatId: string): Telegraf<BotContext> {
  const bot = new Telegraf<BotContext>(token);

  bot.use(errorBoundary());
  bot.use(accessControl(container, allowedChatId));

  bot.command("start", handleStart);
  bot.command("help", handleHelp);

  bot.command("addposts", startCollectingPosts);
  bot.command("done", finishCollectingPosts);
  bot.command("cancel", cancelCollectingPosts);

  bot.command("posts", handlePosts);
  bot.command("clearposts", (ctx) => handleClearPosts(ctx, commandArgs(ctx)));

  bot.command("analyze", handleAnalyze);
  bot.command("profile", handleProfile);

  bot.command("ideas", handleIdeas);
  bot.command("write", (ctx) => handleWrite(ctx, commandArgs(ctx)));
  bot.command("rewrite", (ctx) => handleRewrite(ctx, commandArgs(ctx)));

  bot.on(message("text"), (ctx) => handleTextMessage(ctx, ctx.message.text));
  bot.on(message(), handleNonTextMessage);

  bot.catch((err, ctx) => {
    log.error("Telegraf top-level error handler triggered", err);
    ctx.reply("Something went wrong. Please try again.").catch(() => undefined);
  });

  return bot;
}
