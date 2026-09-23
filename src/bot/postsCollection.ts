import type { BotContext } from "./context.js";
import { replyLong } from "./reply.js";

const SEPARATOR_PATTERN = /^\s*-{3,}\s*$/m;

export async function startCollectingPosts(ctx: BotContext): Promise<void> {
  ctx.container.conversationState.set(ctx.appUserId, "collecting_posts", { addedCount: 0 });
  await replyLong(
    ctx,
    [
      "Send me your existing LinkedIn posts so I can learn your voice.",
      "One per message is easiest, but you can also paste several in one message separated by a line containing just ---.",
      "Send /done when you've added them all, or /cancel to stop (anything already added stays saved).",
    ].join("\n"),
  );
}

export async function handlePostsCollectionMessage(ctx: BotContext, text: string): Promise<void> {
  const parts = text
    .split(SEPARATOR_PATTERN)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (parts.length === 0) {
    await ctx.reply("That message looks empty - send the post text, or /done if you're finished.");
    return;
  }

  ctx.container.posts.addMany(ctx.appUserId, parts);
  const total = ctx.container.posts.countByUser(ctx.appUserId);
  await ctx.reply(
    `Added ${parts.length} post${parts.length === 1 ? "" : "s"} (${total} total stored). Send more, or /done when finished.`,
  );
}

export async function finishCollectingPosts(ctx: BotContext): Promise<void> {
  ctx.container.conversationState.reset(ctx.appUserId);
  const total = ctx.container.posts.countByUser(ctx.appUserId);
  const min = ctx.container.minPostsForAnalysis;
  const nextStep =
    total >= min
      ? "Run /analyze to build your Voice Profile."
      : `Add at least ${min} total before running /analyze (you have ${total}).`;
  await ctx.reply(`Done collecting. You have ${total} post(s) stored in total. ${nextStep}`);
}

export async function cancelCollectingPosts(ctx: BotContext): Promise<void> {
  ctx.container.conversationState.reset(ctx.appUserId);
  await ctx.reply("Stopped collecting posts. Anything already added this session is still saved.");
}
