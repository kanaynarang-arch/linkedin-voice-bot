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

  async addMany(userId: number, contents: string[]): Promise<LinkedInPostRecord[]> {
    const results: LinkedInPostRecord[] = [];
    for (const content of contents) {
      results.push(await this.add(userId, content));
    }
    return results;
  }

  async listByUser(userId: number): Promise<LinkedInPostRecord[]> {
    const rows = await this.db.query<PostRow>(
      "SELECT * FROM linkedin_posts WHERE user_id = $1 ORDER BY created_at ASC",
      [userId],
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
