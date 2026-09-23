import type { Env } from "./config/env.js";
import { openDatabase, type DB } from "./db/client.js";
import { UsersRepository } from "./db/repositories/users.js";
import { PostsRepository } from "./db/repositories/posts.js";
import { VoiceProfilesRepository } from "./db/repositories/voiceProfiles.js";
import { IdeasRepository } from "./db/repositories/ideas.js";
import { AnalysesRepository } from "./db/repositories/analyses.js";
import { DraftsRepository } from "./db/repositories/drafts.js";
import { ConversationStateRepository } from "./db/repositories/conversationState.js";
import { GeminiProvider } from "./ai/gemini.js";
import type { AIProvider, ResearchProvider } from "./ai/provider.js";
import { VoiceProfileService } from "./domain/voiceProfileService.js";
import { IdeaPipelineService } from "./domain/ideaPipeline.js";

export interface Container {
  db: DB;
  ai: AIProvider & ResearchProvider;
  minPostsForAnalysis: number;
  users: UsersRepository;
  posts: PostsRepository;
  voiceProfiles: VoiceProfilesRepository;
  ideas: IdeasRepository;
  analyses: AnalysesRepository;
  drafts: DraftsRepository;
  conversationState: ConversationStateRepository;
  voiceProfileService: VoiceProfileService;
  ideaPipeline: IdeaPipelineService;
}

/** Builds all repositories and services from a validated Env. One place to wire the app. */
export function buildContainer(env: Env): Container {
  const db = openDatabase(env.DATABASE_PATH);
  const ai = new GeminiProvider({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL });
  return buildContainerFromParts(db, ai, env.MIN_POSTS_FOR_ANALYSIS);
}

/**
 * Wires the container from already-constructed pieces. Used directly by
 * tests so they can pass an in-memory DB and a fake AI provider without
 * needing real credentials.
 */
export function buildContainerFromParts(
  db: DB,
  ai: AIProvider & ResearchProvider,
  minPostsForAnalysis: number,
): Container {
  const users = new UsersRepository(db);
  const posts = new PostsRepository(db);
  const voiceProfiles = new VoiceProfilesRepository(db);
  const ideas = new IdeasRepository(db);
  const analyses = new AnalysesRepository(db);
  const drafts = new DraftsRepository(db);
  const conversationState = new ConversationStateRepository(db);

  const voiceProfileService = new VoiceProfileService(ai, posts, voiceProfiles, minPostsForAnalysis);
  const ideaPipeline = new IdeaPipelineService(ai, ai, ideas, analyses, drafts, posts, voiceProfileService);

  return {
    db,
    ai,
    minPostsForAnalysis,
    users,
    posts,
    voiceProfiles,
    ideas,
    analyses,
    drafts,
    conversationState,
    voiceProfileService,
    ideaPipeline,
  };
}
