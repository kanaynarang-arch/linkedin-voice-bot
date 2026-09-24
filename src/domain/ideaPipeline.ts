import type { AIProvider } from "../ai/provider.js";
import { generateValidatedJSON } from "../ai/structuredOutput.js";
import { buildDraftGenerationPrompt } from "../ai/prompts/draftGeneration.js";
import type { IdeasRepository } from "../db/repositories/ideas.js";
import type { DraftsRepository } from "../db/repositories/drafts.js";
import type { PostsRepository } from "../db/repositories/posts.js";
import type { VoiceProfileService } from "./voiceProfileService.js";
import type { LinkedinScoreService } from "./linkedinScoreService.js";
import type { IndustryHookService } from "./industryHookService.js";
import { DraftResponseSchema, type DraftRecord, type IdeaRecord, type IndustryHook, type LinkedinScoreRecord, type VoiceProfile } from "./types.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("idea-pipeline");

const RECENT_POSTS_FOR_REFERENCE = 5;

/** Where a run's Google News step landed - distinct states per the audit spec (section 28). */
export type NewsStatus = "not_searched" | "no_relevant_hook" | "retrieval_failure" | "relevant_hook_found";

export interface IdeaPipelineResult {
  idea: IdeaRecord;
  /** Gemini scoring call output (Call 1) - always present, even when the idea was rejected. */
  score: LinkedinScoreRecord;
  /** score.linkedinScore >= the configured MIN_CONTENT_SCORE threshold. */
  passed: boolean;
  newsStatus: NewsStatus;
  /** The single selected Google News RSS hook offered to drafting, if any. */
  newsHook: IndustryHook | null;
  /** Null only when the idea was rejected by the scoring gate. */
  draft: DraftRecord | null;
}

/**
 * Orchestrates the required Meera workflow: NOTE -> GEMINI SCORING ->
 * THRESHOLD -> GOOGLE NEWS RSS -> GEMINI DRAFTING -> TELEGRAM -> REVIEW
 * GATE. Depends only on interfaces (AIProvider, GoogleNewsClient via
 * IndustryHookService) and repositories, so it has no idea it's talking
 * to Telegram or to Gemini/Google News specifically.
 */
export class IdeaPipelineService {
  constructor(
    private readonly ai: AIProvider,
    private readonly ideas: IdeasRepository,
    private readonly drafts: DraftsRepository,
    private readonly posts: PostsRepository,
    private readonly voiceProfiles: VoiceProfileService,
    private readonly linkedinScores: LinkedinScoreService,
    private readonly industryHooks: IndustryHookService,
    private readonly minContentScore: number,
  ) {}

  /** Looks for an identical idea already captured for this user, to catch duplicate sends. */
  async findDuplicate(userId: number, rawText: string): Promise<IdeaRecord | null> {
    const trimmed = rawText.trim();
    if (!trimmed) return null;
    return this.ideas.findDuplicate(userId, trimmed);
  }

  /**
   * Full pipeline. The scoring gate is enforced by construction, not by
   * convention: Google News and drafting are only ever reached from
   * inside the `if (score.linkedinScore >= this.minContentScore)` branch
   * below - a rejected or failed score can't accidentally fall through to
   * either.
   */
  async captureAndProcess(userId: number, rawText: string): Promise<IdeaPipelineResult> {
    const trimmed = rawText.trim();
    if (!trimmed) {
      throw new ValidationError(
        "Empty idea text",
        "That message looks empty. Send me a thought, note, or observation to work with.",
      );
    }

    const voiceProfile = await this.voiceProfiles.getActiveOrThrow(userId);
    const idea = await this.ideas.create(userId, trimmed);

    // GEMINI CALL 1 - SCORING. Runs alone, before anything else. Its
    // validated 0.0-10.0 output (schema-enforced range, repair-then-throw
    // on malformed output - see structuredOutput.ts) is the only thing
    // that decides whether this idea proceeds.
    const score = await this.linkedinScores.score(idea.id, trimmed);
    const passed = score.linkedinScore >= this.minContentScore;

    log.info("Scored idea against the content gate", {
      userId,
      ideaId: idea.id,
      linkedinScore: score.linkedinScore,
      minContentScore: this.minContentScore,
      passed,
    });

    if (!passed) {
      await this.ideas.setStatus(idea.id, "not_worth_developing");
      // No Google News call, no drafting call - the low-score branch
      // terminates here.
      return { idea, score, passed: false, newsStatus: "not_searched", newsHook: null, draft: null };
    }

    await this.ideas.setStatus(idea.id, "worth_developing");

    // GOOGLE NEWS RSS - context step, only reachable after the gate
    // passes. A retrieval failure here must never fail the whole
    // pipeline (the note already passed scoring) - it degrades to
    // drafting without news, same as a genuine "nothing relevant found".
    const { newsHook, newsStatus } = await this.findBestNewsHook(idea.id, trimmed);

    // GEMINI CALL 2 - DRAFTING.
    const draft = await this.generateAndSaveDraft({
      userId,
      idea,
      voiceProfile: voiceProfile.profile,
      newsHook,
    });
    await this.ideas.setStatus(idea.id, "drafted");

    return { idea, score, passed: true, newsStatus, newsHook, draft };
  }

  /**
   * Re-runs drafting for an existing idea regardless of its score (used
   * by /write - Meera's explicit override of a rejected note, per section
   * 11's "Disagree? /write anyway"). Reuses the idea's already-computed
   * score rather than re-running Gemini Call 1 (every captured idea is
   * scored up front in captureAndProcess, so there's always one to reuse).
   * Runs a fresh Google News lookup since this is a distinct, explicit
   * request.
   */
  async draftForExistingIdea(userId: number, ideaId: number): Promise<IdeaPipelineResult> {
    const idea = await this.requireOwnedIdea(userId, ideaId);
    const voiceProfile = await this.voiceProfiles.getActiveOrThrow(userId);
    const score = await this.linkedinScores.getLatest(idea.id);
    if (!score) {
      throw new NotFoundError(
        `No score found for idea ${ideaId}`,
        "That idea hasn't been scored yet. Send it again as a new message so I can evaluate it first.",
      );
    }

    const { newsHook, newsStatus } = await this.findBestNewsHook(idea.id, idea.rawText);

    const draft = await this.generateAndSaveDraft({
      userId,
      idea,
      voiceProfile: voiceProfile.profile,
      newsHook,
    });
    await this.ideas.setStatus(idea.id, "drafted");

    return { idea, score, passed: true, newsStatus, newsHook, draft };
  }

  /**
   * Regenerates the draft for an idea using the author's feedback on the
   * previous version. Reuses the previous draft's own news hook (if any)
   * rather than re-searching Google News on every rewrite - the hook
   * shouldn't change out from under an in-progress revision.
   */
  async rewriteDraft(userId: number, ideaId: number, feedback: string): Promise<DraftRecord> {
    const trimmedFeedback = feedback.trim();
    if (!trimmedFeedback) {
      throw new ValidationError(
        "Empty rewrite feedback",
        "Tell me what to change, e.g. `/rewrite make the ending punchier and cut the second paragraph`.",
      );
    }

    const idea = await this.requireOwnedIdea(userId, ideaId);
    const voiceProfile = await this.voiceProfiles.getActiveOrThrow(userId);
    const previousDraft = await this.drafts.getLatestForIdea(ideaId);
    if (!previousDraft) {
      throw new NotFoundError(
        `No draft found for idea ${ideaId}`,
        "There's no draft yet for this idea - use /write first.",
      );
    }

    return this.generateAndSaveDraft({
      userId,
      idea,
      voiceProfile: voiceProfile.profile,
      newsHook: previousDraft.newsHook,
      rewrite: { previousDraft: previousDraft.content, feedback: trimmedFeedback },
    });
  }

  /** Approves or rejects a draft - the Review Gate decision. Never publishes anything; only records Meera's call. */
  async setDraftStatus(userId: number, draftId: number, status: "approved" | "rejected"): Promise<DraftRecord> {
    const draft = await this.drafts.getById(draftId);
    if (!draft) {
      throw new NotFoundError(`Draft ${draftId} not found`, `I couldn't find draft #${draftId}.`);
    }
    await this.requireOwnedIdea(userId, draft.ideaId);

    await this.drafts.setStatus(draftId, status);
    const updated = await this.drafts.getById(draftId);
    if (!updated) throw new NotFoundError(`Draft ${draftId} disappeared after update`, "Something went wrong recording your decision.");
    return updated;
  }

  /** Most recently created draft for this user, for /approve and /reject when no id is given. */
  async getLatestDraft(userId: number): Promise<DraftRecord | null> {
    return this.drafts.getLatestForUser(userId);
  }

  private async findBestNewsHook(
    ideaId: number,
    rawText: string,
  ): Promise<{ newsHook: IndustryHook | null; newsStatus: NewsStatus }> {
    try {
      const result = await this.industryHooks.findHooks(rawText);
      if (result.status === "hooks_found" && result.hooks[0]) {
        return { newsHook: result.hooks[0], newsStatus: "relevant_hook_found" };
      }
      return { newsHook: null, newsStatus: "no_relevant_hook" };
    } catch (cause) {
      // A note that already passed scoring must still get a draft - never
      // fail the whole pipeline because Google News is unavailable, and
      // never fabricate a hook to compensate.
      log.warn("Google News retrieval failed; drafting without news", { ideaId, cause });
      return { newsHook: null, newsStatus: "retrieval_failure" };
    }
  }

  private async requireOwnedIdea(userId: number, ideaId: number): Promise<IdeaRecord> {
    const idea = await this.ideas.getById(ideaId);
    if (!idea || idea.userId !== userId) {
      throw new NotFoundError(`Idea ${ideaId} not found for user ${userId}`, `I couldn't find idea #${ideaId}.`);
    }
    return idea;
  }

  private async generateAndSaveDraft(params: {
    userId: number;
    idea: IdeaRecord;
    voiceProfile: VoiceProfile;
    newsHook: IndustryHook | null;
    rewrite?: { previousDraft: string; feedback: string };
  }): Promise<DraftRecord> {
    const recentPosts = await this.posts.listRecentByUser(params.userId, RECENT_POSTS_FOR_REFERENCE);
    const recentPostExcerpts = recentPosts.map((p) => p.content);

    const { systemInstruction, prompt } = buildDraftGenerationPrompt({
      rawIdea: params.idea.rawText,
      voiceProfile: params.voiceProfile,
      newsHook: params.newsHook,
      recentPostExcerpts,
      rewrite: params.rewrite,
    });

    const response = await generateValidatedJSON(this.ai, DraftResponseSchema, systemInstruction, prompt);
    // Using the hook is mandatory (enforced by the prompt), not the
    // model's choice - so this is derived from whether one was offered at
    // all, not from any self-reported signal.
    const usedNewsHook = Boolean(params.newsHook);

    return this.drafts.create(
      params.idea.id,
      response.draft.trim(),
      this.ai.modelName,
      params.newsHook,
      usedNewsHook,
      params.rewrite?.feedback ?? null,
    );
  }
}
