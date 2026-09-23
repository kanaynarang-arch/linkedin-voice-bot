import type { BotContext } from "../context.js";
import { replyLong } from "../reply.js";
import { formatVoiceProfileSummary } from "../formatting.js";

export async function handleProfile(ctx: BotContext): Promise<void> {
  const record = await ctx.container.voiceProfileService.getActiveOrThrow(ctx.appUserId);
  await replyLong(ctx, formatVoiceProfileSummary(record.profile, record.postCount, record.createdAt));
}
