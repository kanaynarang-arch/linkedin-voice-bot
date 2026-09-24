import type { Database } from "../client.js";
import type { DraftRecord, DraftStatus, HookConnectionType, IndustryHook } from "../../domain/types.js";
import { toIsoString } from "../rows.js";

interface DraftRow {
  id: number;
  idea_id: number;
  content: string;
  version: number;
  feedback: string | null;
  model: string;
  status: DraftStatus;
  news_title: string | null;
  news_source: string | null;
  news_google_url: string | null;
  news_published_at: string | Date | null;
  news_hook_strength: string | null;
  news_connection_type: HookConnectionType | null;
  news_relevance_reason: string | null;
  news_hook_connection: string | null;
  used_news_hook: boolean;
  created_at: string | Date;
}

function toNewsHook(row: DraftRow): IndustryHook | null {
  if (!row.news_title || !row.news_google_url) return null;
  return {
    title: row.news_title,
    source: row.news_source,
    googleNewsUrl: row.news_google_url,
    canonicalUrl: null,
    publishedAt: row.news_published_at ? toIsoString(row.news_published_at) : null,
    // The original fetchedAt/searchQuery aren't persisted per-draft (only
    // the fields needed to render the source/verify block and re-offer
    // the hook to a rewrite are) - recorded as the draft's own creation
    // time isn't accurate, so left unavailable rather than fabricated.
    fetchedAt: toIsoString(row.created_at),
    recency: "UNKNOWN",
    searchQuery: "",
    hookStrength: Number(row.news_hook_strength ?? 0),
    connectionType: row.news_connection_type ?? "contextualizes",
    relevanceReason: row.news_relevance_reason ?? "",
    hookConnection: row.news_hook_connection ?? "",
  };
}

function toRecord(row: DraftRow): DraftRecord {
  return {
    id: row.id,
    ideaId: row.idea_id,
    content: row.content,
    version: row.version,
    feedback: row.feedback,
    model: row.model,
    status: row.status,
    newsHook: toNewsHook(row),
    usedNewsHook: row.used_news_hook,
    createdAt: toIsoString(row.created_at),
  };
}

export class DraftsRepository {
  constructor(private readonly db: Database) {}

  async create(
    ideaId: number,
    content: string,
    model: string,
    newsHook: IndustryHook | null,
    usedNewsHook: boolean,
    feedback: string | null = null,
  ): Promise<DraftRecord> {
    // Computes the next version in the same statement as the insert
    // (rather than a separate SELECT then INSERT) to close almost all of
    // the race window between two concurrent draft writes for the same
    // idea; the idx_drafts_idea_version unique index is the hard backstop
    // for the remaining sliver that a single statement can't close.
    const rows = await this.db.query<DraftRow>(
      `INSERT INTO drafts
          (idea_id, content, version, feedback, model, news_title, news_source, news_google_url,
           news_published_at, news_hook_strength, news_connection_type, news_relevance_reason,
           news_hook_connection, used_news_hook)
         SELECT $1::integer, $2::text, COALESCE(MAX(version), 0) + 1, $3::text, $4::text,
                $5::text, $6::text, $7::text, $8::timestamptz, $9::numeric, $10::text, $11::text, $12::text, $13::boolean
         FROM drafts WHERE idea_id = $1::integer
         RETURNING *`,
      [
        ideaId,
        content,
        feedback,
        model,
        newsHook?.title ?? null,
        newsHook?.source ?? null,
        newsHook?.googleNewsUrl ?? null,
        newsHook?.publishedAt ?? null,
        newsHook?.hookStrength ?? null,
        newsHook?.connectionType ?? null,
        newsHook?.relevanceReason ?? null,
        newsHook?.hookConnection ?? null,
        usedNewsHook,
      ],
    );
    const row = rows[0];
    if (!row) throw new Error("Failed to create draft record");
    return toRecord(row);
  }

  async setStatus(draftId: number, status: DraftStatus): Promise<void> {
    await this.db.query("UPDATE drafts SET status = $1 WHERE id = $2", [status, draftId]);
  }

  async getLatestForIdea(ideaId: number): Promise<DraftRecord | null> {
    const rows = await this.db.query<DraftRow>(
      "SELECT * FROM drafts WHERE idea_id = $1 ORDER BY version DESC LIMIT 1",
      [ideaId],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  /** Most recently created draft across all of a user's ideas - used by /approve and /reject when no idea id is given. */
  async getLatestForUser(userId: number): Promise<DraftRecord | null> {
    const rows = await this.db.query<DraftRow>(
      `SELECT d.* FROM drafts d
         JOIN ideas i ON i.id = d.idea_id
        WHERE i.user_id = $1
        ORDER BY d.created_at DESC
        LIMIT 1`,
      [userId],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async getById(id: number): Promise<DraftRecord | null> {
    const rows = await this.db.query<DraftRow>("SELECT * FROM drafts WHERE id = $1", [id]);
    return rows[0] ? toRecord(rows[0]) : null;
  }
}
