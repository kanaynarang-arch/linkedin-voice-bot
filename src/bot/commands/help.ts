import type { BotContext } from "../context.js";
import { replyLong } from "../reply.js";

export async function handleHelp(ctx: BotContext): Promise<void> {
  await replyLong(
    ctx,
    [
      "Commands:",
      "/addposts - start adding your existing LinkedIn posts (one per message, or separated by a line of ---)",
      "/done - finish adding posts",
      "/cancel - stop adding posts (anything already added stays saved)",
      "/posts - see how many posts you've stored",
      "/clearposts confirm - delete all stored posts",
      "/analyze - build (or rebuild) your Voice Profile from stored posts",
      "/profile - view your current Voice Profile",
      "/ideas - list your recently captured ideas and their status",
      "/write [id] - draft a post for an idea (defaults to your most recent idea; pass an id to force a draft for one marked \"not worth developing\")",
      "/rewrite [id] <feedback> - revise a draft with feedback (defaults to your most recent idea)",
      "",
      "Anything else you send is treated as a raw content idea - I'll evaluate it and draft a post automatically if it has enough substance.",
    ].join("\n"),
  );
}
