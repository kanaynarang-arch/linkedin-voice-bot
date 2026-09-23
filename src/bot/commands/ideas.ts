import type { BotContext } from "../context.js";
import { replyLong } from "../reply.js";

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export async function handleIdeas(ctx: BotContext): Promise<void> {
  const ideas = ctx.container.ideas.listByUser(ctx.appUserId, 15);
  if (ideas.length === 0) {
    await ctx.reply("No ideas captured yet. Just send me a thought and I'll take it from there.");
    return;
  }

  const lines = ideas.map((i) => `#${i.id} [${i.status}] ${truncate(i.rawText, 80)}`);
  await replyLong(ctx, `Recent ideas:\n${lines.join("\n")}`);
}
