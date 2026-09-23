import { describe, expect, it } from "vitest";
import { splitForTelegram } from "../../src/bot/telegramUtils.js";

describe("splitForTelegram", () => {
  it("returns the original text unchanged when under the limit", () => {
    expect(splitForTelegram("short message", 100)).toEqual(["short message"]);
  });

  it("splits long text into chunks under the limit", () => {
    const paragraph = "word ".repeat(50).trim();
    const text = Array.from({ length: 10 }, (_, i) => `Paragraph ${i}: ${paragraph}`).join("\n\n");

    const chunks = splitForTelegram(text, 200);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(200);
    }
    expect(chunks.join("\n\n").replace(/\n{2,}/g, "\n\n")).toContain("Paragraph 0");
  });

  it("never loses content across chunks", () => {
    const text = "abcdefgh ".repeat(100);
    const chunks = splitForTelegram(text, 50);
    const rejoined = chunks.join(" ").replace(/\s+/g, " ").trim();
    const original = text.replace(/\s+/g, " ").trim();
    expect(rejoined).toBe(original);
  });
});
