import type { AIProvider, GenerateParams, ResearchProvider } from "../../src/ai/provider.js";
import type { ResearchResult } from "../../src/domain/types.js";

/**
 * Scriptable fake AI provider for tests. Queue responses with
 * `queueJSON`/`queueText`/`queueResearch`; each call to the corresponding
 * method consumes the next queued value (or the last one if the queue is
 * exhausted, so tests that don't care about later calls still work).
 */
export class FakeAIProvider implements AIProvider, ResearchProvider {
  readonly modelName = "fake-model";

  private jsonQueue: unknown[] = [];
  private textQueue: string[] = [];
  private researchQueue: ResearchResult[] = [];

  public jsonCalls: GenerateParams[] = [];
  public textCalls: GenerateParams[] = [];
  public researchCalls: string[] = [];

  queueJSON(value: unknown): this {
    this.jsonQueue.push(value);
    return this;
  }

  queueText(value: string): this {
    this.textQueue.push(value);
    return this;
  }

  queueResearch(value: ResearchResult): this {
    this.researchQueue.push(value);
    return this;
  }

  async generateJSON(params: GenerateParams): Promise<unknown> {
    this.jsonCalls.push(params);
    if (this.jsonQueue.length === 0) {
      throw new Error("FakeAIProvider.generateJSON called with nothing queued");
    }
    return this.jsonQueue.shift();
  }

  async generateText(params: GenerateParams): Promise<string> {
    this.textCalls.push(params);
    if (this.textQueue.length === 0) {
      throw new Error("FakeAIProvider.generateText called with nothing queued");
    }
    return this.textQueue.shift() as string;
  }

  async research(query: string): Promise<ResearchResult> {
    this.researchCalls.push(query);
    if (this.researchQueue.length === 0) {
      return { used: false, summary: null, sources: [] };
    }
    return this.researchQueue.shift() as ResearchResult;
  }
}
