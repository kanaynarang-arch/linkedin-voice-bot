import { vi } from "vitest";
import type { BotContext } from "../../src/bot/context.js";
import type { Container } from "../../src/container.js";

export interface FakeCtx {
  ctx: BotContext;
  replies: string[];
}

/** Builds a minimal fake Telegraf context sufficient for handler unit tests. */
export function createFakeCtx(container: Container, appUserId: number): FakeCtx {
  const replies: string[] = [];
  const ctx = {
    container,
    appUserId,
    reply: vi.fn(async (text: string) => {
      replies.push(text);
      return {} as never;
    }),
  } as unknown as BotContext;

  return { ctx, replies };
}
