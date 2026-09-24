import { GoogleGenAI } from "@google/genai";
import type { AIProvider, GenerateParams } from "./provider.js";
import { AIProviderError, AIResponseParsingError } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";

export interface GeminiConfig {
  apiKey: string;
  model: string;
}

/**
 * Gemini implementation of AIProvider. This is the only file in the
 * codebase that imports @google/genai — every other layer talks to the
 * AIProvider interface, so swapping in a different model provider later
 * means writing one new class like this one, not touching domain logic or
 * the Telegram bot. Gemini performs both required responsibilities -
 * scoring (linkedinScoreService.ts) and drafting (ideaPipeline.ts) -
 * there is no Claude/OpenAI dependency anywhere in this app.
 */
export class GeminiProvider implements AIProvider {
  readonly modelName: string;
  private readonly client: GoogleGenAI;

  constructor(config: GeminiConfig) {
    this.modelName = config.model;
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
  }

  async generateJSON({ systemInstruction, prompt }: GenerateParams): Promise<unknown> {
    let response;
    try {
      response = await this.client.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
        },
      });
    } catch (cause) {
      throw new AIProviderError(`Gemini generateJSON call failed: ${describeCause(cause)}`, cause);
    }

    const text = response.text;
    if (!text || !text.trim()) {
      throw new AIProviderError("Gemini returned an empty JSON response");
    }

    try {
      return JSON.parse(text);
    } catch (cause) {
      throw new AIResponseParsingError(
        `Gemini response was not valid JSON: ${text.slice(0, 500)}`,
        cause,
      );
    }
  }
}

function describeCause(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}
