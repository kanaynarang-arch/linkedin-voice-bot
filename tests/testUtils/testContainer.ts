import { newDb } from "pg-mem";
import type pg from "pg";
import { wrapPool, applySchema, type Database } from "../../src/db/client.js";
import { buildContainerFromParts, type Container } from "../../src/container.js";
import { FakeAIProvider } from "./fakeAIProvider.js";
import { FakeGoogleNewsClient } from "./fakeGoogleNewsClient.js";

export interface TestSetup {
  container: Container;
  ai: FakeAIProvider;
  newsClient: FakeGoogleNewsClient;
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

/**
 * Builds a fully wired container backed by an in-memory Postgres database,
 * a fake AI provider, and a fake Google News client (so no test ever makes
 * a live network call, even indirectly through the idea pipeline's news step).
 */
export async function createTestSetup(minPostsForAnalysis = 3, minContentScore = 6.0): Promise<TestSetup> {
  const db = await createTestDb();
  const ai = new FakeAIProvider();
  const newsClient = new FakeGoogleNewsClient();
  const container = buildContainerFromParts(db, ai, minPostsForAnalysis, minContentScore, newsClient);
  return { container, ai, newsClient };
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

const SAMPLE_PASSING_SCORE_DIMENSIONS = {
  professionalRelevance: 8,
  knowledgeValue: 7,
  originalPerspective: 6,
  dwellReadPotential: 7,
  conversationPotential: 6,
  timeliness: 7,
  shareSaveUtility: 6,
  authenticityAntiSlop: 8,
  reasoning: "Concrete professional observation with a specific example and a distinctive angle.",
};

/** A LinkedinScoreDimensions payload whose average is 6.875 -> 6.9, comfortably above the default 6.0 content gate. */
export function samplePassingScoreDimensionsPayload(): typeof SAMPLE_PASSING_SCORE_DIMENSIONS {
  return JSON.parse(JSON.stringify(SAMPLE_PASSING_SCORE_DIMENSIONS));
}

const SAMPLE_WEAK_SCORE_DIMENSIONS = {
  professionalRelevance: 3,
  knowledgeValue: 2,
  originalPerspective: 2,
  dwellReadPotential: 3,
  conversationPotential: 2,
  timeliness: 3,
  shareSaveUtility: 2,
  authenticityAntiSlop: 3,
  reasoning: "No concrete claim, example, or data point - just a vague operational note.",
};

/** A LinkedinScoreDimensions payload whose average is 2.5, comfortably below the default 6.0 content gate. */
export function sampleWeakScoreDimensionsPayload(): typeof SAMPLE_WEAK_SCORE_DIMENSIONS {
  return JSON.parse(JSON.stringify(SAMPLE_WEAK_SCORE_DIMENSIONS));
}

/** A LinkedinScoreDimensions payload where every dimension equals `value`, so the aggregate score is exactly `value` - for gate-boundary tests. */
export function uniformScoreDimensionsPayload(value: number): Record<string, number | string> {
  return {
    professionalRelevance: value,
    knowledgeValue: value,
    originalPerspective: value,
    dwellReadPotential: value,
    conversationPotential: value,
    timeliness: value,
    shareSaveUtility: value,
    authenticityAntiSlop: value,
    reasoning: `Uniform test score of ${value}.`,
  };
}
