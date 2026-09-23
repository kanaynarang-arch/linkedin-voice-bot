import type { BotContext } from "../context.js";
import { replyLong } from "../reply.js";

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export async function handlePosts(ctx: BotContext): Promise<void> {
  const posts = ctx.container.posts.listByUser(ctx.appUserId);
  if (posts.length === 0) {
    await ctx.reply("You haven't added any LinkedIn posts yet. Send /addposts to start.");
    return;
  }

  const recent = posts.slice(-3);
  const startIndex = posts.length - recent.length + 1;
  const preview = recent.map((p, i) => `${startIndex + i}. ${truncate(p.content, 120)}`).join("\n");

  await replyLong(
    ctx,
    `You have ${posts.length} post(s) stored.\n\nMost recent:\n${preview}\n\nSend /addposts to add more, or /clearposts confirm to delete them all.`,
  );
}

export async function handleClearPosts(ctx: BotContext, args: string): Promise<void> {
  if (args.trim().toLowerCase() !== "confirm") {
    await ctx.reply(
      "This deletes all stored LinkedIn posts (your Voice Profile itself is kept). Send `/clearposts confirm` to proceed.",
    );
    return;
  }
  const removed = ctx.container.posts.clearByUser(ctx.appUserId);
  await ctx.reply(`Deleted ${removed} post(s).`);
}
