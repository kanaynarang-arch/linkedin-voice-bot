import { describe, expect, it, vi, afterEach } from "vitest";
import { Telegram } from "telegraf";
import type { Update } from "telegraf/types";
import { createBot } from "../../src/bot/index.js";
import { createTestSetup, sampleVoiceProfilePayload, sampleWeakScoreDimensionsPayload } from "../testUtils/testContainer.js";

const ALLOWED_CHAT_ID = "-1003992734904";

function channelPostUpdate(updateId: number, text: string): Update {
  return {
    update_id: updateId,
    channel_post: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: -1003992734904, type: "channel", title: "Test Channel" },
      text,
    },
  } as Update;
}

function mockOutgoingApi() {
  return vi.spyOn(Telegram.prototype, "callApi").mockResolvedValue({} as never);
}

/**
 * Broadcast channels deliver posts as `channel_post` updates, not
 * `message` - Telegraf's bot.command()/bot.on(message(...)) never match
 * those, so a bot that only wires message handlers silently does nothing
 * when posted to. These tests drive real Update objects through the real
 * Telegraf routing (via bot.handleUpdate) to catch that class of bug.
 *
 * Telegraf constructs a *new* Telegram instance per update inside
 * handleUpdate (not bot.telegram), so outgoing API calls must be stubbed
 * on Telegram.prototype, not on a specific instance.
 */
describe("createBot - channel_post routing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("responds to a known command sent as a channel post", async () => {
    const callApi = mockOutgoingApi();
    const { container } = await createTestSetup(1);
    const bot = createBot("fake-token", container, ALLOWED_CHAT_ID);

    await bot.handleUpdate(channelPostUpdate(1, "/help"));

    const sendMessageCalls = callApi.mock.calls.filter(([method]) => method === "sendMessage");
    expect(sendMessageCalls.length).toBeGreaterThan(0);
    expect(sendMessageCalls[0]?.[1]).toMatchObject({ chat_id: -1003992734904 });
  });

  it("captures a raw idea sent as a channel post and evaluates it", async () => {
    const callApi = mockOutgoingApi();
    const { container, ai } = await createTestSetup(1);
    const user = await container.users.getOrCreate(ALLOWED_CHAT_ID);
    await container.posts.add(user.id, "a post");
    ai.queueJSON(sampleVoiceProfilePayload());
    await container.voiceProfileService.analyze(user.id);
    ai.queueJSON(sampleWeakScoreDimensionsPayload());

    const bot = createBot("fake-token", container, ALLOWED_CHAT_ID);

    await bot.handleUpdate(channelPostUpdate(2, "Customers keep asking why we don't use X"));

    const ideas = await container.ideas.listByUser(user.id);
    expect(ideas).toHaveLength(1);
    expect(ideas[0]?.rawText).toBe("Customers keep asking why we don't use X");

    const sendMessageCalls = callApi.mock.calls.filter(([method]) => method === "sendMessage");
    expect(sendMessageCalls.length).toBeGreaterThan(0);
  });

  it("drops updates from a chat other than the allowed one", async () => {
    const callApi = mockOutgoingApi();
    const { container } = await createTestSetup(1);
    const bot = createBot("fake-token", container, ALLOWED_CHAT_ID);

    const update = channelPostUpdate(3, "/help");
    (update as { channel_post: { chat: { id: number } } }).channel_post.chat.id = -999;
    await bot.handleUpdate(update);

    expect(callApi.mock.calls.filter(([method]) => method === "sendMessage")).toHaveLength(0);
  });
});
