import type { BotContext } from "./context.js";
import { handleStart } from "./commands/start.js";
import { handleHelp } from "./commands/help.js";
import { handlePosts, handleClearPosts } from "./commands/posts.js";
import { handleAnalyze } from "./commands/analyze.js";
import { handleProfile } from "./commands/profile.js";
import { handleIdeas } from "./commands/ideas.js";
import { handleWrite } from "./commands/write.js";
import { handleRewrite } from "./commands/rewrite.js";
import { startCollectingPosts, finishCollectingPosts, cancelCollectingPosts } from "./postsCollection.js";

/**
 * Every command, keyed by name, taking (ctx, args). The single source of
 * truth for "what commands exist" - both bot/index.ts (routing normal
 * messages and channel posts to the right handler) and
 * handlers/messageHandler.ts (recognizing a known command so it isn't
 * mistakenly treated as a raw idea) import from here, so the two lists
 * can't drift apart the way two independently-maintained lists eventually
 * do.
 */
export const COMMAND_HANDLERS: Record<string, (ctx: BotContext, args: string) => Promise<void>> = {
  start: (ctx) => handleStart(ctx),
  help: (ctx) => handleHelp(ctx),
  addposts: (ctx) => startCollectingPosts(ctx),
  done: (ctx) => finishCollectingPosts(ctx),
  cancel: (ctx) => cancelCollectingPosts(ctx),
  posts: (ctx) => handlePosts(ctx),
  clearposts: (ctx, args) => handleClearPosts(ctx, args),
  analyze: (ctx) => handleAnalyze(ctx),
  profile: (ctx) => handleProfile(ctx),
  ideas: (ctx) => handleIdeas(ctx),
  write: (ctx, args) => handleWrite(ctx, args),
  rewrite: (ctx, args) => handleRewrite(ctx, args),
};

export const KNOWN_COMMAND_NAMES: ReadonlySet<string> = new Set(Object.keys(COMMAND_HANDLERS));
