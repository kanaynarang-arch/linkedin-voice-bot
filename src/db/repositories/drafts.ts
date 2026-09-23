import type { DB } from "../client.js";
import type { DraftRecord } from "../../domain/types.js";

interface DraftRow {
  id: number;
  idea_id: number;
  analysis_id: number;
  content: string;
  version: number;
  feedback: string | null;
  model: string;
  created_at: string;
}

function toRecord(row: DraftRow): DraftRecord {
  return {
    id: row.id,
    ideaId: row.idea_id,
    analysisId: row.analysis_id,
    content: row.content,
    version: row.version,
    feedback: row.feedback,
    model: row.model,
    createdAt: row.created_at,
  };
}

export class DraftsRepository {
  constructor(private readonly db: DB) {}

  create(
    ideaId: number,
    analysisId: number,
    content: string,
    model: string,
    feedback: string | null = null,
  ): DraftRecord {
    const previousVersion = this.getLatestForIdea(ideaId)?.version ?? 0;
    const result = this.db
      .prepare<[number, number, string, number, string | null, string]>(
        `INSERT INTO drafts (idea_id, analysis_id, content, version, feedback, model)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(ideaId, analysisId, content, previousVersion + 1, feedback, model);
    const row = this.db
      .prepare<[number], DraftRow>("SELECT * FROM drafts WHERE id = ?")
      .get(Number(result.lastInsertRowid));
    if (!row) throw new Error("Failed to create draft record");
    return toRecord(row);
  }

  getLatestForIdea(ideaId: number): DraftRecord | null {
    const row = this.db
      .prepare<[number], DraftRow>(
        "SELECT * FROM drafts WHERE idea_id = ? ORDER BY version DESC LIMIT 1",
      )
      .get(ideaId);
    return row ? toRecord(row) : null;
  }

  getById(id: number): DraftRecord | null {
    const row = this.db.prepare<[number], DraftRow>("SELECT * FROM drafts WHERE id = ?").get(id);
    return row ? toRecord(row) : null;
  }
}
