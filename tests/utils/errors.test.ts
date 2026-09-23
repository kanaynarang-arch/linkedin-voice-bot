import { describe, expect, it } from "vitest";
import {
  AIProviderError,
  AIResponseParsingError,
  InsufficientDataError,
  MissingVoiceProfileError,
  toUserMessage,
} from "../../src/utils/errors.js";

describe("toUserMessage", () => {
  it("returns the safe userMessage for known AppErrors", () => {
    expect(toUserMessage(new MissingVoiceProfileError())).toMatch(/Voice Profile/);
    expect(toUserMessage(new InsufficientDataError("internal", "need more posts"))).toBe("need more posts");
  });

  it("never leaks the internal message or cause for AIProviderError/AIResponseParsingError", () => {
    const cause = new Error("raw provider stack trace with secrets");
    const err = new AIProviderError("internal detail", cause);
    expect(toUserMessage(err)).not.toContain("secrets");
    expect(toUserMessage(err)).not.toContain("internal detail");

    const parseErr = new AIResponseParsingError("bad json: sk-abc123", cause);
    expect(toUserMessage(parseErr)).not.toContain("sk-abc123");
  });

  it("falls back to a generic message for unknown thrown values", () => {
    expect(toUserMessage(new Error("some random JS error"))).toBe(
      "Something went wrong on my end. Please try again.",
    );
    expect(toUserMessage("a raw string throw")).toBe("Something went wrong on my end. Please try again.");
  });
});
