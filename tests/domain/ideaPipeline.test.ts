import { describe, expect, it, beforeEach } from "vitest";
import {
  createTestSetup,
  sampleVoiceProfilePayload,
  samplePassingScoreDimensionsPayload,
  sampleWeakScoreDimensionsPayload,
  uniformScoreDimensionsPayload,
} from "../testUtils/testContainer.js";
import { sampleCandidate } from "../testUtils/fakeGoogleNewsClient.js";
import { MissingVoiceProfileError, NotFoundError, ValidationError } from "../../src/utils/errors.js";
import type { Container } from "../../src/container.js";
import type { FakeAIProvider } from "../testUtils/fakeAIProvider.js";
import type { FakeGoogleNewsClient } from "../testUtils/fakeGoogleNewsClient.js";

async function withVoiceProfile(container: Container, ai: FakeAIProvider, userId: number, minPosts = 1) {
  for (let i = 0; i < minPosts; i++) {
    await container.posts.add(userId, `Sample post number ${i}.`);
  }
  ai.queueJSON(sampleVoiceProfilePayload());
  await container.voiceProfileService.analyze(userId);
}

const SIMPLE_PLAN = {
  concepts: ["preservative systems"],
  queries: [{ query: "cosmetic preservative supplier change", concept: "preservative systems", pass: 1 }],
};

function draftResponse(text: string) {
  return { draft: text };
}

function qualifyingEvaluation(candidateIndex = 0, hookStrength = 7.5) {
  return {
    evaluations: [
      {
        candidateIndex,
        verdict: "qualifies",
        hookStrength,
        connectionType: "contextualizes",
        relevanceReason: "Directly concerns a supplier-driven formulation change.",
        hookConnection: "Recent example of a supplier changing a preservative system without notice.",
      },
    ],
  };
}

describe("IdeaPipelineService", () => {
  let container: Container;
  let ai: FakeAIProvider;
  let newsClient: FakeGoogleNewsClient;

  beforeEach(async () => {
    ({ container, ai, newsClient } = await createTestSetup(1));
  });

  it("requires an active voice profile before processing an idea", async () => {
    const user = await container.users.getOrCreate("chat-1");
    await expect(container.ideaPipeline.captureAndProcess(user.id, "some idea")).rejects.toThrow(
      MissingVoiceProfileError,
    );
  });

  it("rejects empty idea text", async () => {
    const user = await container.users.getOrCreate("chat-1");
    await withVoiceProfile(container, ai, user.id);
    await expect(container.ideaPipeline.captureAndProcess(user.id, "   ")).rejects.toThrow(ValidationError);
  });

  it("stops before Google News and drafting when the score is below the gate", async () => {
    const user = await container.users.getOrCreate("chat-1");
    await withVoiceProfile(container, ai, user.id);
    const jsonCallsBefore = ai.jsonCalls.length;

    ai.queueJSON(sampleWeakScoreDimensionsPayload());
    const result = await container.ideaPipeline.captureAndProcess(user.id, "Call supplier tomorrow.");

    expect(result.passed).toBe(false);
    expect(result.score.linkedinScore).toBeLessThan(6.0);
    expect(result.newsStatus).toBe("not_searched");
    expect(result.newsHook).toBeNull();
    expect(result.draft).toBeNull();
    expect(newsClient.calls).toHaveLength(0);
    // Only the scoring call happened - no query-plan, no evaluation, no drafting call.
    expect(ai.jsonCalls.length).toBe(jsonCallsBefore + 1);
    expect((await container.ideas.getById(result.idea.id))?.status).toBe("not_worth_developing");
  });

  it("passes the gate, finds no relevant news, and drafts without a hook", async () => {
    const user = await container.users.getOrCreate("chat-1");
    await withVoiceProfile(container, ai, user.id);

    ai.queueJSON(samplePassingScoreDimensionsPayload());
    ai.queueJSON(SIMPLE_PLAN);
    // newsClient returns [] for any un-queued query, so no evaluation call happens.
    ai.queueJSON(draftResponse("A grounded draft with no external news."));

    const result = await container.ideaPipeline.captureAndProcess(user.id, "Supplier changed the blend.");

    expect(result.passed).toBe(true);
    expect(result.newsStatus).toBe("no_relevant_hook");
    expect(result.newsHook).toBeNull();
    expect(result.draft?.content).toBe("A grounded draft with no external news.");
    expect(result.draft?.newsHook).toBeNull();
    expect(result.draft?.usedNewsHook).toBe(false);
    expect((await container.ideas.getById(result.idea.id))?.status).toBe("drafted");
  });

  it("passes the gate, finds a relevant hook, and drafts using it", async () => {
    const user = await container.users.getOrCreate("chat-1");
    await withVoiceProfile(container, ai, user.id);

    ai.queueJSON(samplePassingScoreDimensionsPayload());
    ai.queueJSON(SIMPLE_PLAN);
    newsClient.queueResult(SIMPLE_PLAN.queries[0]!.query, [sampleCandidate()]);
    ai.queueJSON(qualifyingEvaluation());
    ai.queueJSON(draftResponse("A draft that references the recent industry news."));

    const result = await container.ideaPipeline.captureAndProcess(user.id, "Supplier changed the blend.");

    expect(result.newsStatus).toBe("relevant_hook_found");
    expect(result.newsHook?.title).toBe(sampleCandidate().title);
    expect(result.draft?.newsHook?.title).toBe(sampleCandidate().title);
    expect(result.draft?.usedNewsHook).toBe(true);
  });

  it("marks the hook as used whenever one was found - using it is mandatory, not the model's choice", async () => {
    const user = await container.users.getOrCreate("chat-1");
    await withVoiceProfile(container, ai, user.id);

    ai.queueJSON(samplePassingScoreDimensionsPayload());
    ai.queueJSON(SIMPLE_PLAN);
    newsClient.queueResult(SIMPLE_PLAN.queries[0]!.query, [sampleCandidate()]);
    ai.queueJSON(qualifyingEvaluation());
    // The drafting response no longer reports whether it used the hook at
    // all (there's no field for it) - usedNewsHook must still end up true.
    ai.queueJSON(draftResponse("A draft that incorporates the news hook."));

    const result = await container.ideaPipeline.captureAndProcess(user.id, "Supplier changed the blend.");

    expect(result.newsStatus).toBe("relevant_hook_found");
    expect(result.draft?.newsHook).not.toBeNull();
    expect(result.draft?.usedNewsHook).toBe(true);
  });

  it("drafts without news, not as a pipeline failure, when Google News retrieval fails", async () => {
    const user = await container.users.getOrCreate("chat-1");
    await withVoiceProfile(container, ai, user.id);

    ai.queueJSON(samplePassingScoreDimensionsPayload());
    ai.queueJSON(SIMPLE_PLAN);
    newsClient.queueFailure(SIMPLE_PLAN.queries[0]!.query, new Error("network down"));
    ai.queueJSON(draftResponse("Draft written without any external context."));

    const result = await container.ideaPipeline.captureAndProcess(user.id, "Supplier changed the blend.");

    expect(result.passed).toBe(true);
    expect(result.newsStatus).toBe("retrieval_failure");
    expect(result.newsHook).toBeNull();
    expect(result.draft?.content).toBe("Draft written without any external context.");
  });

  it("finds an exact-duplicate idea for the same user", async () => {
    const user = await container.users.getOrCreate("chat-1");
    await withVoiceProfile(container, ai, user.id);
    ai.queueJSON(sampleWeakScoreDimensionsPayload());
    const first = await container.ideaPipeline.captureAndProcess(user.id, "the same idea text");

    const duplicate = await container.ideaPipeline.findDuplicate(user.id, "the same idea text");
    expect(duplicate?.id).toBe(first.idea.id);
  });

  it("throws NotFoundError when forcing a draft for an idea with no score", async () => {
    const user = await container.users.getOrCreate("chat-1");
    await withVoiceProfile(container, ai, user.id);
    const idea = await container.ideas.create(user.id, "an unscored idea");

    await expect(container.ideaPipeline.draftForExistingIdea(user.id, idea.id)).rejects.toThrow(NotFoundError);
  });

  it("forces a draft for an idea previously rejected by the score gate, without re-scoring", async () => {
    const user = await container.users.getOrCreate("chat-1");
    await withVoiceProfile(container, ai, user.id);

    ai.queueJSON(sampleWeakScoreDimensionsPayload());
    const captured = await container.ideaPipeline.captureAndProcess(user.id, "a thin idea");
    expect(captured.draft).toBeNull();

    const jsonCallsBefore = ai.jsonCalls.length;
    ai.queueJSON(SIMPLE_PLAN);
    ai.queueJSON(draftResponse("A forced draft anyway."));
    const forced = await container.ideaPipeline.draftForExistingIdea(user.id, captured.idea.id);

    expect(forced.draft?.content).toBe("A forced draft anyway.");
    expect(forced.score.linkedinScore).toBe(captured.score.linkedinScore);
    // No second scoring call - just the query-plan and drafting calls.
    expect(ai.jsonCalls.length).toBe(jsonCallsBefore + 2);
    expect((await container.ideas.getById(captured.idea.id))?.status).toBe("drafted");
  });

  it("rewrites a draft using feedback and increments the version, reusing the previous hook", async () => {
    const user = await container.users.getOrCreate("chat-1");
    await withVoiceProfile(container, ai, user.id);

    ai.queueJSON(samplePassingScoreDimensionsPayload());
    ai.queueJSON(SIMPLE_PLAN);
    newsClient.queueResult(SIMPLE_PLAN.queries[0]!.query, [sampleCandidate()]);
    ai.queueJSON(qualifyingEvaluation());
    ai.queueJSON(draftResponse("First draft version."));
    const captured = await container.ideaPipeline.captureAndProcess(user.id, "an idea worth writing");

    // Rewriting must not re-run Google News - only one drafting call.
    const newsCallsBefore = newsClient.calls.length;
    ai.queueJSON(draftResponse("Second, punchier draft version."));
    const revised = await container.ideaPipeline.rewriteDraft(user.id, captured.idea.id, "make it punchier");

    expect(revised.version).toBe(2);
    expect(revised.feedback).toBe("make it punchier");
    expect(revised.content).toBe("Second, punchier draft version.");
    expect(revised.newsHook?.title).toBe(sampleCandidate().title);
    expect(newsClient.calls.length).toBe(newsCallsBefore);
  });

  it("throws NotFoundError when rewriting an idea with no existing draft", async () => {
    const user = await container.users.getOrCreate("chat-1");
    await withVoiceProfile(container, ai, user.id);
    ai.queueJSON(sampleWeakScoreDimensionsPayload());
    const captured = await container.ideaPipeline.captureAndProcess(user.id, "no draft yet");

    await expect(
      container.ideaPipeline.rewriteDraft(user.id, captured.idea.id, "fix it"),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects empty rewrite feedback", async () => {
    const user = await container.users.getOrCreate("chat-1");
    await withVoiceProfile(container, ai, user.id);
    ai.queueJSON(samplePassingScoreDimensionsPayload());
    ai.queueJSON(SIMPLE_PLAN);
    ai.queueJSON(draftResponse("Draft."));
    const captured = await container.ideaPipeline.captureAndProcess(user.id, "an idea");

    await expect(container.ideaPipeline.rewriteDraft(user.id, captured.idea.id, "   ")).rejects.toThrow(
      ValidationError,
    );
  });

  describe("score gate boundary", () => {
    const cases: Array<[number, boolean]> = [
      [5.9, false],
      [6.0, true],
      [6.1, true],
      [10.0, true],
      [0.0, false],
    ];

    for (const [value, expectedPass] of cases) {
      it(`score ${value} -> ${expectedPass ? "PASS" : "REJECT"}`, async () => {
        const user = await container.users.getOrCreate(`chat-${value}`);
        await withVoiceProfile(container, ai, user.id);

        ai.queueJSON(uniformScoreDimensionsPayload(value));
        if (expectedPass) {
          ai.queueJSON(SIMPLE_PLAN);
          ai.queueJSON(draftResponse("draft"));
        }

        const result = await container.ideaPipeline.captureAndProcess(user.id, "a boundary-testing idea");
        expect(result.passed).toBe(expectedPass);
        expect(result.score.linkedinScore).toBe(value);
      });
    }
  });

  describe("invalid scoring output cannot bypass the gate", () => {
    it("rejects a score above 10 even after a repair attempt, never letting it silently pass", async () => {
      const user = await container.users.getOrCreate("chat-1");
      await withVoiceProfile(container, ai, user.id);

      const malformed = { ...uniformScoreDimensionsPayload(9), knowledgeValue: 10.1 };
      ai.queueJSON(malformed);
      ai.queueJSON(malformed); // repair attempt also invalid

      await expect(container.ideaPipeline.captureAndProcess(user.id, "an idea")).rejects.toThrow();
      expect(newsClient.calls).toHaveLength(0);
    });

    it("rejects a negative score, never letting it silently pass", async () => {
      const user = await container.users.getOrCreate("chat-1");
      await withVoiceProfile(container, ai, user.id);

      const malformed = { ...uniformScoreDimensionsPayload(5), professionalRelevance: -1 };
      ai.queueJSON(malformed);
      ai.queueJSON(malformed);

      await expect(container.ideaPipeline.captureAndProcess(user.id, "an idea")).rejects.toThrow();
    });

    it("rejects a string score, never letting it silently pass", async () => {
      const user = await container.users.getOrCreate("chat-1");
      await withVoiceProfile(container, ai, user.id);

      const malformed = { ...uniformScoreDimensionsPayload(5), timeliness: "six" };
      ai.queueJSON(malformed);
      ai.queueJSON(malformed);

      await expect(container.ideaPipeline.captureAndProcess(user.id, "an idea")).rejects.toThrow();
    });

    it("rejects a payload with a missing score field, never letting it silently pass", async () => {
      const user = await container.users.getOrCreate("chat-1");
      await withVoiceProfile(container, ai, user.id);

      const { timeliness: _omit, ...malformed } = uniformScoreDimensionsPayload(5);
      ai.queueJSON(malformed);
      ai.queueJSON(malformed);

      await expect(container.ideaPipeline.captureAndProcess(user.id, "an idea")).rejects.toThrow();
    });

    it("propagates a scoring provider failure without calling Google News or drafting", async () => {
      const user = await container.users.getOrCreate("chat-1");
      await withVoiceProfile(container, ai, user.id);
      // Nothing queued for the scoring call - FakeAIProvider throws.

      await expect(container.ideaPipeline.captureAndProcess(user.id, "an idea")).rejects.toThrow();
      expect(newsClient.calls).toHaveLength(0);
    });
  });

  it("never sends the voice profile to the scoring call", async () => {
    const user = await container.users.getOrCreate("chat-1");
    await withVoiceProfile(container, ai, user.id);

    ai.queueJSON(sampleWeakScoreDimensionsPayload());
    await container.ideaPipeline.captureAndProcess(user.id, "an idea");

    const scoringCall = ai.jsonCalls[ai.jsonCalls.length - 1]!;
    const voiceProfile = sampleVoiceProfilePayload();
    expect(scoringCall.systemInstruction).not.toContain(voiceProfile.authorEssence);
    expect(scoringCall.prompt).not.toContain(voiceProfile.authorEssence);
  });
});
