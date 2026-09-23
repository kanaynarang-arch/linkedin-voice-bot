import type { BotContext } from "../context.js";
import { replyLong } from "../reply.js";
import { formatPipelineResult } from "../formatting.js";
import { ValidationError } from "../../utils/errors.js";

export async function handleWrite(ctx: BotContext, args: string): Promise<void> {
  const idArg = args.trim();
  let ideaId: number;

  if (idArg) {
    const parsed = Number(idArg);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new ValidationError("Invalid /write argument", "Usage: /write [idea id] - the id must be a number.");
    }
    ideaId = parsed;
  } else {
    const latest = await ctx.container.ideas.getLatestByUser(ctx.appUserId);
    if (!latest) {
      await ctx.reply("You don't have any captured ideas yet. Send me a thought first.");
      return;
    }
    ideaId = latest.id;
  }

  await ctx.reply("Working on a draft...");
  const result = await ctx.container.ideaPipeline.draftForExistingIdea(ctx.appUserId, ideaId);
  await replyLong(ctx, formatPipelineResult(result));
}
