import type { BotContext } from "../context.js";
import { replyLong } from "../reply.js";

export async function handleStart(ctx: BotContext): Promise<void> {
  await replyLong(
    ctx,
    [
      "Hi - I turn your LinkedIn voice into on-voice drafts.",
      "",
      "1. /addposts - give me your past LinkedIn posts",
      "2. /analyze - build your Voice Profile from them",
      "3. Just send me any raw thought, note, or observation, any time. I'll evaluate it and draft a post in your voice if it's worth it.",
      "",
      "Send /help for the full command list.",
    ].join("\n"),
  );
}
