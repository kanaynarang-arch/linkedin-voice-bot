import type { AIProvider } from "../ai/provider.js";
import { generateValidatedJSON } from "../ai/structuredOutput.js";
import { buildLinkedinScorePrompt } from "../ai/prompts/linkedinScore.js";
import { LinkedinScoreDimensionsSchema, type LinkedinScoreDimensions, type LinkedinScoreRecord } from "./types.js";
import type { IdeaScoresRepository } from "../db/repositories/ideaScores.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("linkedin-score-service");

/** The eight factors that make up the aggregate score, in the order they're averaged. */
const DIMENSION_KEYS = [
  "professionalRelevance",
  "knowledgeValue",
  "originalPerspective",
  "dwellReadPotential",
  "conversationPotential",
  "timeliness",
  "shareSaveUtility",
  "authenticityAntiSlop",
] as const satisfies readonly (keyof LinkedinScoreDimensions)[];

/**
 * Deterministically derives the single 0.0-10.0 linkedin_score from the
 * eight independently-scored dimensions, rather than trusting the model
 * to also produce a consistently-formatted aggregate. An unweighted mean
 * is used deliberately: the product spec documents no official per-factor
 * weighting, and inventing one would misrepresent this as closer to
 * LinkedIn's real (undocumented) algorithm than it actually is.
 */
export function computeLinkedinScore(dimensions: LinkedinScoreDimensions): number {
  const sum = DIMENSION_KEYS.reduce((total, key) => total + dimensions[key], 0);
  const average = sum / DIMENSION_KEYS.length;
  const clamped = Math.min(10, Math.max(0, average));
  // Round to one decimal place without binary floating-point artifacts
  // (e.g. 6.1 - not 6.099999999999999) - Math.round on the shifted value
  // is exact for the range and precision this function ever sees.
  return Math.round(clamped * 10) / 10;
}

/**
 * Scores a raw idea's potential as LinkedIn Feed content. Deliberately
 * independent of any voice profile, brand, or author-fit consideration -
 * this answers only "how strong is this idea as LinkedIn content in
 * general", never "is this a good idea for this specific author". That
 * judgment is a separate, existing evaluation elsewhere in the pipeline.
 */
export class LinkedinScoreService {
  constructor(
    private readonly ai: AIProvider,
    private readonly ideaScores: IdeaScoresRepository,
  ) {}

  async score(ideaId: number, rawIdea: string): Promise<LinkedinScoreRecord> {
    const { systemInstruction, prompt } = buildLinkedinScorePrompt(rawIdea);
    const dimensions = await generateValidatedJSON(
      this.ai,
      LinkedinScoreDimensionsSchema,
      systemInstruction,
      prompt,
    );

    const linkedinScore = computeLinkedinScore(dimensions);
    log.info("Scored idea", { ideaId, linkedinScore });

    return this.ideaScores.create(ideaId, linkedinScore, dimensions, this.ai.modelName);
  }

  /** The most recently computed score for an idea, without re-scoring - used by /write to reuse the original gate decision. */
  async getLatest(ideaId: number): Promise<LinkedinScoreRecord | null> {
    return this.ideaScores.getLatestForIdea(ideaId);
  }
}
