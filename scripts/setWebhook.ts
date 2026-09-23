import { loadEnv } from "../src/config/env.js";

interface TelegramApiResponse {
  ok: boolean;
  description?: string;
  result?: unknown;
}

async function main(): Promise<void> {
  const env = loadEnv();
  if (!env.PUBLIC_URL) {
    throw new Error(
      "Set PUBLIC_URL in your environment to your deployed Vercel URL (e.g. https://your-app.vercel.app) before running this.",
    );
  }

  const url = `${env.PUBLIC_URL.replace(/\/$/, "")}/api/telegram`;
  const params = new URLSearchParams({ url });
  if (env.TELEGRAM_WEBHOOK_SECRET) {
    params.set("secret_token", env.TELEGRAM_WEBHOOK_SECRET);
  }

  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook?${params}`);
  const body = (await response.json()) as TelegramApiResponse;

  if (!body.ok) {
    throw new Error(`Telegram setWebhook failed: ${body.description ?? JSON.stringify(body)}`);
  }

  console.log(`Webhook registered at ${url}`);
  console.log(body.description ?? "OK");
}

main().catch((error) => {
  console.error("Failed to set webhook:", error);
  process.exit(1);
});
