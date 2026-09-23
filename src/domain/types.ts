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

export const IdeaEvaluationSchema = z.object({
  ideaSummary: z.string().min(1).describe("A clean one-to-two sentence restatement of the underlying idea."),
  worthDeveloping: z.boolean(),
  reasoning: z
    .string()
    .min(1)
    .describe("Why this is or isn't worth developing into a post. If not worth developing, explain what's missing."),
  angle: z
    .string()
    .nullable()
    .describe("The strongest specific angle to write from. Null if not worth developing."),
  researchQueries: z
    .array(z.string())
    .default([])
    .describe("Specific search queries for current news/data that would genuinely strengthen this idea. Empty if none would help."),
});
export type IdeaEvaluation = z.infer<typeof IdeaEvaluationSchema>;

export interface ResearchSource {
  title: string;
  url: string;
}

export interface ResearchResult {
  used: boolean;
  summary: string | null;
  sources: ResearchSource[];
}

export const DraftResponseSchema = z.object({
  draft: z.string().min(1).describe("The finished LinkedIn post, ready for human review."),
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

export interface AnalysisRecord {
  id: number;
  ideaId: number;
  ideaSummary: string;
  worthDeveloping: boolean;
  reasoning: string;
  angle: string | null;
  researchJson: string | null;
  model: string;
  createdAt: string;
}

export interface DraftRecord {
  id: number;
  ideaId: number;
  analysisId: number;
  content: string;
  version: number;
  feedback: string | null;
  model: string;
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
