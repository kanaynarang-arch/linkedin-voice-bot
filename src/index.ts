import { loadEnv } from "./config/env.js";
import { setLogLevel, createLogger } from "./utils/logger.js";
import { buildContainer } from "./container.js";
import { createBot } from "./bot/index.js";

const log = createLogger("main");

async function main(): Promise<void> {
  const env = loadEnv();
  setLogLevel(env.LOG_LEVEL);

  const container = await buildContainer(env);
  const bot = createBot(env.TELEGRAM_BOT_TOKEN, container, env.TELEGRAM_CHAT_ID);

  process.once("SIGINT", () => {
    log.info("Received SIGINT, shutting down");
    bot.stop("SIGINT");
  });
  process.once("SIGTERM", () => {
    log.info("Received SIGTERM, shutting down");
    bot.stop("SIGTERM");
  });

  await bot.launch(() => {
    log.info("Bot started in local polling mode", { model: env.GEMINI_MODEL });
  });
}

main().catch((error) => {
  log.error("Fatal startup error", error);
  process.exit(1);
});
