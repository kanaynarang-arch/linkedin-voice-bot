import type { BotContext } from "../context.js";
import { replyLong } from "../reply.js";

export async function handleRewrite(ctx: BotContext, args: string): Promise<void> {
  const trimmed = args.trim();
  if (!trimmed) {
    await ctx.reply("Usage: /rewrite [idea id] <what to change> - e.g. /rewrite make the ending punchier");
    return;
  }

  const [maybeId, ...rest] = trimmed.split(/\s+/);
  let ideaId: number;
  let feedback: string;

  if (maybeId && /^\d+$/.test(maybeId)) {
    // A numeric first token is always treated as an id attempt - if it
    // doesn't resolve, say so rather than silently reinterpreting the
    // whole string (including the number) as feedback for some other
    // idea, which would be confusing and wrong.
    const candidate = await ctx.container.ideas.getById(Number(maybeId));
    if (!candidate || candidate.userId !== ctx.appUserId) {
      await ctx.reply(`I couldn't find idea #${maybeId}. Send /ideas to see your recent ideas.`);
      return;
    }
    ideaId = candidate.id;
    feedback = rest.join(" ");
  } else {
    const latest = await ctx.container.ideas.getLatestByUser(ctx.appUserId);
    if (!latest) {
      await ctx.reply("No ideas yet to rewrite. Send me a thought first.");
      return;
    }
    ideaId = latest.id;
    feedback = trimmed;
  }

  if (!feedback.trim()) {
    await ctx.reply("Tell me what to change, e.g. /rewrite make it punchier and cut the last line.");
    return;
  }

  await ctx.reply("Revising the draft...");
  const draft = await ctx.container.ideaPipeline.rewriteDraft(ctx.appUserId, ideaId, feedback);
  await replyLong(
    ctx,
    `DRAFT (revised)\n\n${draft.content}\n\nReply "/rewrite ${ideaId} <feedback>" again to keep refining.`,
  );
}
