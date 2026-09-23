import type { VercelRequest, VercelResponse } from "@vercel/node";
import { loadEnv } from "../src/config/env.js";
import { buildContainer } from "../src/container.js";
import { createBot } from "../src/bot/index.js";
import { createLogger } from "../src/utils/logger.js";

const log = createLogger("webhook");

async function buildWebhookCallback() {
  const env = loadEnv();
  const container = await buildContainer(env);
  const bot = createBot(env.TELEGRAM_BOT_TOKEN, container, env.TELEGRAM_CHAT_ID);
  log.info("Webhook handler initialized", { model: env.GEMINI_MODEL });
  return bot.webhookCallback("/api/telegram", { secretToken: env.TELEGRAM_WEBHOOK_SECRET });
}

type WebhookCallback = Awaited<ReturnType<typeof buildWebhookCallback>>;

// Reused across warm invocations of the same function instance (Fluid
// Compute keeps instances alive between requests) so the DB pool and bot
// aren't rebuilt on every webhook call - only on a genuine cold start.
let cached: Promise<WebhookCallback> | undefined;

async function getWebhookCallback(): Promise<WebhookCallback> {
  if (cached === undefined) {
    cached = buildWebhookCallback();
  }
  try {
    return await cached;
  } catch (error) {
    // Don't keep a failed initialization cached - let the next request retry.
    cached = undefined;
    throw error;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(200).send("LinkedIn Voice Bot webhook is running.");
    return;
  }

  try {
    const webhookCallback = await getWebhookCallback();
    await webhookCallback(req, res);
  } catch (error) {
    log.error("Webhook handler failed", error);
    if (!res.writableEnded) {
      res.status(500).send("Internal error");
    }
  }
}
