import type { DB } from "../client.js";
import type { AnalysisRecord, ResearchResult } from "../../domain/types.js";

interface AnalysisRow {
  id: number;
  idea_id: number;
  idea_summary: string;
  worth_developing: number;
  reasoning: string;
  angle: string | null;
  research_json: string | null;
  model: string;
  created_at: string;
}

function toRecord(row: AnalysisRow): AnalysisRecord {
  return {
    id: row.id,
    ideaId: row.idea_id,
    ideaSummary: row.idea_summary,
    worthDeveloping: Boolean(row.worth_developing),
    reasoning: row.reasoning,
    angle: row.angle,
    researchJson: row.research_json,
    model: row.model,
    createdAt: row.created_at,
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
  constructor(private readonly db: DB) {}

  create(input: CreateAnalysisInput): AnalysisRecord {
    const result = this.db
      .prepare<[number, string, number, string, string | null, string | null, string]>(
        `INSERT INTO analyses
          (idea_id, idea_summary, worth_developing, reasoning, angle, research_json, model)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.ideaId,
        input.ideaSummary,
        input.worthDeveloping ? 1 : 0,
        input.reasoning,
        input.angle,
        input.research ? JSON.stringify(input.research) : null,
        input.model,
      );
    const row = this.db
      .prepare<[number], AnalysisRow>("SELECT * FROM analyses WHERE id = ?")
      .get(Number(result.lastInsertRowid));
    if (!row) throw new Error("Failed to create analysis record");
    return toRecord(row);
  }

  getLatestForIdea(ideaId: number): AnalysisRecord | null {
    const row = this.db
      .prepare<[number], AnalysisRow>(
        "SELECT * FROM analyses WHERE idea_id = ? ORDER BY created_at DESC LIMIT 1",
      )
      .get(ideaId);
    return row ? toRecord(row) : null;
  }

  getById(id: number): AnalysisRecord | null {
    const row = this.db.prepare<[number], AnalysisRow>("SELECT * FROM analyses WHERE id = ?").get(id);
    return row ? toRecord(row) : null;
  }
}
