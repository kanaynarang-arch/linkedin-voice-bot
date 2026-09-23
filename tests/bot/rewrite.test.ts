import { describe, expect, it } from "vitest";
import { createTestSetup, sampleVoiceProfilePayload } from "../testUtils/testContainer.js";
import { createFakeCtx } from "../testUtils/fakeCtx.js";
import { handleRewrite } from "../../src/bot/commands/rewrite.js";

const WORTH_NO_RESEARCH = {
  ideaSummary: "Idea summary.",
  worthDeveloping: true,
  reasoning: "Specific and concrete enough.",
  angle: "Direct angle.",
  researchQueries: [],
};

describe("handleRewrite", () => {
  it("errors when given an idea id that doesn't exist, instead of silently rewriting the latest idea", async () => {
    const { container, ai } = await createTestSetup(1);
    const user = await container.users.getOrCreate("chat-1");
    await container.posts.add(user.id, "a post");
    ai.queueJSON(sampleVoiceProfilePayload());
    await container.voiceProfileService.analyze(user.id);

    ai.queueJSON(WORTH_NO_RESEARCH);
    ai.queueText("First draft.");
    const idea = await container.ideaPipeline.captureAndProcess(user.id, "an idea worth writing");
    expect(idea.draft).not.toBeNull();

    const textCallsBefore = ai.textCalls.length;
    const { ctx, replies } = createFakeCtx(container, user.id);
    // 999 doesn't exist - the number could easily be a typo of a real id.
    await handleRewrite(ctx, "999 make it punchier");

    expect(replies[0]).toMatch(/couldn't find idea #999/i);
    // Must not have silently rewritten the latest idea using "999 make it
    // punchier" as the feedback text.
    expect(ai.textCalls.length).toBe(textCallsBefore);
    const latestDraft = await container.drafts.getLatestForIdea(idea.idea.id);
    expect(latestDraft?.content).toBe("First draft.");
  });

  it("errors when given an idea id that belongs to a different user", async () => {
    const { container, ai } = await createTestSetup(1);
    const owner = await container.users.getOrCreate("chat-owner");
    const other = await container.users.getOrCreate("chat-other");
    await container.posts.add(owner.id, "a post");
    ai.queueJSON(sampleVoiceProfilePayload());
    await container.voiceProfileService.analyze(owner.id);

    ai.queueJSON(WORTH_NO_RESEARCH);
    ai.queueText("Owner's draft.");
    const ownerIdea = await container.ideaPipeline.captureAndProcess(owner.id, "owner's idea");

    const { ctx, replies } = createFakeCtx(container, other.id);
    await handleRewrite(ctx, `${ownerIdea.idea.id} steal this feedback`);

    expect(replies[0]).toMatch(new RegExp(`couldn't find idea #${ownerIdea.idea.id}`, "i"));
  });

  it("still rewrites the latest idea when no id is given", async () => {
    const { container, ai } = await createTestSetup(1);
    const user = await container.users.getOrCreate("chat-1");
    await container.posts.add(user.id, "a post");
    ai.queueJSON(sampleVoiceProfilePayload());
    await container.voiceProfileService.analyze(user.id);

    ai.queueJSON(WORTH_NO_RESEARCH);
    ai.queueText("First draft.");
    const idea = await container.ideaPipeline.captureAndProcess(user.id, "an idea worth writing");

    ai.queueText("Punchier draft.");
    const { ctx, replies } = createFakeCtx(container, user.id);
    await handleRewrite(ctx, "make it punchier");

    expect(replies.join("\n")).toContain("Punchier draft.");
    const latestDraft = await container.drafts.getLatestForIdea(idea.idea.id);
    expect(latestDraft?.content).toBe("Punchier draft.");
  });
});
