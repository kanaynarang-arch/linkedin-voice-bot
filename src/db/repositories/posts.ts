import type { Database } from "../client.js";
import type { LinkedInPostRecord } from "../../domain/types.js";
import { toIsoString } from "../rows.js";

interface PostRow {
  id: number;
  user_id: number;
  content: string;
  created_at: string | Date;
}

function toRecord(row: PostRow): LinkedInPostRecord {
  return { id: row.id, userId: row.user_id, content: row.content, createdAt: toIsoString(row.created_at) };
}

export class PostsRepository {
  constructor(private readonly db: Database) {}

  async add(userId: number, content: string): Promise<LinkedInPostRecord> {
    const rows = await this.db.query<PostRow>(
      "INSERT INTO linkedin_posts (user_id, content) VALUES ($1, $2) RETURNING *",
      [userId, content],
    );
    const row = rows[0];
    if (!row) throw new Error("Failed to create post record");
    return toRecord(row);
  }

  /** Inserts every post in a single statement, so a partial-batch paste is never left half-saved on a mid-request failure. */
  async addMany(userId: number, contents: string[]): Promise<LinkedInPostRecord[]> {
    if (contents.length === 0) return [];
    const placeholders = contents.map((_, i) => `($1, $${i + 2})`).join(", ");
    const rows = await this.db.query<PostRow>(
      `INSERT INTO linkedin_posts (user_id, content) VALUES ${placeholders} RETURNING *`,
      [userId, ...contents],
    );
    return rows.map(toRecord);
  }

  async listByUser(userId: number): Promise<LinkedInPostRecord[]> {
    const rows = await this.db.query<PostRow>(
      "SELECT * FROM linkedin_posts WHERE user_id = $1 ORDER BY created_at ASC",
      [userId],
    );
    return rows.map(toRecord);
  }

  /** The `limit` most recent posts, oldest-first (for use as prompt examples). */
  async listRecentByUser(userId: number, limit: number): Promise<LinkedInPostRecord[]> {
    const rows = await this.db.query<PostRow>(
      `SELECT * FROM (
         SELECT * FROM linkedin_posts WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2
       ) recent ORDER BY created_at ASC`,
      [userId, limit],
    );
    return rows.map(toRecord);
  }

  async countByUser(userId: number): Promise<number> {
    const rows = await this.db.query<{ count: string }>(
      "SELECT COUNT(*) as count FROM linkedin_posts WHERE user_id = $1",
      [userId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async clearByUser(userId: number): Promise<number> {
    const rows = await this.db.query<PostRow>(
      "DELETE FROM linkedin_posts WHERE user_id = $1 RETURNING id",
      [userId],
    );
    return rows.length;
  }
}
