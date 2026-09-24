import type { Database } from "../client.js";
import type { LinkedinScoreDimensions, LinkedinScoreRecord } from "../../domain/types.js";
import { toIsoString } from "../rows.js";

interface IdeaScoreRow {
  id: number;
  idea_id: number;
  // Postgres NUMERIC columns come back from node-postgres as strings (to
  // avoid floating-point precision loss on arbitrary-precision values),
  // not numbers - every numeric field here needs an explicit Number(...).
  linkedin_score: string;
  professional_relevance: string;
  knowledge_value: string;
  original_perspective: string;
  dwell_read_potential: string;
  conversation_potential: string;
  timeliness: string;
  share_save_utility: string;
  authenticity_anti_slop: string;
  reasoning: string;
  model: string;
  created_at: string | Date;
}

function toRecord(row: IdeaScoreRow): LinkedinScoreRecord {
  return {
    id: row.id,
    ideaId: row.idea_id,
    linkedinScore: Number(row.linkedin_score),
    professionalRelevance: Number(row.professional_relevance),
    knowledgeValue: Number(row.knowledge_value),
    originalPerspective: Number(row.original_perspective),
    dwellReadPotential: Number(row.dwell_read_potential),
    conversationPotential: Number(row.conversation_potential),
    timeliness: Number(row.timeliness),
    shareSaveUtility: Number(row.share_save_utility),
    authenticityAntiSlop: Number(row.authenticity_anti_slop),
    reasoning: row.reasoning,
    model: row.model,
    createdAt: toIsoString(row.created_at),
  };
}

export class IdeaScoresRepository {
  constructor(private readonly db: Database) {}

  async create(
    ideaId: number,
    linkedinScore: number,
    dimensions: LinkedinScoreDimensions,
    model: string,
  ): Promise<LinkedinScoreRecord> {
    const rows = await this.db.query<IdeaScoreRow>(
      `INSERT INTO idea_scores
          (idea_id, linkedin_score, professional_relevance, knowledge_value, original_perspective,
           dwell_read_potential, conversation_potential, timeliness, share_save_utility,
           authenticity_anti_slop, reasoning, model)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
      [
        ideaId,
        linkedinScore,
        dimensions.professionalRelevance,
        dimensions.knowledgeValue,
        dimensions.originalPerspective,
        dimensions.dwellReadPotential,
        dimensions.conversationPotential,
        dimensions.timeliness,
        dimensions.shareSaveUtility,
        dimensions.authenticityAntiSlop,
        dimensions.reasoning,
        model,
      ],
    );
    const row = rows[0];
    if (!row) throw new Error("Failed to create idea score record");
    return toRecord(row);
  }

  async getLatestForIdea(ideaId: number): Promise<LinkedinScoreRecord | null> {
    const rows = await this.db.query<IdeaScoreRow>(
      "SELECT * FROM idea_scores WHERE idea_id = $1 ORDER BY created_at DESC LIMIT 1",
      [ideaId],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }
}
