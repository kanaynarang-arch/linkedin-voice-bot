import type { ResearchResult } from "../domain/types.js";

export interface GenerateParams {
  /** High-level instructions the model should always follow (role, constraints). */
  systemInstruction: string;
  /** The task-specific prompt / user content. */
  prompt: string;
}

/**
 * Provider-agnostic interface for the AI backend. Every domain service
 * (voice extraction, idea evaluation, draft generation) depends only on
 * this interface, never on Gemini directly — swapping providers later
 * means writing one new class here, not touching the Telegram layer.
 */
export interface AIProvider {
  readonly modelName: string;

  /** Generates free-form text (used for the final LinkedIn draft). */
  generateText(params: GenerateParams): Promise<string>;

  /**
   * Generates a response the model was instructed to produce as JSON.
   * Returns the parsed value as `unknown` — callers validate shape with
   * zod. Throws AIResponseParsingError if the output isn't valid JSON.
   */
  generateJSON(params: GenerateParams): Promise<unknown>;
}

/**
 * Optional capability: looking up current news/data to strengthen a
 * draft. Kept separate from AIProvider because not every provider can
 * do grounded search, and the bot must work (without research) even if
 * this fails or is unavailable.
 */
export interface ResearchProvider {
  research(query: string): Promise<ResearchResult>;
}
