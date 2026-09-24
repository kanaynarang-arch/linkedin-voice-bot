import { describe, expect, it } from "vitest";
import {
  IndustryHookService,
  classifyRecency,
  dedupeArticles,
  dedupeEvents,
  HOOK_MINIMUM_SCORE,
  MAX_HOOKS,
} from "../../src/domain/industryHookService.js";
import type { IndustryHook } from "../../src/domain/types.js";
import { FakeAIProvider } from "../testUtils/fakeAIProvider.js";
import { FakeGoogleNewsClient, sampleCandidate } from "../testUtils/fakeGoogleNewsClient.js";
import { ValidationError } from "../../src/utils/errors.js";
import { NewsRetrievalError, AIResponseParsingError } from "../../src/utils/errors.js";

const RAW_THOUGHT = "Supplier changed the preservative blend without telling us.";

function plan(queries: { query: string; concept: string; pass: 1 | 2 | 3 }[], concepts = ["preservative systems", "supplier transparency"]) {
  return { concepts, queries };
}

function evaluation(items: Array<Record<string, unknown>>) {
  return { evaluations: items };
}

function qualifyingItem(candidateIndex: number, hookStrength = 7.5, overrides: Record<string, unknown> = {}) {
  return {
    candidateIndex,
    verdict: "qualifies",
    hookStrength,
    connectionType: "contextualizes",
    relevanceReason: "Directly concerns supplier-driven formulation changes.",
    hookConnection: "Provides a recent example of a supplier changing a preservative system, contextualizing the thought.",
    ...overrides,
  };
}

function rejectedItem(candidateIndex: number) {
  return {
    candidateIndex,
    verdict: "insufficient_evidence",
    hookStrength: 0,
    connectionType: "contextualizes",
    relevanceReason: "Only a generic industry headline with no specific connection.",
    hookConnection: "No genuine connection could be established from the available metadata.",
  };
}

describe("IndustryHookService.findHooks", () => {
  it("rejects an empty raw thought without making any AI or network calls", async () => {
    const ai = new FakeAIProvider();
    const newsClient = new FakeGoogleNewsClient();
    const service = new IndustryHookService(ai, newsClient);

    await expect(service.findHooks("   ")).rejects.toThrow(ValidationError);
    expect(ai.jsonCalls).toHaveLength(0);
    expect(newsClient.calls).toHaveLength(0);
  });

  it("runs pass 1 queries and stops there once enough candidates are retrieved", async () => {
    const ai = new FakeAIProvider();
    const newsClient = new FakeGoogleNewsClient();
    const service = new IndustryHookService(ai, newsClient);

    ai.queueJSON(
      plan([
        { query: "pass1 query", concept: "preservative systems", pass: 1 },
        { query: "pass2 query", concept: "supplier documentation", pass: 2 },
        { query: "pass3 query", concept: "cosmetic regulation", pass: 3 },
      ]),
    );
    newsClient.queueResult(
      "pass1 query",
      Array.from({ length: 6 }, (_, i) =>
        sampleCandidate({ title: `Article ${i}`, googleNewsUrl: `https://news.google.com/rss/articles/${i}` }),
      ),
    );
    ai.queueJSON(evaluation([qualifyingItem(0)]));

    const result = await service.findHooks(RAW_THOUGHT);

    expect(newsClient.calls).toEqual(["pass1 query"]);
    expect(result.status).toBe("hooks_found");
  });

  it("escalates to pass 2 when pass 1 doesn't retrieve enough candidates", async () => {
    const ai = new FakeAIProvider();
    const newsClient = new FakeGoogleNewsClient();
    const service = new IndustryHookService(ai, newsClient);

    ai.queueJSON(
      plan([
        { query: "pass1 query", concept: "preservative systems", pass: 1 },
        { query: "pass2 query", concept: "supplier documentation", pass: 2 },
      ]),
    );
    newsClient.queueResult("pass1 query", [sampleCandidate({ googleNewsUrl: "https://news.google.com/rss/articles/1" })]);
    newsClient.queueResult("pass2 query", [sampleCandidate({ googleNewsUrl: "https://news.google.com/rss/articles/2" })]);
    ai.queueJSON(evaluation([qualifyingItem(0), qualifyingItem(1)]));

    await service.findHooks(RAW_THOUGHT);

    expect(newsClient.calls).toEqual(["pass1 query", "pass2 query"]);
  });

  it("continues the staged search when one query fails, without throwing", async () => {
    const ai = new FakeAIProvider();
    const newsClient = new FakeGoogleNewsClient();
    const service = new IndustryHookService(ai, newsClient);

    ai.queueJSON(
      plan([
        { query: "failing query", concept: "a", pass: 1 },
        { query: "working query", concept: "b", pass: 1 },
      ]),
    );
    newsClient.queueFailure("failing query", new NewsRetrievalError("boom"));
    newsClient.queueResult("working query", [sampleCandidate()]);
    ai.queueJSON(evaluation([qualifyingItem(0)]));

    const result = await service.findHooks(RAW_THOUGHT);
    expect(result.status).toBe("hooks_found");
  });

  it("throws NewsRetrievalError (not no_relevant_hook) when every search query fails", async () => {
    const ai = new FakeAIProvider();
    const newsClient = new FakeGoogleNewsClient();
    const service = new IndustryHookService(ai, newsClient);

    ai.queueJSON(plan([{ query: "q1", concept: "a", pass: 1 }]));
    newsClient.queueFailure("q1", new NewsRetrievalError("boom"));

    await expect(service.findHooks(RAW_THOUGHT)).rejects.toThrow(NewsRetrievalError);
  });

  it("returns no_relevant_hook (not an error) when retrieval succeeds but finds nothing", async () => {
    const ai = new FakeAIProvider();
    const newsClient = new FakeGoogleNewsClient();
    const service = new IndustryHookService(ai, newsClient);

    ai.queueJSON(plan([{ query: "q1", concept: "a", pass: 1 }]));
    newsClient.queueResult("q1", []);

    const result = await service.findHooks(RAW_THOUGHT);
    expect(result).toEqual({ status: "no_relevant_hook", hooks: [] });
    // No candidates retrieved - evaluation must never be called with nothing to evaluate.
    expect(ai.jsonCalls).toHaveLength(1);
  });

  it("returns no_relevant_hook when candidates were retrieved but none qualify", async () => {
    const ai = new FakeAIProvider();
    const newsClient = new FakeGoogleNewsClient();
    const service = new IndustryHookService(ai, newsClient);

    ai.queueJSON(plan([{ query: "q1", concept: "a", pass: 1 }]));
    newsClient.queueResult("q1", [sampleCandidate()]);
    ai.queueJSON(evaluation([rejectedItem(0)]));

    const result = await service.findHooks(RAW_THOUGHT);
    expect(result).toEqual({ status: "no_relevant_hook", hooks: [] });
  });

  it("excludes a candidate below the hook-strength threshold even if marked qualifies", async () => {
    const ai = new FakeAIProvider();
    const newsClient = new FakeGoogleNewsClient();
    const service = new IndustryHookService(ai, newsClient);

    ai.queueJSON(plan([{ query: "q1", concept: "a", pass: 1 }]));
    newsClient.queueResult("q1", [
      sampleCandidate({ googleNewsUrl: "https://news.google.com/rss/articles/1" }),
      sampleCandidate({ googleNewsUrl: "https://news.google.com/rss/articles/2" }),
    ]);
    ai.queueJSON(
      evaluation([
        qualifyingItem(0, HOOK_MINIMUM_SCORE - 0.1),
        qualifyingItem(1, HOOK_MINIMUM_SCORE),
      ]),
    );

    const result = await service.findHooks(RAW_THOUGHT);
    expect(result.status).toBe("hooks_found");
    expect(result.hooks).toHaveLength(1);
    expect(result.hooks[0]?.hookStrength).toBe(HOOK_MINIMUM_SCORE);
  });

  it("ignores an insufficient_evidence verdict even if it carries a high hookStrength", async () => {
    const ai = new FakeAIProvider();
    const newsClient = new FakeGoogleNewsClient();
    const service = new IndustryHookService(ai, newsClient);

    ai.queueJSON(plan([{ query: "q1", concept: "a", pass: 1 }]));
    newsClient.queueResult("q1", [sampleCandidate()]);
    ai.queueJSON(evaluation([{ ...qualifyingItem(0, 9.9), verdict: "insufficient_evidence" }]));

    const result = await service.findHooks(RAW_THOUGHT);
    expect(result).toEqual({ status: "no_relevant_hook", hooks: [] });
  });

  it("ignores an out-of-range candidateIndex rather than fabricating a hook", async () => {
    const ai = new FakeAIProvider();
    const newsClient = new FakeGoogleNewsClient();
    const service = new IndustryHookService(ai, newsClient);

    ai.queueJSON(plan([{ query: "q1", concept: "a", pass: 1 }]));
    newsClient.queueResult("q1", [sampleCandidate()]);
    ai.queueJSON(evaluation([qualifyingItem(99)]));

    const result = await service.findHooks(RAW_THOUGHT);
    expect(result).toEqual({ status: "no_relevant_hook", hooks: [] });
  });

  it("ranks qualifying hooks by hookStrength descending and never fabricates canonicalUrl", async () => {
    const ai = new FakeAIProvider();
    const newsClient = new FakeGoogleNewsClient();
    const service = new IndustryHookService(ai, newsClient);

    ai.queueJSON(plan([{ query: "q1", concept: "a", pass: 1 }]));
    newsClient.queueResult("q1", [
      sampleCandidate({ title: "Weaker", googleNewsUrl: "https://news.google.com/rss/articles/1" }),
      sampleCandidate({ title: "Stronger", googleNewsUrl: "https://news.google.com/rss/articles/2" }),
    ]);
    ai.queueJSON(evaluation([qualifyingItem(0, 6.5), qualifyingItem(1, 9.0)]));

    const result = await service.findHooks(RAW_THOUGHT);
    expect(result.hooks.map((h) => h.title)).toEqual(["Stronger", "Weaker"]);
    expect(result.hooks.every((h) => h.canonicalUrl === null)).toBe(true);
  });

  it("caps results at MAX_HOOKS, keeping the strongest", async () => {
    const ai = new FakeAIProvider();
    const newsClient = new FakeGoogleNewsClient();
    const service = new IndustryHookService(ai, newsClient);

    const candidates = Array.from({ length: 7 }, (_, i) =>
      sampleCandidate({ title: `Article ${i}`, googleNewsUrl: `https://news.google.com/rss/articles/${i}` }),
    );
    ai.queueJSON(plan([{ query: "q1", concept: "a", pass: 1 }]));
    newsClient.queueResult("q1", candidates);
    ai.queueJSON(evaluation(candidates.map((_, i) => qualifyingItem(i, 6 + i * 0.5))));

    const result = await service.findHooks(RAW_THOUGHT);
    expect(result.hooks).toHaveLength(MAX_HOOKS);
    // 7 candidates qualify with strictly increasing strength; only the top MAX_HOOKS survive.
    expect(result.hooks[0]?.title).toBe("Article 6");
  });

  it("returns fewer than MAX_HOOKS without padding when only a few qualify", async () => {
    const ai = new FakeAIProvider();
    const newsClient = new FakeGoogleNewsClient();
    const service = new IndustryHookService(ai, newsClient);

    ai.queueJSON(plan([{ query: "q1", concept: "a", pass: 1 }]));
    newsClient.queueResult("q1", [sampleCandidate()]);
    ai.queueJSON(evaluation([qualifyingItem(0)]));

    const result = await service.findHooks(RAW_THOUGHT);
    expect(result.hooks).toHaveLength(1);
  });

  it("article-level dedupes the same URL retrieved from two different queries before evaluation", async () => {
    const ai = new FakeAIProvider();
    const newsClient = new FakeGoogleNewsClient();
    const service = new IndustryHookService(ai, newsClient);

    const dupeUrl = "https://news.google.com/rss/articles/same";
    ai.queueJSON(
      plan([
        { query: "q1", concept: "a", pass: 1 },
        { query: "q2", concept: "b", pass: 1 },
      ]),
    );
    newsClient.queueResult("q1", [sampleCandidate({ googleNewsUrl: dupeUrl, title: "Same article" })]);
    newsClient.queueResult("q2", [sampleCandidate({ googleNewsUrl: dupeUrl, title: "Same article" })]);
    ai.queueJSON(evaluation([qualifyingItem(0)]));

    const result = await service.findHooks(RAW_THOUGHT);
    // Only one evaluation item was needed/returned because only one deduped candidate exists.
    expect(result.hooks).toHaveLength(1);
  });

  it("propagates an AI failure from concept/query generation", async () => {
    const ai = new FakeAIProvider();
    const newsClient = new FakeGoogleNewsClient();
    const service = new IndustryHookService(ai, newsClient);
    // Nothing queued - FakeAIProvider throws.

    await expect(service.findHooks(RAW_THOUGHT)).rejects.toThrow();
    expect(newsClient.calls).toHaveLength(0);
  });

  it("propagates an AI failure from relevance evaluation", async () => {
    const ai = new FakeAIProvider();
    const newsClient = new FakeGoogleNewsClient();
    const service = new IndustryHookService(ai, newsClient);

    ai.queueJSON(plan([{ query: "q1", concept: "a", pass: 1 }]));
    newsClient.queueResult("q1", [sampleCandidate()]);
    ai.queueJSON({ evaluations: [{ candidateIndex: 0, verdict: "qualifies" }] }); // missing required fields
    ai.queueJSON({ evaluations: [{ candidateIndex: 0, verdict: "qualifies" }] }); // repair attempt also invalid

    await expect(service.findHooks(RAW_THOUGHT)).rejects.toThrow(AIResponseParsingError);
  });
});

describe("classifyRecency", () => {
  const now = new Date("2026-09-24T00:00:00.000Z");

  it("classifies a date within 30 days as CURRENT", () => {
    const publishedAt = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(classifyRecency(publishedAt, now)).toBe("CURRENT");
  });

  it("classifies a date between 31 and 90 days as RECENT", () => {
    const publishedAt = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString();
    expect(classifyRecency(publishedAt, now)).toBe("RECENT");
  });

  it("classifies a date older than 90 days as OLDER", () => {
    const publishedAt = new Date(now.getTime() - 200 * 24 * 60 * 60 * 1000).toISOString();
    expect(classifyRecency(publishedAt, now)).toBe("OLDER");
  });

  it("classifies a missing date as UNKNOWN, never CURRENT", () => {
    expect(classifyRecency(null, now)).toBe("UNKNOWN");
  });

  it("classifies an unparseable date as UNKNOWN", () => {
    expect(classifyRecency("not-a-date", now)).toBe("UNKNOWN");
  });

  it("classifies a future-dated (clock-skew) article as UNKNOWN rather than trusting it", () => {
    const future = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(classifyRecency(future, now)).toBe("UNKNOWN");
  });
});

describe("dedupeArticles", () => {
  it("collapses candidates with the identical googleNewsUrl", () => {
    const url = "https://news.google.com/rss/articles/dupe";
    const result = dedupeArticles([sampleCandidate({ googleNewsUrl: url }), sampleCandidate({ googleNewsUrl: url })]);
    expect(result).toHaveLength(1);
  });

  it("keeps distinct articles", () => {
    const result = dedupeArticles([
      sampleCandidate({ googleNewsUrl: "https://news.google.com/rss/articles/1" }),
      sampleCandidate({ googleNewsUrl: "https://news.google.com/rss/articles/2" }),
    ]);
    expect(result).toHaveLength(2);
  });
});

describe("dedupeEvents", () => {
  function hook(overrides: Partial<IndustryHook>): IndustryHook {
    return {
      title: "Supplier changes preservative system",
      source: "Outlet",
      googleNewsUrl: "https://news.google.com/rss/articles/1",
      canonicalUrl: null,
      publishedAt: null,
      fetchedAt: new Date().toISOString(),
      recency: "UNKNOWN",
      searchQuery: "q",
      hookStrength: 7,
      connectionType: "contextualizes",
      relevanceReason: "r",
      hookConnection: "h",
      ...overrides,
    };
  }

  it("keeps the higher-scoring hook when two near-identical titles describe the same event", () => {
    const weaker = hook({ googleNewsUrl: "https://news.google.com/rss/articles/1", hookStrength: 6.5 });
    const stronger = hook({
      googleNewsUrl: "https://news.google.com/rss/articles/2",
      title: "Supplier Changes Preservative System!",
      hookStrength: 8.2,
    });

    const result = dedupeEvents([weaker, stronger]);
    expect(result).toHaveLength(1);
    expect(result[0]?.hookStrength).toBe(8.2);
  });

  it("keeps genuinely different developments separate", () => {
    const a = hook({ googleNewsUrl: "https://news.google.com/rss/articles/1", title: "Supplier changes preservative system" });
    const b = hook({ googleNewsUrl: "https://news.google.com/rss/articles/2", title: "Regulator opens cosmetic labeling review" });
    expect(dedupeEvents([a, b])).toHaveLength(2);
  });
});
