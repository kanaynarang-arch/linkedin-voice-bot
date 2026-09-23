import { GoogleGenAI } from "@google/genai";
import type { AIProvider, GenerateParams, ResearchProvider } from "./provider.js";
import type { ResearchResult, ResearchSource } from "../domain/types.js";
import { AIProviderError, AIResponseParsingError } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("gemini");

export interface GeminiConfig {
  apiKey: string;
  model: string;
}

/**
 * Gemini implementation of AIProvider + ResearchProvider. This is the only
 * file in the codebase that imports @google/genai — every other layer
 * talks to the AIProvider/ResearchProvider interfaces, so swapping in a
 * different model provider later means writing one new class like this
 * one, not touching domain logic or the Telegram bot.
 */
export class GeminiProvider implements AIProvider, ResearchProvider {
  readonly modelName: string;
  private readonly client: GoogleGenAI;

  constructor(config: GeminiConfig) {
    this.modelName = config.model;
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
  }

  async generateText({ systemInstruction, prompt }: GenerateParams): Promise<string> {
    let response;
    try {
      response = await this.client.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: { systemInstruction },
      });
    } catch (cause) {
      throw new AIProviderError(`Gemini generateText call failed: ${describeCause(cause)}`, cause);
    }

    const text = response.text;
    if (!text || !text.trim()) {
      throw new AIProviderError("Gemini returned an empty text response");
    }
    return text;
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

  /**
   * Best-effort current-context research via Gemini's Google Search
   * grounding tool. Never throws: a failed or empty lookup degrades to
   * "no research used" so the rest of the pipeline can proceed without it.
   */
  async research(query: string): Promise<ResearchResult> {
    try {
      const response = await this.client.models.generateContent({
        model: this.modelName,
        contents: `Find current, factual, and specific news, statistics, or data relevant to this topic: "${query}". Summarize only what is genuinely relevant in 2-4 sentences. If nothing relevant and current turns up, say so plainly.`,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const summary = response.text?.trim() ?? "";
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const sources: ResearchSource[] = chunks
        .map((chunk) => chunk.web)
        .filter((web): web is { uri: string; title?: string } => Boolean(web?.uri))
        .map((web) => ({ url: web.uri, title: web.title ?? web.uri }));

      if (!summary || sources.length === 0) {
        return { used: false, summary: null, sources: [] };
      }

      return { used: true, summary, sources };
    } catch (cause) {
      log.warn("Research lookup failed; continuing without current context", cause);
      return { used: false, summary: null, sources: [] };
    }
  }
}

function describeCause(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}
