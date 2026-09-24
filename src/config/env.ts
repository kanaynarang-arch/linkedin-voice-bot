import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  TELEGRAM_CHAT_ID: z.string().min(1, "TELEGRAM_CHAT_ID is required"),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  GEMINI_MODEL: z.string().default("gemini-3.6-flash"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required (a Postgres connection string)"),
  MIN_POSTS_FOR_ANALYSIS: z.coerce.number().int().positive().default(5),
  // The single gate: a note's Gemini content score must be >= this to
  // proceed past scoring to Google News + drafting. Centralized here so
  // there's exactly one threshold value in the whole app.
  MIN_CONTENT_SCORE: z.coerce.number().min(0).max(10).default(6.0),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  // Only needed to run scripts/setWebhook.ts or when serving the webhook function.
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1).optional(),
  PUBLIC_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | undefined;

/**
 * Parses and validates process.env once, caching the result. Throws a
 * descriptive error immediately on startup if required credentials are
 * missing, instead of failing confusingly deep inside the AI or Telegram
 * layers later.
 */
export function loadEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill in the required values.`,
    );
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}
