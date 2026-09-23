import { Telegraf } from "telegraf";
import { message, channelPost } from "telegraf/filters";
import type { BotContext } from "./context.js";
import type { Container } from "../container.js";
import { accessControl, errorBoundary, idempotency } from "./middleware.js";
import { COMMAND_HANDLERS } from "./commandRegistry.js";
import { parseCommandName, parseCommandArgs } from "./telegramUtils.js";
import { handleTextMessage, handleNonTextMessage } from "./handlers/messageHandler.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("telegram");

function commandArgs(ctx: BotContext): string {
  const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";
  return parseCommandArgs(text);
}

export function createBot(token: string, container: Container, allowedChatId: string): Telegraf<BotContext> {
  const bot = new Telegraf<BotContext>(token);

  bot.use(errorBoundary());
  bot.use(idempotency(container));
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
    const name = parseCommandName(text);
    const handler = name ? COMMAND_HANDLERS[name] : undefined;
    if (name && handler) {
      return handler(ctx, parseCommandArgs(text));
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
