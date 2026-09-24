import { describe, expect, it } from "vitest";
import { formatPipelineResult } from "../../src/bot/formatting.js";
import type { IdeaPipelineResult } from "../../src/domain/ideaPipeline.js";
import type { DraftRecord, IdeaRecord, IndustryHook, LinkedinScoreRecord } from "../../src/domain/types.js";

function baseIdea(): IdeaRecord {
  return { id: 1, userId: 1, rawText: "raw text", status: "drafted", createdAt: new Date().toISOString() };
}

function baseScore(overrides: Partial<LinkedinScoreRecord> = {}): LinkedinScoreRecord {
  return {
    id: 1,
    ideaId: 1,
    linkedinScore: 7.2,
    professionalRelevance: 7,
    knowledgeValue: 7,
    originalPerspective: 7,
    dwellReadPotential: 7,
    conversationPotential: 7,
    timeliness: 7,
    shareSaveUtility: 7,
    authenticityAntiSlop: 8,
    reasoning: "Specific, concrete, and professionally relevant.",
    model: "test-model",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function baseHook(overrides: Partial<IndustryHook> = {}): IndustryHook {
  return {
    title: "Cosmetic manufacturers face new preservative stability scrutiny",
    source: "Industry Wire",
    googleNewsUrl: "https://news.google.com/rss/articles/sample-1",
    canonicalUrl: null,
    publishedAt: "2026-09-01T00:00:00.000Z",
    fetchedAt: "2026-09-03T00:00:00.000Z",
    recency: "CURRENT",
    searchQuery: "cosmetic preservative supplier",
    hookStrength: 7.5,
    connectionType: "contextualizes",
    relevanceReason: "Direct match.",
    hookConnection: "Recent example of the same issue.",
    ...overrides,
  };
}

function baseDraft(overrides: Partial<DraftRecord> = {}): DraftRecord {
  return {
    id: 1,
    ideaId: 1,
    content: "The finished post text.",
    version: 1,
    feedback: null,
    model: "test-model",
    status: "pending",
    newsHook: null,
    usedNewsHook: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function baseResult(overrides: Partial<IdeaPipelineResult> = {}): IdeaPipelineResult {
  return {
    idea: baseIdea(),
    score: baseScore(),
    passed: true,
    newsStatus: "no_relevant_hook",
    newsHook: null,
    draft: baseDraft(),
    ...overrides,
  };
}

describe("formatPipelineResult", () => {
  it("shows the rejection reason and no draft/angle/news for a rejected idea", () => {
    const output = formatPipelineResult(
      baseResult({
        passed: false,
        score: baseScore({ linkedinScore: 3.2, reasoning: "No concrete claim or example." }),
        newsStatus: "not_searched",
        draft: null,
      }),
    );

    expect(output).toContain("SCORE: 3.2/10.0");
    expect(output).toContain("Not worth developing");
    expect(output).toContain("No concrete claim or example.");
    expect(output).not.toContain("DRAFT");
    expect(output).not.toContain("NEWS SOURCE");
    expect(output).toContain("/write 1");
  });

  it("shows the draft and score for a passing idea with no news", () => {
    const output = formatPipelineResult(baseResult());

    expect(output).toContain("SCORE: 7.2/10.0");
    expect(output).toContain("Worth developing");
    expect(output).toContain("The finished post text.");
    expect(output).not.toContain("NEWS SOURCE");
  });

  it("shows the NEWS SOURCE / verify block only when the draft actually used the hook", () => {
    const output = formatPipelineResult(
      baseResult({
        newsStatus: "relevant_hook_found",
        newsHook: baseHook(),
        draft: baseDraft({ newsHook: baseHook(), usedNewsHook: true }),
      }),
    );

    expect(output).toContain("NEWS SOURCE: Cosmetic manufacturers face new preservative stability scrutiny");
    expect(output).toContain("FROM: Industry Wire");
    expect(output).toContain("LINK: https://news.google.com/rss/articles/sample-1");
    expect(output).toContain("Check this before publishing");
  });

  it("does NOT show the source block when a hook was found but the draft didn't use it", () => {
    const output = formatPipelineResult(
      baseResult({
        newsStatus: "relevant_hook_found",
        newsHook: baseHook(),
        draft: baseDraft({ newsHook: baseHook(), usedNewsHook: false }),
      }),
    );

    expect(output).not.toContain("NEWS SOURCE");
  });

  it("does NOT show the source block when no hook was ever found", () => {
    const output = formatPipelineResult(
      baseResult({ newsStatus: "no_relevant_hook", newsHook: null, draft: baseDraft({ newsHook: null, usedNewsHook: false }) }),
    );

    expect(output).not.toContain("NEWS SOURCE");
  });

  it("does NOT show the source block after a Google News retrieval failure", () => {
    const output = formatPipelineResult(
      baseResult({ newsStatus: "retrieval_failure", newsHook: null, draft: baseDraft({ newsHook: null, usedNewsHook: false }) }),
    );

    expect(output).not.toContain("NEWS SOURCE");
  });

  it("mentions /approve and /reject in the review prompt for a drafted idea", () => {
    const output = formatPipelineResult(baseResult());
    expect(output).toContain("/approve 1");
    expect(output).toContain("/reject 1");
  });
});
