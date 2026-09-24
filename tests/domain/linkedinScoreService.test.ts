import { describe, expect, it } from "vitest";
import { computeLinkedinScore } from "../../src/domain/linkedinScoreService.js";
import { LinkedinScoreDimensionsSchema } from "../../src/domain/types.js";
import { AIResponseParsingError } from "../../src/utils/errors.js";
import { createTestSetup, samplePassingScoreDimensionsPayload } from "../testUtils/testContainer.js";

const ALL_TENS = {
  professionalRelevance: 10,
  knowledgeValue: 10,
  originalPerspective: 10,
  dwellReadPotential: 10,
  conversationPotential: 10,
  timeliness: 10,
  shareSaveUtility: 10,
  authenticityAntiSlop: 10,
  reasoning: "Exceptional on every factor.",
};

const ALL_ZEROS = {
  ...ALL_TENS,
  professionalRelevance: 0,
  knowledgeValue: 0,
  originalPerspective: 0,
  dwellReadPotential: 0,
  conversationPotential: 0,
  timeliness: 0,
  shareSaveUtility: 0,
  authenticityAntiSlop: 0,
  reasoning: "Nothing here for a professional audience.",
};

describe("computeLinkedinScore", () => {
  it("is deterministic for the same input", () => {
    const dimensions = samplePassingScoreDimensionsPayload();
    expect(computeLinkedinScore(dimensions)).toBe(computeLinkedinScore(dimensions));
  });

  it("averages all-10 dimensions to the maximum, 10.0", () => {
    expect(computeLinkedinScore(ALL_TENS)).toBe(10);
  });

  it("averages all-0 dimensions to the minimum, 0.0", () => {
    expect(computeLinkedinScore(ALL_ZEROS)).toBe(0);
  });

  it("rounds the average to exactly one decimal place", () => {
    const dimensions = {
      ...ALL_TENS,
      professionalRelevance: 7,
      knowledgeValue: 6,
      originalPerspective: 5,
      dwellReadPotential: 6,
      conversationPotential: 4,
      timeliness: 5,
      shareSaveUtility: 5,
      authenticityAntiSlop: 7,
    };
    // (7+6+5+6+4+5+5+7)/8 = 45/8 = 5.625 -> rounds to 5.6
    const score = computeLinkedinScore(dimensions);
    expect(score).toBe(5.6);
    expect(Number(score.toFixed(1))).toBe(score);
  });

  it("never produces a score outside the [0.0, 10.0] range", () => {
    const samples = [ALL_TENS, ALL_ZEROS, samplePassingScoreDimensionsPayload()];
    for (const dimensions of samples) {
      const score = computeLinkedinScore(dimensions);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(10);
    }
  });
});

describe("LinkedinScoreDimensionsSchema", () => {
  it("accepts a well-formed dimensions payload", () => {
    const result = LinkedinScoreDimensionsSchema.safeParse(samplePassingScoreDimensionsPayload());
    expect(result.success).toBe(true);
  });

  it("rejects a dimension score outside the 0-10 range", () => {
    const malformed = { ...samplePassingScoreDimensionsPayload(), knowledgeValue: 11 };
    expect(LinkedinScoreDimensionsSchema.safeParse(malformed).success).toBe(false);
  });

  it("rejects a payload missing the reasoning field", () => {
    const { reasoning: _reasoning, ...malformed } = samplePassingScoreDimensionsPayload();
    expect(LinkedinScoreDimensionsSchema.safeParse(malformed).success).toBe(false);
  });

  it("rejects a non-numeric dimension score", () => {
    const malformed = { ...samplePassingScoreDimensionsPayload(), timeliness: "high" };
    expect(LinkedinScoreDimensionsSchema.safeParse(malformed).success).toBe(false);
  });
});

describe("LinkedinScoreService.score", () => {
  it("validates the AI's dimension scores, derives the aggregate score, and persists it", async () => {
    const { container, ai } = await createTestSetup(1);
    const user = await container.users.getOrCreate("chat-1");
    const idea = await container.ideas.create(user.id, "Raw idea about a formulation tradeoff.");

    ai.queueJSON(samplePassingScoreDimensionsPayload());
    const record = await container.linkedinScoreService.score(idea.id, idea.rawText);

    expect(record.linkedinScore).toBe(computeLinkedinScore(samplePassingScoreDimensionsPayload()));
    expect(record.linkedinScore).toBeGreaterThanOrEqual(0);
    expect(record.linkedinScore).toBeLessThanOrEqual(10);
    expect(Number(record.linkedinScore.toFixed(1))).toBe(record.linkedinScore);
    expect(record.reasoning.length).toBeGreaterThan(0);

    const stored = await container.ideaScores.getLatestForIdea(idea.id);
    expect(stored?.id).toBe(record.id);
    expect(stored?.linkedinScore).toBe(record.linkedinScore);
  });

  it("repairs a malformed first response using the schema's own validation errors", async () => {
    const { container, ai } = await createTestSetup(1);
    const user = await container.users.getOrCreate("chat-1");
    const idea = await container.ideas.create(user.id, "Raw idea.");

    ai.queueJSON({ ...samplePassingScoreDimensionsPayload(), professionalRelevance: "very" });
    ai.queueJSON(samplePassingScoreDimensionsPayload());

    const record = await container.linkedinScoreService.score(idea.id, idea.rawText);

    expect(record.linkedinScore).toBe(computeLinkedinScore(samplePassingScoreDimensionsPayload()));
    expect(ai.jsonCalls).toHaveLength(2);
  });

  it("throws AIResponseParsingError when the AI's output is still malformed after the repair attempt", async () => {
    const { container, ai } = await createTestSetup(1);
    const user = await container.users.getOrCreate("chat-1");
    const idea = await container.ideas.create(user.id, "Raw idea.");

    ai.queueJSON({ ...samplePassingScoreDimensionsPayload(), knowledgeValue: 99 });
    ai.queueJSON({ ...samplePassingScoreDimensionsPayload(), knowledgeValue: 99 });

    await expect(container.linkedinScoreService.score(idea.id, idea.rawText)).rejects.toThrow(
      AIResponseParsingError,
    );
  });
});
