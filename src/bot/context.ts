import type { Context } from "telegraf";
import type { Container } from "../container.js";

export interface BotContext extends Context {
  container: Container;
  /** Internal app user id (users table row), resolved by access-control middleware. */
  appUserId: number;
}
