import type { z } from "zod";
import type { AIProvider } from "./provider.js";
import { AIResponseParsingError } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("structured-output");

/**
 * Calls the AI provider for JSON output and validates it against `schema`.
 * If the first response doesn't match, makes one repair attempt that
 * shows the model its own mistake, before giving up. This is what keeps
 * "invalid AI output" from ever reaching the rest of the app unvalidated.
 */
export async function generateValidatedJSON<T>(
  ai: AIProvider,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  systemInstruction: string,
  prompt: string,
): Promise<T> {
  const raw = await ai.generateJSON({ systemInstruction, prompt });
  const first = schema.safeParse(raw);
  if (first.success) return first.data;

  log.warn("AI JSON output failed schema validation; attempting one repair pass", {
    issues: first.error.issues,
  });

  const repairPrompt = [
    prompt,
    "",
    "Your previous response did not match the required JSON shape.",
    "Validation errors:",
    ...first.error.issues.map((issue) => `- ${issue.path.join(".") || "(root)"}: ${issue.message}`),
    "",
    "Previous response:",
    JSON.stringify(raw),
    "",
    "Return ONLY the corrected JSON object matching the required shape. No prose, no markdown fences.",
  ].join("\n");

  const repaired = await ai.generateJSON({ systemInstruction, prompt: repairPrompt });
  const second = schema.safeParse(repaired);
  if (second.success) return second.data;

  throw new AIResponseParsingError(
    `AI response failed schema validation after repair attempt: ${second.error.message}`,
  );
}
