export interface GenerateParams {
  /** High-level instructions the model should always follow (role, constraints). */
  systemInstruction: string;
  /** The task-specific prompt / user content. */
  prompt: string;
}

/**
 * Provider-agnostic interface for the AI backend. Every domain service
 * (voice extraction, scoring, Google News relevance evaluation, draft
 * generation) depends only on this interface, never on Gemini directly —
 * swapping providers later means writing one new class here, not touching
 * the Telegram layer. Every call in this app produces structured JSON
 * (validated against a zod schema by the caller - see structuredOutput.ts),
 * including the final draft, so this is the only method the interface needs.
 */
export interface AIProvider {
  readonly modelName: string;

  /**
   * Generates a response the model was instructed to produce as JSON.
   * Returns the parsed value as `unknown` — callers validate shape with
   * zod. Throws AIResponseParsingError if the output isn't valid JSON.
   */
  generateJSON(params: GenerateParams): Promise<unknown>;
}
