import type { DB } from "../client.js";
import type { IdeaRecord, IdeaStatus } from "../../domain/types.js";

interface IdeaRow {
  id: number;
  user_id: number;
  raw_text: string;
  status: IdeaStatus;
  created_at: string;
}

function toRecord(row: IdeaRow): IdeaRecord {
  return {
    id: row.id,
    userId: row.user_id,
    rawText: row.raw_text,
    status: row.status,
    createdAt: row.created_at,
  };
}

export class IdeasRepository {
  constructor(private readonly db: DB) {}

  create(userId: number, rawText: string): IdeaRecord {
    const result = this.db
      .prepare<[number, string]>("INSERT INTO ideas (user_id, raw_text) VALUES (?, ?)")
      .run(userId, rawText);
    const row = this.db
      .prepare<[number], IdeaRow>("SELECT * FROM ideas WHERE id = ?")
      .get(Number(result.lastInsertRowid));
    if (!row) throw new Error("Failed to create idea record");
    return toRecord(row);
  }

  setStatus(ideaId: number, status: IdeaStatus): void {
    this.db.prepare<[string, number]>("UPDATE ideas SET status = ? WHERE id = ?").run(status, ideaId);
  }

  getById(ideaId: number): IdeaRecord | null {
    const row = this.db
      .prepare<[number], IdeaRow>("SELECT * FROM ideas WHERE id = ?")
      .get(ideaId);
    return row ? toRecord(row) : null;
  }

  /** Finds an idea by exact raw text for this user, to detect duplicate submissions. */
  findDuplicate(userId: number, rawText: string): IdeaRecord | null {
    const row = this.db
      .prepare<[number, string], IdeaRow>(
        "SELECT * FROM ideas WHERE user_id = ? AND raw_text = ? ORDER BY created_at DESC LIMIT 1",
      )
      .get(userId, rawText);
    return row ? toRecord(row) : null;
  }

  listByUser(userId: number, limit = 20): IdeaRecord[] {
    const rows = this.db
      .prepare<[number, number], IdeaRow>(
        "SELECT * FROM ideas WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
      )
      .all(userId, limit);
    return rows.map(toRecord);
  }

  getLatestByUser(userId: number): IdeaRecord | null {
    const row = this.db
      .prepare<[number], IdeaRow>(
        "SELECT * FROM ideas WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
      )
      .get(userId);
    return row ? toRecord(row) : null;
  }
}
