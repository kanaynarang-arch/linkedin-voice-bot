import type { BotContext } from "./context.js";
import { splitForTelegram } from "./telegramUtils.js";

/** Sends a possibly-long message as multiple Telegram messages if needed. */
export async function replyLong(ctx: BotContext, text: string): Promise<void> {
  for (const chunk of splitForTelegram(text)) {
    await ctx.reply(chunk);
  }
}
