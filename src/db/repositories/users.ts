import type { DB } from "../client.js";
import type { UserRecord } from "../../domain/types.js";

interface UserRow {
  id: number;
  telegram_chat_id: string;
  created_at: string;
}

function toRecord(row: UserRow): UserRecord {
  return { id: row.id, telegramChatId: row.telegram_chat_id, createdAt: row.created_at };
}

export class UsersRepository {
  constructor(private readonly db: DB) {}

  /** Finds the user for a chat ID, creating one on first contact. */
  getOrCreate(telegramChatId: string): UserRecord {
    const existing = this.db
      .prepare<[string], UserRow>("SELECT * FROM users WHERE telegram_chat_id = ?")
      .get(telegramChatId);
    if (existing) return toRecord(existing);

    const result = this.db
      .prepare<[string]>("INSERT INTO users (telegram_chat_id) VALUES (?)")
      .run(telegramChatId);
    const created = this.db
      .prepare<[number], UserRow>("SELECT * FROM users WHERE id = ?")
      .get(Number(result.lastInsertRowid));
    if (!created) throw new Error("Failed to create user record");
    return toRecord(created);
  }
}
