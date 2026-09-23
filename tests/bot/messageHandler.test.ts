import { describe, expect, it } from "vitest";
import { createTestSetup, sampleVoiceProfilePayload } from "../testUtils/testContainer.js";
import { createFakeCtx } from "../testUtils/fakeCtx.js";
import { handleTextMessage, handleNonTextMessage } from "../../src/bot/handlers/messageHandler.js";
import { MissingVoiceProfileError } from "../../src/utils/errors.js";

const WORTH_NO_RESEARCH = {
  ideaSummary: "Idea summary.",
  worthDeveloping: true,
  reasoning: "Specific and concrete enough.",
  angle: "Direct angle.",
  researchQueries: [],
};

describe("handleTextMessage", () => {
  it("asks for content when the message is empty", async () => {
    const { container } = await createTestSetup(1);
    const user = await container.users.getOrCreate("chat-1");
    const { ctx, replies } = createFakeCtx(container, user.id);

    await handleTextMessage(ctx, "   ");

    expect(replies[0]).toMatch(/looks empty/i);
    expect(await container.ideas.listByUser(user.id)).toHaveLength(0);
  });

  it("rejects unrecognized commands without treating them as an idea", async () => {
    const { container } = await createTestSetup(1);
    const user = await container.users.getOrCreate("chat-1");
    const { ctx, replies } = createFakeCtx(container, user.id);

    await handleTextMessage(ctx, "/notarealcommand");

    expect(replies[0]).toMatch(/Unknown command/i);
    expect(await container.ideas.listByUser(user.id)).toHaveLength(0);
  });

  it("routes messages to posts collection while that flow is active", async () => {
    const { container } = await createTestSetup(1);
    const user = await container.users.getOrCreate("chat-1");
    await container.conversationState.set(user.id, "collecting_posts", { addedCount: 0 });
    const { ctx, replies } = createFakeCtx(container, user.id);

    await handleTextMessage(ctx, "A post about formulation science.");

    expect(await container.posts.countByUser(user.id)).toBe(1);
    expect(replies[0]).toMatch(/Added 1 post/i);
    expect(await container.ideas.listByUser(user.id)).toHaveLength(0);
  });

  it("propagates MissingVoiceProfileError for a fresh idea with no profile yet", async () => {
    const { container } = await createTestSetup(1);
    const user = await container.users.getOrCreate("chat-1");
    const { ctx } = createFakeCtx(container, user.id);

    await expect(handleTextMessage(ctx, "a brand new idea")).rejects.toThrow(MissingVoiceProfileError);
  });

  it("resurfaces a previous analysis for a duplicate idea instead of calling the AI again", async () => {
    const { container, ai } = await createTestSetup(1);
    const user = await container.users.getOrCreate("chat-1");
    await container.posts.add(user.id, "a post");
    ai.queueJSON(sampleVoiceProfilePayload());
    await container.voiceProfileService.analyze(user.id);

    ai.queueJSON(WORTH_NO_RESEARCH);
    ai.queueText("The first draft.");
    const { ctx: ctx1 } = createFakeCtx(container, user.id);
    await handleTextMessage(ctx1, "the exact same idea text");

    const jsonCallsBefore = ai.jsonCalls.length;
    const { ctx: ctx2, replies } = createFakeCtx(container, user.id);
    await handleTextMessage(ctx2, "the exact same idea text");

    expect(ai.jsonCalls.length).toBe(jsonCallsBefore);
    expect(replies.join("\n")).toMatch(/already sent this idea/i);
    expect(await container.ideas.listByUser(user.id)).toHaveLength(1);
  });

  it("retries analysis when resending text whose first attempt never got analyzed", async () => {
    // Simulates a real production incident: the first attempt's AI call
    // failed after the idea row was already created, leaving it with no
    // analysis. Resending the identical text must actually retry - not
    // repeat "already sent, run /write" forever, since /write only drafts
    // from an existing analysis and can never produce one from scratch.
    const { container, ai } = await createTestSetup(1);
    const user = await container.users.getOrCreate("chat-1");
    await container.posts.add(user.id, "a post");
    ai.queueJSON(sampleVoiceProfilePayload());
    await container.voiceProfileService.analyze(user.id);

    const orphanedIdea = await container.ideas.create(user.id, "an idea whose analysis failed");
    expect(await container.analyses.getLatestForIdea(orphanedIdea.id)).toBeNull();

    const jsonCallsBefore = ai.jsonCalls.length;
    ai.queueJSON(WORTH_NO_RESEARCH);
    ai.queueText("Draft after retry.");
    const { ctx, replies } = createFakeCtx(container, user.id);
    await handleTextMessage(ctx, "an idea whose analysis failed");

    expect(ai.jsonCalls.length).toBe(jsonCallsBefore + 1);
    expect(replies.join("\n")).not.toMatch(/already sent this idea/i);
    expect(replies.join("\n")).toContain("Draft after retry.");

    const ideas = await container.ideas.listByUser(user.id);
    expect(ideas).toHaveLength(2);
    const newIdea = ideas.find((i) => i.id !== orphanedIdea.id);
    expect(newIdea && (await container.analyses.getLatestForIdea(newIdea.id))).not.toBeNull();
  });
});

describe("handleNonTextMessage", () => {
  it("tells the user only text is supported", async () => {
    const { container } = await createTestSetup(1);
    const user = await container.users.getOrCreate("chat-1");
    const { ctx, replies } = createFakeCtx(container, user.id);

    await handleNonTextMessage(ctx);

    expect(replies[0]).toMatch(/only work with text/i);
  });
});
