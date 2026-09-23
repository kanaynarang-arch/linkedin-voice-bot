import { describe, expect, it, vi, afterEach } from "vitest";
import { Telegram } from "telegraf";
import type { Update } from "telegraf/types";
import { createBot } from "../../src/bot/index.js";
import { createTestSetup } from "../testUtils/testContainer.js";

const ALLOWED_CHAT_ID = "1237286731";

function messageUpdate(updateId: number, text: string): Update {
  // Real Telegram clients attach a bot_command entity for any message
  // starting with "/" - Telegraf's bot.command() matcher requires it to
  // recognize the message as a command at all.
  const commandLength = text.startsWith("/") ? (text.split(/\s/)[0]?.length ?? 0) : 0;
  const entities = commandLength > 0 ? [{ offset: 0, length: commandLength, type: "bot_command" as const }] : undefined;

  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 1237286731, type: "private", first_name: "Test" },
      from: { id: 1237286731, is_bot: false, first_name: "Test" },
      entities,
      text,
    },
  } as Update;
}

describe("createBot - idempotency", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("processes a given update_id only once even if delivered twice", async () => {
    const callApi = vi.spyOn(Telegram.prototype, "callApi").mockResolvedValue({} as never);
    const { container } = await createTestSetup(1);
    const bot = createBot("fake-token", container, ALLOWED_CHAT_ID);

    // Same update_id delivered twice - simulates a Telegram webhook retry.
    await bot.handleUpdate(messageUpdate(42, "/help"));
    const callsAfterFirst = callApi.mock.calls.filter(([m]) => m === "sendMessage").length;
    await bot.handleUpdate(messageUpdate(42, "/help"));
    const callsAfterSecond = callApi.mock.calls.filter(([m]) => m === "sendMessage").length;

    expect(callsAfterFirst).toBeGreaterThan(0);
    expect(callsAfterSecond).toBe(callsAfterFirst);
  });

  it("processes a genuinely new update_id normally", async () => {
    const callApi = vi.spyOn(Telegram.prototype, "callApi").mockResolvedValue({} as never);
    const { container } = await createTestSetup(1);
    const bot = createBot("fake-token", container, ALLOWED_CHAT_ID);

    await bot.handleUpdate(messageUpdate(1, "/help"));
    await bot.handleUpdate(messageUpdate(2, "/help"));

    const sendMessageCalls = callApi.mock.calls.filter(([m]) => m === "sendMessage");
    expect(sendMessageCalls.length).toBeGreaterThanOrEqual(2);
  });
});
