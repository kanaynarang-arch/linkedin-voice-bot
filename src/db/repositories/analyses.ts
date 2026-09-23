import type { Database } from "../client.js";
import type { AnalysisRecord, ResearchResult } from "../../domain/types.js";
import { toIsoString } from "../rows.js";

interface AnalysisRow {
  id: number;
  idea_id: number;
  idea_summary: string;
  worth_developing: boolean;
  reasoning: string;
  angle: string | null;
  research_json: string | null;
  model: string;
  created_at: string | Date;
}

function toRecord(row: AnalysisRow): AnalysisRecord {
  return {
    id: row.id,
    ideaId: row.idea_id,
    ideaSummary: row.idea_summary,
    worthDeveloping: row.worth_developing,
    reasoning: row.reasoning,
    angle: row.angle,
    researchJson: row.research_json,
    model: row.model,
    createdAt: toIsoString(row.created_at),
  };
}

export interface CreateAnalysisInput {
  ideaId: number;
  ideaSummary: string;
  worthDeveloping: boolean;
  reasoning: string;
  angle: string | null;
  research: ResearchResult | null;
  model: string;
}

export class AnalysesRepository {
  constructor(private readonly db: Database) {}

  async create(input: CreateAnalysisInput): Promise<AnalysisRecord> {
    const rows = await this.db.query<AnalysisRow>(
      `INSERT INTO analyses
          (idea_id, idea_summary, worth_developing, reasoning, angle, research_json, model)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
      [
        input.ideaId,
        input.ideaSummary,
        input.worthDeveloping,
        input.reasoning,
        input.angle,
        input.research ? JSON.stringify(input.research) : null,
        input.model,
      ],
    );
    const row = rows[0];
    if (!row) throw new Error("Failed to create analysis record");
    return toRecord(row);
  }

  async getLatestForIdea(ideaId: number): Promise<AnalysisRecord | null> {
    const rows = await this.db.query<AnalysisRow>(
      "SELECT * FROM analyses WHERE idea_id = $1 ORDER BY created_at DESC LIMIT 1",
      [ideaId],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async getById(id: number): Promise<AnalysisRecord | null> {
    const rows = await this.db.query<AnalysisRow>("SELECT * FROM analyses WHERE id = $1", [id]);
    return rows[0] ? toRecord(rows[0]) : null;
  }
}
