import type { AIProvider, GenerateParams } from "../../src/ai/provider.js";

/**
 * Scriptable fake AI provider for tests. Queue responses with `queueJSON`;
 * each call consumes the next queued value (throws if the queue is
 * exhausted, so a missing queue entry surfaces as a clear test failure
 * rather than a silent undefined).
 */
export class FakeAIProvider implements AIProvider {
  readonly modelName = "fake-model";

  private jsonQueue: unknown[] = [];

  public jsonCalls: GenerateParams[] = [];

  queueJSON(value: unknown): this {
    this.jsonQueue.push(value);
    return this;
  }

  async generateJSON(params: GenerateParams): Promise<unknown> {
    this.jsonCalls.push(params);
    if (this.jsonQueue.length === 0) {
      throw new Error("FakeAIProvider.generateJSON called with nothing queued");
    }
    return this.jsonQueue.shift();
  }
}
