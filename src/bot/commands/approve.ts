import type { BotContext } from "../context.js";
import { ValidationError } from "../../utils/errors.js";

/**
 * Records Meera's Review Gate decision on a draft. Never publishes
 * anything - approving/rejecting only updates the stored status so the
 * decision is traceable; she still posts to LinkedIn herself.
 */
async function setStatus(ctx: BotContext, args: string, status: "approved" | "rejected", label: string): Promise<void> {
  const idArg = args.trim();
  let draftId: number;

  if (idArg) {
    const ideaId = Number(idArg);
    if (!Number.isInteger(ideaId) || ideaId <= 0) {
      throw new ValidationError(`Invalid /${label} argument`, `Usage: /${label} [idea id] - the id must be a number.`);
    }
    const draft = await ctx.container.drafts.getLatestForIdea(ideaId);
    if (!draft) {
      await ctx.reply(`I couldn't find a draft for idea #${ideaId}.`);
      return;
    }
    draftId = draft.id;
  } else {
    const latest = await ctx.container.ideaPipeline.getLatestDraft(ctx.appUserId);
    if (!latest) {
      await ctx.reply("You don't have any drafts yet. Send me a thought first.");
      return;
    }
    draftId = latest.id;
  }

  const updated = await ctx.container.ideaPipeline.setDraftStatus(ctx.appUserId, draftId, status);
  await ctx.reply(
    status === "approved"
      ? `Marked draft #${updated.id} (idea #${updated.ideaId}) as approved. Publishing to LinkedIn is still up to you.`
      : `Marked draft #${updated.id} (idea #${updated.ideaId}) as rejected. It stays saved - send /rewrite ${updated.ideaId} <feedback> or /write ${updated.ideaId} if you want another pass.`,
  );
}

export async function handleApprove(ctx: BotContext, args: string): Promise<void> {
  await setStatus(ctx, args, "approved", "approve");
}

export async function handleReject(ctx: BotContext, args: string): Promise<void> {
  await setStatus(ctx, args, "rejected", "reject");
}
