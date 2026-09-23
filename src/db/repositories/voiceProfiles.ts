import type { Database } from "../client.js";
import type { VoiceProfile, VoiceProfileRecord } from "../../domain/types.js";
import { VoiceProfileSchema } from "../../domain/types.js";
import { AIResponseParsingError } from "../../utils/errors.js";
import { toIsoString } from "../rows.js";

interface VoiceProfileRow {
  id: number;
  user_id: number;
  profile_json: string;
  post_count: number;
  model: string;
  is_active: boolean;
  created_at: string | Date;
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
    isActive: row.is_active,
    createdAt: toIsoString(row.created_at),
  };
}

export class VoiceProfilesRepository {
  constructor(private readonly db: Database) {}

  /** Saves a new voice profile and marks it the active one, deactivating prior profiles. */
  async save(
    userId: number,
    profile: VoiceProfile,
    postCount: number,
    model: string,
  ): Promise<VoiceProfileRecord> {
    await this.db.query("UPDATE voice_profiles SET is_active = FALSE WHERE user_id = $1", [userId]);

    const rows = await this.db.query<VoiceProfileRow>(
      `INSERT INTO voice_profiles (user_id, profile_json, post_count, model, is_active)
       VALUES ($1, $2, $3, $4, TRUE) RETURNING *`,
      [userId, JSON.stringify(profile), postCount, model],
    );
    const row = rows[0];
    if (!row) throw new Error("Failed to create voice profile record");
    return toRecord(row);
  }

  async getActive(userId: number): Promise<VoiceProfileRecord | null> {
    const rows = await this.db.query<VoiceProfileRow>(
      "SELECT * FROM voice_profiles WHERE user_id = $1 AND is_active = TRUE ORDER BY created_at DESC LIMIT 1",
      [userId],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async listByUser(userId: number): Promise<VoiceProfileRecord[]> {
    const rows = await this.db.query<VoiceProfileRow>(
      "SELECT * FROM voice_profiles WHERE user_id = $1 ORDER BY created_at DESC",
      [userId],
    );
    return rows.map(toRecord);
  }
}
