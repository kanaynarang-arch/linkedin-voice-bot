import type { Database } from "../client.js";

export type ConversationStateName = "idle" | "collecting_posts";

export interface ConversationState<TData = Record<string, unknown>> {
  state: ConversationStateName;
  data: TData;
}

interface StateRow {
  user_id: number;
  state: ConversationStateName;
  data_json: string | null;
}

/**
 * Tiny per-user state machine used for multi-message flows (e.g. pasting
 * several posts in a row before /done). Persisted so a bot restart, or a
 * cold serverless invocation, never loses track mid-flow.
 */
export class ConversationStateRepository {
  constructor(private readonly db: Database) {}

  async get(userId: number): Promise<ConversationState> {
    const rows = await this.db.query<StateRow>(
      "SELECT * FROM conversation_states WHERE user_id = $1",
      [userId],
    );
    const row = rows[0];
    if (!row) return { state: "idle", data: {} };
    return { state: row.state, data: row.data_json ? JSON.parse(row.data_json) : {} };
  }

  async set(userId: number, state: ConversationStateName, data: Record<string, unknown> = {}): Promise<void> {
    await this.db.query(
      `INSERT INTO conversation_states (user_id, state, data_json, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (user_id) DO UPDATE SET
           state = EXCLUDED.state,
           data_json = EXCLUDED.data_json,
           updated_at = EXCLUDED.updated_at`,
      [userId, state, JSON.stringify(data)],
    );
  }

  async reset(userId: number): Promise<void> {
    await this.set(userId, "idle", {});
  }
}
