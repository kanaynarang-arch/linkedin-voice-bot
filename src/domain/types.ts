import { z } from "zod";

/**
 * Shape of an extracted Voice Profile. Mirrors the "stable vs. occasional"
 * distinction that makes voice extraction useful: stable traits are the
 * ones that show up almost everywhere and should drive every draft;
 * occasional traits show up sometimes and should be used sparingly.
 */
export const VoiceProfileSchema = z.object({
  authorEssence: z
    .string()
    .describe("2-4 sentence description of the author's core posture and worldview as a writer."),
  tonePersonality: z.object({
    stable: z.array(z.string()).min(1),
    occasional: z.array(z.string()).default([]),
  }),
  writingRhythm: z.object({
    stable: z.array(z.string()).min(1),
    occasional: z.array(z.string()).default([]),
  }),
  vocabulary: z.object({
    stable: z.array(z.string()).min(1),
    occasional: z.array(z.string()).default([]),
  }),
  hooks: z.object({
    stable: z.array(z.string()).min(1),
    occasional: z.array(z.string()).default([]),
  }),
  structure: z.object({
    stable: z.array(z.string()).min(1),
    occasional: z.array(z.string()).default([]),
  }),
  storytelling: z.object({
    stable: z.array(z.string()).min(1),
    occasional: z.array(z.string()).default([]),
  }),
  thinkingStyle: z.object({
    stable: z.array(z.string()).min(1),
    occasional: z.array(z.string()).default([]),
  }),
  signaturePatterns: z.array(z.string()).min(1),
  avoidancePatterns: z.array(z.string()).default([]),
  coreFingerprint: z
    .array(z.string())
    .min(3)
    .describe("Ranked, numbered list of the ~5-10 rules that most define this author's voice."),
});
export type VoiceProfile = z.infer<typeof VoiceProfileSchema>;

/**
 * The eight factors the AI scores independently, each 0-10. Deliberately
 * excludes the aggregate 0.0-10.0 linkedin_score itself - that's computed
 * deterministically from these in linkedinScoreService.ts rather than
 * trusted to the model, so the final score is reproducible and testable
 * rather than one more free-form number the model might round or format
 * inconsistently.
 */
export const LinkedinScoreDimensionsSchema = z.object({
  professionalRelevance: z.number().min(0).max(10).describe("How relevant the idea is to a professional audience."),
  knowledgeValue: z
    .number()
    .min(0)
    .max(10)
    .describe("Does it teach, explain, clarify, or provide useful professional knowledge?"),
  originalPerspective: z
    .number()
    .min(0)
    .max(10)
    .describe("Does it contain a distinctive, non-generic insight or point of view?"),
  dwellReadPotential: z
    .number()
    .min(0)
    .max(10)
    .describe("Does the substance give a professional reader a reason to stop and read rather than skip?"),
  conversationPotential: z
    .number()
    .min(0)
    .max(10)
    .describe("Could it naturally lead to meaningful professional discussion (not artificial engagement bait)?"),
  timeliness: z
    .number()
    .min(0)
    .max(10)
    .describe("Does the idea have a meaningful reason to matter now, based only on what's in the thought itself? Evergreen ideas can still score highly."),
  shareSaveUtility: z
    .number()
    .min(0)
    .max(10)
    .describe("Would the idea be useful enough that a professional might save or share it?"),
  authenticityAntiSlop: z
    .number()
    .min(0)
    .max(10)
    .describe("Does it contain genuine substance and perspective rather than generic, repetitive, empty content? Not an AI-detector."),
  reasoning: z
    .string()
    .min(1)
    .describe("Concise explanation of the scoring - which specific factors drove it up or down, and why."),
});
export type LinkedinScoreDimensions = z.infer<typeof LinkedinScoreDimensionsSchema>;

export interface LinkedinScoreRecord extends LinkedinScoreDimensions {
  id: number;
  ideaId: number;
  linkedinScore: number;
  model: string;
  createdAt: string;
}

/**
 * LLM output for turning a raw thought into a staged Google News search
 * plan. `concepts` are the underlying ideas extracted from the thought
 * (never the raw sentence itself); `queries` are focused searches derived
 * from those concepts, each tagged with which staging pass it belongs to
 * so retrieval can stop broadening once enough candidates have been found.
 */
export const IndustryHookQueryPlanSchema = z.object({
  concepts: z
    .array(z.string().min(1))
    .min(1)
    .max(8)
    .describe("The core underlying concepts extracted from the raw thought - not the raw sentence itself."),
  queries: z
    .array(
      z.object({
        query: z.string().min(1).describe("A focused Google News search query for one extracted concept."),
        concept: z.string().min(1).describe("Which extracted concept this query targets."),
        pass: z
          .union([z.literal(1), z.literal(2), z.literal(3)])
          .describe(
            "1 = most specific/direct concepts. 2 = closely related conceptual expansion, only if pass 1 concepts alone are unlikely to be enough. 3 = broader industry/regulatory/scientific expansion, only if 1 and 2 are unlikely to be enough.",
          ),
      }),
    )
    .min(1)
    .max(12),
});
export type IndustryHookQueryPlan = z.infer<typeof IndustryHookQueryPlanSchema>;

/** The six ways a qualifying external article can relate to the raw thought - see linkedinScore.ts's sibling, industryHooks.ts, for the full definitions used in the prompt. */
export const HOOK_CONNECTION_TYPES = [
  "supports",
  "illustrates",
  "expands",
  "contradicts",
  "updates",
  "contextualizes",
] as const;
export const HookConnectionTypeSchema = z.enum(HOOK_CONNECTION_TYPES);
export type HookConnectionType = z.infer<typeof HookConnectionTypeSchema>;

/**
 * LLM output for judging a batch of retrieved RSS candidates against the
 * raw thought. Deliberately excludes ground-truth article metadata (title,
 * url, source, dates) - the model only ever supplies judgment fields here;
 * `candidateIndex` is how the caller re-attaches that judgment to the real,
 * retrieved candidate, so nothing the model outputs can overwrite or
 * fabricate factual article data.
 */
export const HookEvaluationSchema = z.object({
  evaluations: z.array(
    z.object({
      candidateIndex: z
        .number()
        .int()
        .min(0)
        .describe("The 0-based index of the candidate in the list you were given, exactly as provided - never invent an index."),
      verdict: z
        .enum(["qualifies", "insufficient_evidence"])
        .describe("insufficient_evidence if the provided RSS metadata doesn't establish a genuine, specific connection to the raw thought."),
      hookStrength: z
        .number()
        .min(0)
        .max(10)
        .describe("0.0-10.0: how useful this article is as an external hook for this specific thought. Only meaningful when verdict is 'qualifies' - use 0 otherwise."),
      connectionType: HookConnectionTypeSchema.describe("Only meaningful when verdict is 'qualifies'."),
      relevanceReason: z
        .string()
        .min(1)
        .describe("Concise, factual reason grounded only in the provided RSS metadata - why this candidate passed, or if insufficient_evidence, why it didn't."),
      hookConnection: z
        .string()
        .min(1)
        .describe(
          "Concise explanation of the relationship between this article and the raw thought. Must not claim the article proves or validates the raw thought, and must not assert causality the RSS metadata doesn't support. If insufficient_evidence, briefly restate that no genuine connection could be established.",
        ),
    }),
  ),
});
export type HookEvaluation = z.infer<typeof HookEvaluationSchema>;

export type HookRecency = "CURRENT" | "RECENT" | "OLDER" | "UNKNOWN";

/**
 * One qualifying external development, ready for a downstream system to
 * decide how (or whether) to use it. Factual fields (title, source, urls,
 * dates, searchQuery, fetchedAt) always come straight from the retrieved
 * RSS candidate; only hookStrength/connectionType/relevanceReason/
 * hookConnection come from the LLM's judgment.
 */
export interface IndustryHook {
  title: string;
  source: string | null;
  googleNewsUrl: string;
  /** Only populated when a canonical publisher URL is safely available without fetching the article page - null otherwise. */
  canonicalUrl: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  recency: HookRecency;
  searchQuery: string;
  hookStrength: number;
  connectionType: HookConnectionType;
  relevanceReason: string;
  hookConnection: string;
}

export type IndustryHookResult =
  | { status: "hooks_found"; hooks: IndustryHook[] }
  | { status: "no_relevant_hook"; hooks: [] };

/**
 * Gemini drafting call output. `usedNewsHook` is the model's own signal
 * for whether it actually incorporated the offered news hook into the
 * post text - the Telegram NEWS SOURCE/verify block (section 34) is only
 * ever shown when this is true, never just because a hook was available.
 */
export const DraftResponseSchema = z.object({
  draft: z.string().min(1).describe("The finished LinkedIn post, ready for human review."),
  usedNewsHook: z
    .boolean()
    .describe(
      "true only if a news hook was provided AND the post actually references/incorporates it. false if no hook was provided, or one was provided but didn't genuinely fit and was left out.",
    ),
});
export type DraftResponse = z.infer<typeof DraftResponseSchema>;

export type IdeaStatus =
  | "captured"
  | "not_worth_developing"
  | "worth_developing"
  | "drafted";

export interface IdeaRecord {
  id: number;
  userId: number;
  rawText: string;
  status: IdeaStatus;
  createdAt: string;
}

/** The Review Gate decision (section 36-37) - Meera's own call, recorded, never triggering publication. */
export type DraftStatus = "pending" | "approved" | "rejected";

export interface DraftRecord {
  id: number;
  ideaId: number;
  content: string;
  version: number;
  feedback: string | null;
  model: string;
  status: DraftStatus;
  /** The single Google News RSS hook offered to this draft's generation, if any - null if none was found/used. */
  newsHook: IndustryHook | null;
  /** Whether the draft's text actually incorporated newsHook (vs. it being available but left out). Always false when newsHook is null. */
  usedNewsHook: boolean;
  createdAt: string;
}

export interface LinkedInPostRecord {
  id: number;
  userId: number;
  content: string;
  createdAt: string;
}

export interface VoiceProfileRecord {
  id: number;
  userId: number;
  profile: VoiceProfile;
  postCount: number;
  model: string;
  isActive: boolean;
  createdAt: string;
}

export interface UserRecord {
  id: number;
  telegramChatId: string;
  createdAt: string;
}
