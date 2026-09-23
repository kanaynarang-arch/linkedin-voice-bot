import type { AIProvider } from "../ai/provider.js";
import { generateValidatedJSON } from "../ai/structuredOutput.js";
import { buildVoiceExtractionPrompt } from "../ai/prompts/voiceExtraction.js";
import { VoiceProfileSchema, type VoiceProfileRecord } from "./types.js";
import type { PostsRepository } from "../db/repositories/posts.js";
import type { VoiceProfilesRepository } from "../db/repositories/voiceProfiles.js";
import { InsufficientDataError, MissingVoiceProfileError } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("voice-profile-service");

export class VoiceProfileService {
  constructor(
    private readonly ai: AIProvider,
    private readonly posts: PostsRepository,
    private readonly profiles: VoiceProfilesRepository,
    private readonly minPostsForAnalysis: number,
  ) {}

  /** Analyzes every stored post for this user and saves a new active Voice Profile. */
  async analyze(userId: number): Promise<VoiceProfileRecord> {
    const posts = this.posts.listByUser(userId);
    if (posts.length < this.minPostsForAnalysis) {
      throw new InsufficientDataError(
        `User ${userId} has ${posts.length} posts, needs ${this.minPostsForAnalysis}`,
        `I need at least ${this.minPostsForAnalysis} posts to build a reliable Voice Profile. You've given me ${posts.length} so far. Send more with /addposts.`,
      );
    }

    log.info("Running voice extraction", { userId, postCount: posts.length });
    const { systemInstruction, prompt } = buildVoiceExtractionPrompt(posts.map((p) => p.content));
    const profile = await generateValidatedJSON(
      this.ai,
      VoiceProfileSchema,
      systemInstruction,
      prompt,
    );

    return this.profiles.save(userId, profile, posts.length, this.ai.modelName);
  }

  getActiveOrThrow(userId: number): VoiceProfileRecord {
    const active = this.profiles.getActive(userId);
    if (!active) throw new MissingVoiceProfileError();
    return active;
  }

  getActive(userId: number): VoiceProfileRecord | null {
    return this.profiles.getActive(userId);
  }
}
