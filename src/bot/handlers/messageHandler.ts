import type { BotContext } from "../context.js";
import { replyLong } from "../reply.js";
import { formatPipelineResult } from "../formatting.js";
import { handlePostsCollectionMessage } from "../postsCollection.js";
import { parseResearchJson } from "../../domain/ideaPipeline.js";

const KNOWN_COMMANDS = new Set([
  "start",
  "help",
  "addposts",
  "done",
  "cancel",
  "posts",
  "clearposts",
  "analyze",
  "profile",
  "ideas",
  "write",
  "rewrite",
]);

/**
 * Handles every plain-text message that isn't a recognized command.
 * Routes to the active multi-step flow (posts collection) if one is in
 * progress; otherwise treats the message as a new raw content idea.
 */
export async function handleTextMessage(ctx: BotContext, text: string): Promise<void> {
  const trimmed = text.trim();

  if (trimmed.startsWith("/")) {
    const command = trimmed.slice(1).split(/[\s@]/)[0]?.toLowerCase();
    if (!command || !KNOWN_COMMANDS.has(command)) {
      await ctx.reply(`Unknown command "${trimmed.split(/\s/)[0]}". Send /help for the list of commands.`);
      return;
    }
    // Known commands are handled by dedicated bot.command() registrations;
    // reaching here means Telegraf routed it to us anyway (shouldn't
    // normally happen), so just no-op rather than double-processing.
    return;
  }

  const state = ctx.container.conversationState.get(ctx.appUserId);
  if (state.state === "collecting_posts") {
    await handlePostsCollectionMessage(ctx, text);
    return;
  }

  if (!trimmed) {
    await ctx.reply("That message looks empty - send me a thought, note, or observation to work with.");
    return;
  }

  const duplicate = ctx.container.ideaPipeline.findDuplicate(ctx.appUserId, trimmed);
  if (duplicate) {
    const analysis = ctx.container.analyses.getLatestForIdea(duplicate.id);
    if (!analysis) {
      await ctx.reply(
        `You already sent this idea on ${duplicate.createdAt.slice(0, 10)} (#${duplicate.id}), but it hasn't been analyzed yet. Send /write ${duplicate.id} to analyze it now.`,
      );
      return;
    }
    const draft = ctx.container.drafts.getLatestForIdea(duplicate.id);
    const research = parseResearchJson(analysis.researchJson);
    await replyLong(
      ctx,
      [
        `You already sent this idea on ${duplicate.createdAt.slice(0, 10)} (#${duplicate.id}). Here's what I found then:`,
        "",
        formatPipelineResult({ idea: duplicate, analysis, research, draft }),
      ].join("\n"),
    );
    return;
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
