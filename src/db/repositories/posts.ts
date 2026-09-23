import type { DB } from "../client.js";
import type { LinkedInPostRecord } from "../../domain/types.js";

interface PostRow {
  id: number;
  user_id: number;
  content: string;
  created_at: string;
}

function toRecord(row: PostRow): LinkedInPostRecord {
  return { id: row.id, userId: row.user_id, content: row.content, createdAt: row.created_at };
}

export class PostsRepository {
  constructor(private readonly db: DB) {}

  add(userId: number, content: string): LinkedInPostRecord {
    const result = this.db
      .prepare<[number, string]>("INSERT INTO linkedin_posts (user_id, content) VALUES (?, ?)")
      .run(userId, content);
    const row = this.db
      .prepare<[number], PostRow>("SELECT * FROM linkedin_posts WHERE id = ?")
      .get(Number(result.lastInsertRowid));
    if (!row) throw new Error("Failed to create post record");
    return toRecord(row);
  }

  addMany(userId: number, contents: string[]): LinkedInPostRecord[] {
    const insert = this.db.transaction((items: string[]) => {
      return items.map((c) => this.add(userId, c));
    });
    return insert(contents);
  }

  listByUser(userId: number): LinkedInPostRecord[] {
    const rows = this.db
      .prepare<[number], PostRow>(
        "SELECT * FROM linkedin_posts WHERE user_id = ? ORDER BY created_at ASC",
      )
      .all(userId);
    return rows.map(toRecord);
  }

  countByUser(userId: number): number {
    const row = this.db
      .prepare<[number], { count: number }>(
        "SELECT COUNT(*) as count FROM linkedin_posts WHERE user_id = ?",
      )
      .get(userId);
    return row?.count ?? 0;
  }

  clearByUser(userId: number): number {
    const result = this.db
      .prepare<[number]>("DELETE FROM linkedin_posts WHERE user_id = ?")
      .run(userId);
    return result.changes;
  }
}
