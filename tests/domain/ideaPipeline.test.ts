import { describe, expect, it, beforeEach } from "vitest";
import { createTestSetup, sampleVoiceProfilePayload } from "../testUtils/testContainer.js";
import { MissingVoiceProfileError, NotFoundError, ValidationError } from "../../src/utils/errors.js";
import type { Container } from "../../src/container.js";
import type { FakeAIProvider } from "../testUtils/fakeAIProvider.js";

async function withVoiceProfile(container: Container, ai: FakeAIProvider, userId: number, minPosts = 1) {
  for (let i = 0; i < minPosts; i++) {
    container.posts.add(userId, `Sample post number ${i}.`);
  }
  ai.queueJSON(sampleVoiceProfilePayload());
  await container.voiceProfileService.analyze(userId);
}

const NOT_WORTH = {
  ideaSummary: "A vague complaint about competitors with no specifics.",
  worthDeveloping: false,
  reasoning: "There's no concrete claim, example, or data point to build a post around yet.",
  angle: null,
  researchQueries: [],
};

const WORTH_WITH_RESEARCH = {
  ideaSummary: "Customers keep asking why the brand avoids a common but controversial ingredient.",
  worthDeveloping: true,
  reasoning: "This is a recurring, specific question with a real technical answer behind it.",
  angle: "Answer the question directly using the actual formulation tradeoff, not a marketing dodge.",
  researchQueries: ["current regulatory status of the ingredient in 2026"],
};

const WORTH_NO_RESEARCH = {
  ...WORTH_WITH_RESEARCH,
  researchQueries: [],
};

describe("IdeaPipelineService", () => {
  let container: Container;
  let ai: FakeAIProvider;

  beforeEach(() => {
    ({ container, ai } = createTestSetup(1));
  });

  it("requires an active voice profile before processing an idea", async () => {
    const user = container.users.getOrCreate("chat-1");
    await expect(container.ideaPipeline.captureAndProcess(user.id, "some idea")).rejects.toThrow(
      MissingVoiceProfileError,
    );
  });

  it("rejects empty idea text", async () => {
    const user = container.users.getOrCreate("chat-1");
    await withVoiceProfile(container, ai, user.id);
    await expect(container.ideaPipeline.captureAndProcess(user.id, "   ")).rejects.toThrow(ValidationError);
  });

  it("stores a not-worth-developing analysis without researching or drafting", async () => {
    const user = container.users.getOrCreate("chat-1");
    await withVoiceProfile(container, ai, user.id);

    ai.queueJSON(NOT_WORTH);
    const result = await container.ideaPipeline.captureAndProcess(user.id, "vague complaint");

    expect(result.analysis.worthDeveloping).toBe(false);
    expect(result.draft).toBeNull();
    expect(result.research).toBeNull();
    expect(ai.researchCalls).toHaveLength(0);
    expect(container.ideas.getById(result.idea.id)?.status).toBe("not_worth_developing");
  });

  it("researches, drafts, and marks the idea drafted when worth developing with a research query", async () => {
    const user = container.users.getOrCreate("chat-1");
    await withVoiceProfile(container, ai, user.id);

    ai.queueJSON(WORTH_WITH_RESEARCH);
    ai.queueResearch({
      used: true,
      summary: "Regulators still permit the ingredient below a concentration threshold.",
      sources: [{ title: "Regulatory Bulletin", url: "https://example.com/bulletin" }],
    });
    ai.queueText("Customers keep asking. Here's the honest answer.");

    const result = await container.ideaPipeline.captureAndProcess(user.id, "Customers keep asking why...");

    expect(ai.researchCalls).toEqual(["current regulatory status of the ingredient in 2026"]);
    expect(result.analysis.worthDeveloping).toBe(true);
    expect(result.research?.used).toBe(true);
    expect(result.draft?.content).toContain("honest answer");
    expect(container.ideas.getById(result.idea.id)?.status).toBe("drafted");
  });

  it("skips research when no queries are suggested", async () => {
    const user = container.users.getOrCreate("chat-1");
    await withVoiceProfile(container, ai, user.id);

    ai.queueJSON(WORTH_NO_RESEARCH);
    ai.queueText("A draft with no external research needed.");

    const result = await container.ideaPipeline.captureAndProcess(user.id, "an idea");

    expect(ai.researchCalls).toHaveLength(0);
    expect(result.research).toBeNull();
    expect(result.draft).not.toBeNull();
  });

  it("finds an exact-duplicate idea for the same user", async () => {
    const user = container.users.getOrCreate("chat-1");
    await withVoiceProfile(container, ai, user.id);
    ai.queueJSON(NOT_WORTH);
    const first = await container.ideaPipeline.captureAndProcess(user.id, "the same idea text");

    const duplicate = container.ideaPipeline.findDuplicate(user.id, "the same idea text");
    expect(duplicate?.id).toBe(first.idea.id);
  });

  it("throws NotFoundError when forcing a draft for an idea with no analysis", async () => {
    const user = container.users.getOrCreate("chat-1");
    await withVoiceProfile(container, ai, user.id);
    const idea = container.ideas.create(user.id, "an unanalyzed idea");

    await expect(container.ideaPipeline.draftForExistingIdea(user.id, idea.id)).rejects.toThrow(NotFoundError);
  });

  it("forces a draft for an idea previously marked not worth developing", async () => {
    const user = container.users.getOrCreate("chat-1");
    await withVoiceProfile(container, ai, user.id);

    ai.queueJSON(NOT_WORTH);
    const captured = await container.ideaPipeline.captureAndProcess(user.id, "a thin idea");
    expect(captured.draft).toBeNull();

    ai.queueText("A forced draft anyway.");
    const forced = await container.ideaPipeline.draftForExistingIdea(user.id, captured.idea.id);

    expect(forced.draft?.content).toBe("A forced draft anyway.");
    expect(container.ideas.getById(captured.idea.id)?.status).toBe("drafted");
  });

  it("rewrites a draft using feedback and increments the version", async () => {
    const user = container.users.getOrCreate("chat-1");
    await withVoiceProfile(container, ai, user.id);

    ai.queueJSON(WORTH_NO_RESEARCH);
    ai.queueText("First draft version.");
    const captured = await container.ideaPipeline.captureAndProcess(user.id, "an idea worth writing");

    ai.queueText("Second, punchier draft version.");
    const revised = await container.ideaPipeline.rewriteDraft(user.id, captured.idea.id, "make it punchier");

    expect(revised.version).toBe(2);
    expect(revised.feedback).toBe("make it punchier");
    expect(revised.content).toBe("Second, punchier draft version.");
  });

  it("throws NotFoundError when rewriting an idea with no existing draft", async () => {
    const user = container.users.getOrCreate("chat-1");
    await withVoiceProfile(container, ai, user.id);
    ai.queueJSON(NOT_WORTH);
    const captured = await container.ideaPipeline.captureAndProcess(user.id, "no draft yet");

    await expect(
      container.ideaPipeline.rewriteDraft(user.id, captured.idea.id, "fix it"),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects empty rewrite feedback", async () => {
    const user = container.users.getOrCreate("chat-1");
    await withVoiceProfile(container, ai, user.id);
    ai.queueJSON(WORTH_NO_RESEARCH);
    ai.queueText("Draft.");
    const captured = await container.ideaPipeline.captureAndProcess(user.id, "an idea");

    await expect(container.ideaPipeline.rewriteDraft(user.id, captured.idea.id, "   ")).rejects.toThrow(
      ValidationError,
    );
  });
});
