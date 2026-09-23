import type { DB } from "../client.js";

export type ConversationStateName = "idle" | "collecting_posts" | "awaiting_rewrite_feedback";

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
 * several posts in a row before /done). Persisted so a bot restart never
 * loses track mid-flow.
 */
export class ConversationStateRepository {
  constructor(private readonly db: DB) {}

  get(userId: number): ConversationState {
    const row = this.db
      .prepare<[number], StateRow>("SELECT * FROM conversation_states WHERE user_id = ?")
      .get(userId);
    if (!row) return { state: "idle", data: {} };
    return { state: row.state, data: row.data_json ? JSON.parse(row.data_json) : {} };
  }

  set(userId: number, state: ConversationStateName, data: Record<string, unknown> = {}): void {
    this.db
      .prepare<[number, string, string]>(
        `INSERT INTO conversation_states (user_id, state, data_json, updated_at)
         VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(user_id) DO UPDATE SET
           state = excluded.state,
           data_json = excluded.data_json,
           updated_at = excluded.updated_at`,
      )
      .run(userId, state, JSON.stringify(data));
  }

  reset(userId: number): void {
    this.set(userId, "idle", {});
  }
}
