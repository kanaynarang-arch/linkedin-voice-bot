import type { DB } from "../client.js";
import type { VoiceProfile, VoiceProfileRecord } from "../../domain/types.js";
import { VoiceProfileSchema } from "../../domain/types.js";
import { AIResponseParsingError } from "../../utils/errors.js";

interface VoiceProfileRow {
  id: number;
  user_id: number;
  profile_json: string;
  post_count: number;
  model: string;
  is_active: number;
  created_at: string;
}

function toRecord(row: VoiceProfileRow): VoiceProfileRecord {
  let profile: VoiceProfile;
  try {
    profile = VoiceProfileSchema.parse(JSON.parse(row.profile_json));
  } catch (cause) {
    throw new AIResponseParsingError(
      `Stored voice profile ${row.id} failed to parse as valid JSON/schema`,
      cause,
    );
  }
  return {
    id: row.id,
    userId: row.user_id,
    profile,
    postCount: row.post_count,
    model: row.model,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
  };
}

export class VoiceProfilesRepository {
  constructor(private readonly db: DB) {}

  /** Saves a new voice profile and marks it the active one, deactivating prior profiles. */
  save(userId: number, profile: VoiceProfile, postCount: number, model: string): VoiceProfileRecord {
    const insert = this.db.transaction(() => {
      this.db
        .prepare<[number]>("UPDATE voice_profiles SET is_active = 0 WHERE user_id = ?")
        .run(userId);

      const result = this.db
        .prepare<[number, string, number, string]>(
          "INSERT INTO voice_profiles (user_id, profile_json, post_count, model, is_active) VALUES (?, ?, ?, ?, 1)",
        )
        .run(userId, JSON.stringify(profile), postCount, model);

      return Number(result.lastInsertRowid);
    });

    const id = insert();
    const row = this.db
      .prepare<[number], VoiceProfileRow>("SELECT * FROM voice_profiles WHERE id = ?")
      .get(id);
    if (!row) throw new Error("Failed to create voice profile record");
    return toRecord(row);
  }

  getActive(userId: number): VoiceProfileRecord | null {
    const row = this.db
      .prepare<[number], VoiceProfileRow>(
        "SELECT * FROM voice_profiles WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1",
      )
      .get(userId);
    return row ? toRecord(row) : null;
  }

  listByUser(userId: number): VoiceProfileRecord[] {
    const rows = this.db
      .prepare<[number], VoiceProfileRow>(
        "SELECT * FROM voice_profiles WHERE user_id = ? ORDER BY created_at DESC",
      )
      .all(userId);
    return rows.map(toRecord);
  }
}
