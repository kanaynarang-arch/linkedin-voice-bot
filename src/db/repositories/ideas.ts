import type { Database } from "../client.js";
import type { IdeaRecord, IdeaStatus } from "../../domain/types.js";
import { toIsoString } from "../rows.js";

interface IdeaRow {
  id: number;
  user_id: number;
  raw_text: string;
  status: IdeaStatus;
  created_at: string | Date;
}

function toRecord(row: IdeaRow): IdeaRecord {
  return {
    id: row.id,
    userId: row.user_id,
    rawText: row.raw_text,
    status: row.status,
    createdAt: toIsoString(row.created_at),
  };
}

export class IdeasRepository {
  constructor(private readonly db: Database) {}

  async create(userId: number, rawText: string): Promise<IdeaRecord> {
    const rows = await this.db.query<IdeaRow>(
      "INSERT INTO ideas (user_id, raw_text) VALUES ($1, $2) RETURNING *",
      [userId, rawText],
    );
    const row = rows[0];
    if (!row) throw new Error("Failed to create idea record");
    return toRecord(row);
  }

  async setStatus(ideaId: number, status: IdeaStatus): Promise<void> {
    await this.db.query("UPDATE ideas SET status = $1 WHERE id = $2", [status, ideaId]);
  }

  async getById(ideaId: number): Promise<IdeaRecord | null> {
    const rows = await this.db.query<IdeaRow>("SELECT * FROM ideas WHERE id = $1", [ideaId]);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  /** Finds an idea by exact raw text for this user, to detect duplicate submissions. */
  async findDuplicate(userId: number, rawText: string): Promise<IdeaRecord | null> {
    const rows = await this.db.query<IdeaRow>(
      "SELECT * FROM ideas WHERE user_id = $1 AND raw_text = $2 ORDER BY created_at DESC LIMIT 1",
      [userId, rawText],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async listByUser(userId: number, limit = 20): Promise<IdeaRecord[]> {
    const rows = await this.db.query<IdeaRow>(
      "SELECT * FROM ideas WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
      [userId, limit],
    );
    return rows.map(toRecord);
  }

  async getLatestByUser(userId: number): Promise<IdeaRecord | null> {
    const rows = await this.db.query<IdeaRow>(
      "SELECT * FROM ideas WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [userId],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }
}
