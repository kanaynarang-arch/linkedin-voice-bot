import type { GoogleNewsClient } from "../../src/news/googleNewsClient.js";
import type { RawNewsCandidate } from "../../src/news/googleNewsRss.js";

/**
 * Scriptable fake GoogleNewsClient for tests, mirroring FakeAIProvider's
 * per-query queue convention: `queueResult(query, candidates)` sets what
 * `search(query)` returns for that exact query string; `queueFailure`
 * makes it throw instead. Keeps IndustryHookService tests deterministic
 * and free of real network calls.
 */
export class FakeGoogleNewsClient implements GoogleNewsClient {
  private readonly results = new Map<string, RawNewsCandidate[]>();
  private readonly failures = new Map<string, Error>();
  public calls: string[] = [];

  queueResult(query: string, candidates: RawNewsCandidate[]): this {
    this.results.set(query, candidates);
    return this;
  }

  queueFailure(query: string, error: Error): this {
    this.failures.set(query, error);
    return this;
  }

  async search(query: string): Promise<RawNewsCandidate[]> {
    this.calls.push(query);
    const failure = this.failures.get(query);
    if (failure) throw failure;
    return this.results.get(query) ?? [];
  }
}

export function sampleCandidate(overrides: Partial<RawNewsCandidate> = {}): RawNewsCandidate {
  return {
    title: "Cosmetic manufacturers face new preservative stability scrutiny",
    source: "Industry Wire",
    googleNewsUrl: "https://news.google.com/rss/articles/sample-1",
    publishedAt: new Date().toISOString(),
    description: "Manufacturers are reassessing preservative systems after new stability findings.",
    searchQuery: "cosmetic preservative formulation change supplier",
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}
