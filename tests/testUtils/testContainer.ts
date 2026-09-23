import { newDb } from "pg-mem";
import type pg from "pg";
import { wrapPool, applySchema, type Database } from "../../src/db/client.js";
import { buildContainerFromParts, type Container } from "../../src/container.js";
import { FakeAIProvider } from "./fakeAIProvider.js";

export interface TestSetup {
  container: Container;
  ai: FakeAIProvider;
}

/**
 * An in-memory Postgres database (pg-mem, driven through the real `pg`
 * wire-compatible adapter) with the app schema applied. Repository code
 * never knows it isn't talking to a real Postgres/Neon instance.
 */
export async function createTestDb(): Promise<Database> {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool() as unknown as pg.Pool;

  const db = wrapPool(pool);
  await applySchema(db);
  return db;
}

/** Builds a fully wired container backed by an in-memory Postgres database and a fake AI provider. */
export async function createTestSetup(minPostsForAnalysis = 3): Promise<TestSetup> {
  const db = await createTestDb();
  const ai = new FakeAIProvider();
  const container = buildContainerFromParts(db, ai, minPostsForAnalysis);
  return { container, ai };
}

const SAMPLE_VOICE_PROFILE = {
  authorEssence: "A formulation-trained founder who closes the gap between labels and chemistry.",
  tonePersonality: { stable: ["measured, dry irony"], occasional: ["personal reflection"] },
  writingRhythm: { stable: ["long explanation then short punch sentence"], occasional: [] },
  vocabulary: { stable: ["pH", "the gap between X and Y"], occasional: ["Mumbai"] },
  hooks: { stable: ["opens with a concrete claim or statistic"], occasional: [] },
  structure: { stable: ["hook, mechanism, case example, disclaimer, action, reframe"], occasional: [] },
  storytelling: { stable: ["dated, specific anecdotes; own company data"], occasional: [] },
  thinkingStyle: { stable: ["separates legal claims from substantiated claims"], occasional: [] },
  signaturePatterns: ["I'm not saying X - I'm saying Y"],
  avoidancePatterns: ["no emojis", "no hashtags"],
  coreFingerprint: [
    "Opens with a concrete, numeric hook",
    "Breaks claims into ~3 causal conditions",
    "Uses the not-X-but-Y contrast device",
  ],
};

/** Returns a deep-cloned sample Voice Profile JSON payload, valid against VoiceProfileSchema. */
export function sampleVoiceProfilePayload(): typeof SAMPLE_VOICE_PROFILE {
  return JSON.parse(JSON.stringify(SAMPLE_VOICE_PROFILE));
}
