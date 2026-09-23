import { isUniqueViolation, type Database } from "../client.js";

/**
 * Tracks Telegram update IDs already claimed for processing. A webhook
 * call slow enough to outlast Telegram's delivery timeout (e.g. a cold
 * start plus a multi-call AI pipeline) can trigger a retry of the *same*
 * update while the first attempt is still in flight - without this,
 * that produces duplicate ideas, duplicate drafts, and duplicate replies.
 */
export class ProcessedUpdatesRepository {
  constructor(private readonly db: Database) {}

  /**
   * Atomically claims an update ID. Returns true the first time it's
   * called for a given ID (go ahead and process it), false on every
   * subsequent call for the same ID (already claimed - skip). Relies on
   * the primary key constraint rather than `ON CONFLICT ... RETURNING`
   * to detect the duplicate, so a genuine, unrelated DB error still
   * propagates instead of being swallowed as "already claimed".
   */
  async tryClaim(updateId: number): Promise<boolean> {
    try {
      await this.db.query("INSERT INTO processed_updates (update_id) VALUES ($1)", [updateId]);
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }
}
