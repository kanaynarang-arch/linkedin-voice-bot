import type { AIProvider, ResearchProvider } from "../ai/provider.js";
import { generateValidatedJSON } from "../ai/structuredOutput.js";
import { buildIdeaEvaluationPrompt } from "../ai/prompts/ideaEvaluation.js";
import { buildDraftGenerationPrompt } from "../ai/prompts/draftGeneration.js";
import type { IdeasRepository } from "../db/repositories/ideas.js";
import type { AnalysesRepository } from "../db/repositories/analyses.js";
import type { DraftsRepository } from "../db/repositories/drafts.js";
import type { PostsRepository } from "../db/repositories/posts.js";
import type { VoiceProfileService } from "./voiceProfileService.js";
import {
  IdeaEvaluationSchema,
  type AnalysisRecord,
  type DraftRecord,
  type IdeaRecord,
  type ResearchResult,
  type VoiceProfile,
} from "./types.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("idea-pipeline");

const RECENT_POSTS_FOR_REFERENCE = 5;

export interface IdeaPipelineResult {
  idea: IdeaRecord;
  analysis: AnalysisRecord;
  research: ResearchResult | null;
  draft: DraftRecord | null;
}

/**
 * Orchestrates the full "raw idea -> evaluation -> research -> draft"
 * pipeline described in the product spec. Depends only on interfaces
 * (AIProvider, ResearchProvider) and repositories, so it has no idea it's
 * talking to Telegram or to Gemini specifically.
 */
export class IdeaPipelineService {
  constructor(
    private readonly ai: AIProvider,
    private readonly researchProvider: ResearchProvider,
    private readonly ideas: IdeasRepository,
    private readonly analyses: AnalysesRepository,
    private readonly drafts: DraftsRepository,
    private readonly posts: PostsRepository,
    private readonly voiceProfiles: VoiceProfileService,
  ) {}

  /** Looks for an identical idea already captured for this user, to catch duplicate sends. */
  async findDuplicate(userId: number, rawText: string): Promise<IdeaRecord | null> {
    const trimmed = rawText.trim();
    if (!trimmed) return null;
    return this.ideas.findDuplicate(userId, trimmed);
  }

  /** Full pipeline: capture a new idea, evaluate it, research if useful, and draft if worth it. */
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

    const evaluationPrompt = buildIdeaEvaluationPrompt(trimmed, voiceProfile.profile);
    const evaluation = await generateValidatedJSON(
      this.ai,
      IdeaEvaluationSchema,
      evaluationPrompt.systemInstruction,
      evaluationPrompt.prompt,
    );

    let research: ResearchResult | null = null;
    if (evaluation.worthDeveloping && evaluation.researchQueries.length > 0) {
      const query = evaluation.researchQueries[0];
      if (query) {
        research = await this.researchProvider.research(query);
      }
    }

    const analysis = await this.analyses.create({
      ideaId: idea.id,
      ideaSummary: evaluation.ideaSummary,
      worthDeveloping: evaluation.worthDeveloping,
      reasoning: evaluation.reasoning,
      angle: evaluation.angle,
      research,
      model: this.ai.modelName,
    });

    await this.ideas.setStatus(
      idea.id,
      evaluation.worthDeveloping ? "worth_developing" : "not_worth_developing",
    );

    let draft: DraftRecord | null = null;
    if (evaluation.worthDeveloping && evaluation.angle) {
      draft = await this.generateAndSaveDraft({
        userId,
        idea,
        analysisId: analysis.id,
        ideaSummary: analysis.ideaSummary,
        angle: evaluation.angle,
        voiceProfile: voiceProfile.profile,
        research,
      });
      await this.ideas.setStatus(idea.id, "drafted");
    }

    log.info("Processed idea", { userId, ideaId: idea.id, worthDeveloping: evaluation.worthDeveloping });
    return { idea, analysis, research, draft };
  }

  /** Re-runs draft generation for an existing, already-analyzed idea (used by /write <id>). */
  async draftForExistingIdea(userId: number, ideaId: number): Promise<IdeaPipelineResult> {
    const idea = await this.requireOwnedIdea(userId, ideaId);
    const voiceProfile = await this.voiceProfiles.getActiveOrThrow(userId);
    const analysis = await this.analyses.getLatestForIdea(ideaId);
    if (!analysis) {
      throw new NotFoundError(
        `No analysis found for idea ${ideaId}`,
        "That idea hasn't been analyzed yet. Send it again as a new message so I can evaluate it first.",
      );
    }

    const angle =
      analysis.angle ??
      "No strong angle was identified initially - find the most honest, specific angle available and write from there.";
    const research = parseResearchJson(analysis.researchJson);

    const draft = await this.generateAndSaveDraft({
      userId,
      idea,
      analysisId: analysis.id,
      ideaSummary: analysis.ideaSummary,
      angle,
      voiceProfile: voiceProfile.profile,
      research,
    });
    await this.ideas.setStatus(idea.id, "drafted");

    return { idea, analysis, research, draft };
  }

  /** Regenerates the draft for an idea using the author's feedback on the previous version. */
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
    const analysis = await this.analyses.getLatestForIdea(ideaId);
    if (!analysis) {
      throw new NotFoundError(`No analysis found for idea ${ideaId}`, "That idea hasn't been analyzed yet.");
    }
    const previousDraft = await this.drafts.getLatestForIdea(ideaId);
    if (!previousDraft) {
      throw new NotFoundError(
        `No draft found for idea ${ideaId}`,
        "There's no draft yet for this idea - use /write first.",
      );
    }

    const research = parseResearchJson(analysis.researchJson);
    const recentPosts = await this.posts.listByUser(userId);
    const recentPostExcerpts = recentPosts.slice(-RECENT_POSTS_FOR_REFERENCE).map((p) => p.content);

    const { systemInstruction, prompt } = buildDraftGenerationPrompt({
      ideaSummary: analysis.ideaSummary,
      rawIdea: idea.rawText,
      angle: analysis.angle ?? "",
      voiceProfile: voiceProfile.profile,
      researchSummary: research?.summary ?? null,
      recentPostExcerpts,
      rewrite: { previousDraft: previousDraft.content, feedback: trimmedFeedback },
    });

    const text = await this.ai.generateText({ systemInstruction, prompt });
    return this.drafts.create(idea.id, analysis.id, text.trim(), this.ai.modelName, trimmedFeedback);
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
    analysisId: number;
    ideaSummary: string;
    angle: string;
    voiceProfile: VoiceProfile;
    research: ResearchResult | null;
  }): Promise<DraftRecord> {
    const allPosts = await this.posts.listByUser(params.userId);
    const recentPostExcerpts = allPosts.slice(-RECENT_POSTS_FOR_REFERENCE).map((p) => p.content);

    const { systemInstruction, prompt } = buildDraftGenerationPrompt({
      ideaSummary: params.ideaSummary,
      rawIdea: params.idea.rawText,
      angle: params.angle,
      voiceProfile: params.voiceProfile,
      researchSummary: params.research?.summary ?? null,
      recentPostExcerpts,
    });

    const text = await this.ai.generateText({ systemInstruction, prompt });
    return this.drafts.create(params.idea.id, params.analysisId, text.trim(), this.ai.modelName);
  }
}

export function parseResearchJson(json: string | null): ResearchResult | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as ResearchResult;
  } catch {
    return null;
  }
}
