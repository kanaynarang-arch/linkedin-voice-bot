import type { Database } from "../client.js";
import type { UserRecord } from "../../domain/types.js";
import { toIsoString } from "../rows.js";

interface UserRow {
  id: number;
  telegram_chat_id: string;
  created_at: string | Date;
}

function toRecord(row: UserRow): UserRecord {
  return { id: row.id, telegramChatId: row.telegram_chat_id, createdAt: toIsoString(row.created_at) };
}

export class UsersRepository {
  constructor(private readonly db: Database) {}

  /** Finds the user for a chat ID, creating one on first contact. */
  async getOrCreate(telegramChatId: string): Promise<UserRecord> {
    const existing = await this.db.query<UserRow>(
      "SELECT * FROM users WHERE telegram_chat_id = $1",
      [telegramChatId],
    );
    if (existing[0]) return toRecord(existing[0]);

    const inserted = await this.db.query<UserRow>(
      "INSERT INTO users (telegram_chat_id) VALUES ($1) ON CONFLICT (telegram_chat_id) DO UPDATE SET telegram_chat_id = EXCLUDED.telegram_chat_id RETURNING *",
      [telegramChatId],
    );
    const row = inserted[0];
    if (!row) throw new Error("Failed to create user record");
    return toRecord(row);
  }
}
