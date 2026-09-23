import type { BotContext } from "../context.js";
import { replyLong } from "../reply.js";
import { formatVoiceProfileSummary } from "../formatting.js";

export async function handleAnalyze(ctx: BotContext): Promise<void> {
  await ctx.reply("Analyzing your posts and building your Voice Profile - this can take a moment...");
  const record = await ctx.container.voiceProfileService.analyze(ctx.appUserId);
  await replyLong(
    ctx,
    `Voice Profile updated.\n\n${formatVoiceProfileSummary(record.profile, record.postCount, record.createdAt)}`,
  );
}
