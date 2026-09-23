import type { Database } from "../client.js";
import type { DraftRecord } from "../../domain/types.js";
import { toIsoString } from "../rows.js";

interface DraftRow {
  id: number;
  idea_id: number;
  analysis_id: number;
  content: string;
  version: number;
  feedback: string | null;
  model: string;
  created_at: string | Date;
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
    createdAt: toIsoString(row.created_at),
  };
}

export class DraftsRepository {
  constructor(private readonly db: Database) {}

  async create(
    ideaId: number,
    analysisId: number,
    content: string,
    model: string,
    feedback: string | null = null,
  ): Promise<DraftRecord> {
    // Computes the next version in the same statement as the insert
    // (rather than a separate SELECT then INSERT) to close almost all of
    // the race window between two concurrent draft writes for the same
    // idea; the idx_drafts_idea_version unique index is the hard backstop
    // for the remaining sliver that a single statement can't close.
    const rows = await this.db.query<DraftRow>(
      `INSERT INTO drafts (idea_id, analysis_id, content, version, feedback, model)
         SELECT $1::integer, $2::integer, $3::text, COALESCE(MAX(version), 0) + 1, $4::text, $5::text
         FROM drafts WHERE idea_id = $1::integer
         RETURNING *`,
      [ideaId, analysisId, content, feedback, model],
    );
    const row = rows[0];
    if (!row) throw new Error("Failed to create draft record");
    return toRecord(row);
  }

  async getLatestForIdea(ideaId: number): Promise<DraftRecord | null> {
    const rows = await this.db.query<DraftRow>(
      "SELECT * FROM drafts WHERE idea_id = $1 ORDER BY version DESC LIMIT 1",
      [ideaId],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async getById(id: number): Promise<DraftRecord | null> {
    const rows = await this.db.query<DraftRow>("SELECT * FROM drafts WHERE id = $1", [id]);
    return rows[0] ? toRecord(rows[0]) : null;
  }
}
