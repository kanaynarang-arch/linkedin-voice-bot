import type { MiddlewareFn } from "telegraf";
import type { BotContext } from "./context.js";
import type { Container } from "../container.js";
import { toUserMessage } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";
import { splitForTelegram } from "./telegramUtils.js";

const log = createLogger("bot");

/**
 * Restricts the bot to a single owner chat (this is a personal tool, not
 * a public bot) and resolves the internal app user for every update.
 * Updates from any other chat are logged and silently dropped.
 */
export function accessControl(container: Container, allowedChatId: string): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined || String(chatId) !== allowedChatId) {
      log.warn("Dropping update from unauthorized chat", { chatId });
      return;
    }

    ctx.container = container;
    ctx.appUserId = container.users.getOrCreate(String(chatId)).id;
    return next();
  };
}

/**
 * Central error boundary: every AppError becomes a friendly Telegram
 * reply instead of the bot going silent or crashing. Unexpected errors
 * are logged in full and still get a safe generic reply - "never fail
 * silently" applies to bugs too.
 */
export function errorBoundary(): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      log.error("Unhandled error while processing update", error);
      try {
        for (const chunk of splitForTelegram(toUserMessage(error))) {
          await ctx.reply(chunk);
        }
      } catch (replyError) {
        log.error("Failed to deliver error message to Telegram", replyError);
      }
    }
  };
}
