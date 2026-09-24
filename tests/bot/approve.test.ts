import { describe, expect, it } from "vitest";
import { createTestSetup, sampleVoiceProfilePayload, samplePassingScoreDimensionsPayload } from "../testUtils/testContainer.js";
import { createFakeCtx } from "../testUtils/fakeCtx.js";
import { handleApprove, handleReject } from "../../src/bot/commands/approve.js";

const SIMPLE_PLAN = {
  concepts: ["preservative systems"],
  queries: [{ query: "cosmetic preservative supplier change", concept: "preservative systems", pass: 1 }],
};

function draftResponse(text: string) {
  return { draft: text };
}

async function captureADraft(container: import("../../src/container.js").Container, ai: import("../testUtils/fakeAIProvider.js").FakeAIProvider, userId: number, text: string) {
  ai.queueJSON(samplePassingScoreDimensionsPayload());
  ai.queueJSON(SIMPLE_PLAN);
  ai.queueJSON(draftResponse(text));
  return container.ideaPipeline.captureAndProcess(userId, `an idea about ${text}`);
}

describe("handleApprove / handleReject", () => {
  it("records approval on the latest draft when no id is given, and never touches LinkedIn", async () => {
    const { container, ai } = await createTestSetup(1);
    const user = await container.users.getOrCreate("chat-1");
    await container.posts.add(user.id, "a post");
    ai.queueJSON(sampleVoiceProfilePayload());
    await container.voiceProfileService.analyze(user.id);

    const result = await captureADraft(container, ai, user.id, "draft one");
    expect(result.draft?.status).toBe("pending");

    const { ctx, replies } = createFakeCtx(container, user.id);
    await handleApprove(ctx, "");

    expect(replies[0]).toMatch(/approved/i);
    expect(replies[0]).toMatch(/publishing.*up to you/i);
    const stored = await container.drafts.getLatestForIdea(result.idea.id);
    expect(stored?.status).toBe("approved");
  });

  it("records rejection on the latest draft, keeping it stored", async () => {
    const { container, ai } = await createTestSetup(1);
    const user = await container.users.getOrCreate("chat-1");
    await container.posts.add(user.id, "a post");
    ai.queueJSON(sampleVoiceProfilePayload());
    await container.voiceProfileService.analyze(user.id);

    const result = await captureADraft(container, ai, user.id, "draft two");

    const { ctx, replies } = createFakeCtx(container, user.id);
    await handleReject(ctx, "");

    expect(replies[0]).toMatch(/rejected/i);
    const stored = await container.drafts.getLatestForIdea(result.idea.id);
    expect(stored?.status).toBe("rejected");
    expect(stored?.content).toBe(result.draft?.content);
  });

  it("targets a specific idea's draft when an id is given", async () => {
    const { container, ai } = await createTestSetup(1);
    const user = await container.users.getOrCreate("chat-1");
    await container.posts.add(user.id, "a post");
    ai.queueJSON(sampleVoiceProfilePayload());
    await container.voiceProfileService.analyze(user.id);

    const first = await captureADraft(container, ai, user.id, "first draft");
    const second = await captureADraft(container, ai, user.id, "second draft");

    const { ctx, replies } = createFakeCtx(container, user.id);
    await handleApprove(ctx, String(first.idea.id));

    expect(replies[0]).toMatch(/approved/i);
    expect((await container.drafts.getLatestForIdea(first.idea.id))?.status).toBe("approved");
    expect((await container.drafts.getLatestForIdea(second.idea.id))?.status).toBe("pending");
  });

  it("errors when given an idea id that belongs to a different user", async () => {
    const { container, ai } = await createTestSetup(1);
    const owner = await container.users.getOrCreate("chat-owner");
    const other = await container.users.getOrCreate("chat-other");
    await container.posts.add(owner.id, "a post");
    ai.queueJSON(sampleVoiceProfilePayload());
    await container.voiceProfileService.analyze(owner.id);

    const ownerResult = await captureADraft(container, ai, owner.id, "owner draft");

    const { ctx } = createFakeCtx(container, other.id);
    await expect(handleApprove(ctx, String(ownerResult.idea.id))).rejects.toThrow();
    expect((await container.drafts.getLatestForIdea(ownerResult.idea.id))?.status).toBe("pending");
  });

  it("tells the user when there are no drafts yet", async () => {
    const { container } = await createTestSetup(1);
    const user = await container.users.getOrCreate("chat-1");
    const { ctx, replies } = createFakeCtx(container, user.id);

    await handleApprove(ctx, "");

    expect(replies[0]).toMatch(/don't have any drafts/i);
  });
});
