import { describe, expect, it } from "vitest";
import { z } from "zod";
import { generateValidatedJSON } from "../../src/ai/structuredOutput.js";
import { AIResponseParsingError } from "../../src/utils/errors.js";
import { FakeAIProvider } from "../testUtils/fakeAIProvider.js";

const Schema = z.object({
  name: z.string(),
  count: z.number(),
});

describe("generateValidatedJSON", () => {
  it("returns the parsed value when the first response is valid", async () => {
    const ai = new FakeAIProvider();
    ai.queueJSON({ name: "hello", count: 3 });

    const result = await generateValidatedJSON(ai, Schema, "system", "prompt");

    expect(result).toEqual({ name: "hello", count: 3 });
    expect(ai.jsonCalls).toHaveLength(1);
  });

  it("retries once with a repair prompt when the first response fails validation", async () => {
    const ai = new FakeAIProvider();
    ai.queueJSON({ name: "hello", count: "not-a-number" });
    ai.queueJSON({ name: "hello", count: 3 });

    const result = await generateValidatedJSON(ai, Schema, "system", "prompt");

    expect(result).toEqual({ name: "hello", count: 3 });
    expect(ai.jsonCalls).toHaveLength(2);
    expect(ai.jsonCalls[1]?.prompt).toContain("did not match the required JSON shape");
  });

  it("throws AIResponseParsingError when the repair attempt also fails validation", async () => {
    const ai = new FakeAIProvider();
    ai.queueJSON({ name: "hello", count: "not-a-number" });
    ai.queueJSON({ name: "hello" });

    await expect(generateValidatedJSON(ai, Schema, "system", "prompt")).rejects.toThrow(
      AIResponseParsingError,
    );
  });

  it("propagates a parsing error when the provider returns unparseable JSON", async () => {
    const ai = new FakeAIProvider();
    ai.generateJSON = async () => {
      throw new AIResponseParsingError("not valid json");
    };

    await expect(generateValidatedJSON(ai, Schema, "system", "prompt")).rejects.toThrow(
      AIResponseParsingError,
    );
  });
});
