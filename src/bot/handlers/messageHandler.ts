import type { BotContext } from "../context.js";
import { replyLong } from "../reply.js";
import { formatPipelineResult } from "../formatting.js";
import { handlePostsCollectionMessage } from "../postsCollection.js";
import { KNOWN_COMMAND_NAMES } from "../commandRegistry.js";
import { parseCommandName, formatDate } from "../telegramUtils.js";

/**
 * Handles every plain-text message that isn't a recognized command.
 * Routes to the active multi-step flow (posts collection) if one is in
 * progress; otherwise treats the message as a new raw content idea.
 */
export async function handleTextMessage(ctx: BotContext, text: string): Promise<void> {
  const trimmed = text.trim();

  if (trimmed.startsWith("/")) {
    const command = parseCommandName(trimmed);
    if (!command || !KNOWN_COMMAND_NAMES.has(command)) {
      await ctx.reply(`Unknown command "${trimmed.split(/\s/)[0]}". Send /help for the list of commands.`);
      return;
    }
    // Known commands are handled by dedicated bot.command() registrations;
    // reaching here means Telegraf routed it to us anyway (shouldn't
    // normally happen), so just no-op rather than double-processing.
    return;
  }

  const state = await ctx.container.conversationState.get(ctx.appUserId);
  if (state.state === "collecting_posts") {
    await handlePostsCollectionMessage(ctx, text);
    return;
  }

  if (!trimmed) {
    await ctx.reply("That message looks empty - send me a thought, note, or observation to work with.");
    return;
  }

  // Only treat this as a real duplicate if the earlier attempt actually
  // finished scoring. An idea whose first attempt errored out before
  // scoring completed (e.g. a transient AI failure) has no score row -
  // silently re-showing "already sent" for that case would trap the user:
  // resending the identical text can never get past this check, and /write
  // can't help either since it only re-drafts an *existing* idea, it
  // doesn't run scoring from scratch. So an unscored "duplicate" just
  // falls through and gets processed as a fresh attempt below.
  const duplicate = await ctx.container.ideaPipeline.findDuplicate(ctx.appUserId, trimmed);
  if (duplicate) {
    const score = await ctx.container.ideaScores.getLatestForIdea(duplicate.id);
    if (score) {
      const draft = await ctx.container.drafts.getLatestForIdea(duplicate.id);
      const passed = score.linkedinScore >= ctx.container.minContentScore;
      await replyLong(
        ctx,
        [
          `You already sent this idea on ${formatDate(duplicate.createdAt)} (#${duplicate.id}). Here's what I found then:`,
          "",
          formatPipelineResult({
            idea: duplicate,
            score,
            passed,
            newsStatus: draft?.newsHook ? "relevant_hook_found" : "no_relevant_hook",
            newsHook: draft?.newsHook ?? null,
            draft,
          }),
        ].join("\n"),
      );
      return;
    }
  }

  await ctx.reply("Got it - thinking this through...");
  const result = await ctx.container.ideaPipeline.captureAndProcess(ctx.appUserId, trimmed);
  await replyLong(ctx, formatPipelineResult(result));
}

/** Handles non-text updates (photos, voice notes, stickers, documents, ...). */
export async function handleNonTextMessage(ctx: BotContext): Promise<void> {
  await ctx.reply(
    "I can only work with text right now - send me a written thought, or paste your LinkedIn posts as text.",
  );
}
