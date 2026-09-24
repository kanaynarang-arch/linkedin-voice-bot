import type { AIProvider } from "../ai/provider.js";
import { generateValidatedJSON } from "../ai/structuredOutput.js";
import { buildIndustryHookQueryPlanPrompt, buildHookEvaluationPrompt } from "../ai/prompts/industryHooks.js";
import type { GoogleNewsClient } from "../news/googleNewsClient.js";
import type { RawNewsCandidate } from "../news/googleNewsRss.js";
import {
  IndustryHookQueryPlanSchema,
  HookEvaluationSchema,
  type HookRecency,
  type IndustryHook,
  type IndustryHookResult,
} from "./types.js";
import { NewsRetrievalError, ValidationError } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("industry-hook-service");

/** Only candidates scoring at or above this are returned as qualifying hooks. Centralized here, not scattered through the module. */
export const HOOK_MINIMUM_SCORE = 6.0;
/** Never return more than this many hooks, even if more qualify. */
export const MAX_HOOKS = 5;
/** Once retrieval has yielded at least this many raw candidates, stop broadening to later search passes. */
const RETRIEVAL_STOP_THRESHOLD = 6;
const SEARCH_PASSES = [1, 2, 3] as const;

/**
 * Deterministic recency classification. `referenceTime` is normally "now",
 * but is threaded through explicitly so tests don't depend on real time
 * passing. UNKNOWN (not OLDER) is used whenever the date can't be trusted -
 * missing, unparseable, or in the future - rather than guessing.
 */
export function classifyRecency(publishedAt: string | null, referenceTime: Date): HookRecency {
  if (!publishedAt) return "UNKNOWN";
  const published = new Date(publishedAt);
  if (Number.isNaN(published.getTime())) return "UNKNOWN";

  const ageMs = referenceTime.getTime() - published.getTime();
  if (ageMs < 0) return "UNKNOWN";

  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays <= 30) return "CURRENT";
  if (ageDays <= 90) return "RECENT";
  return "OLDER";
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Article-level dedup: the same article retrieved via multiple queries collapses to one entry. */
export function dedupeArticles(candidates: RawNewsCandidate[]): RawNewsCandidate[] {
  const seen = new Set<string>();
  const result: RawNewsCandidate[] = [];
  for (const candidate of candidates) {
    const key = candidate.googleNewsUrl || `${normalizeTitle(candidate.title)}|${candidate.source ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

/**
 * Event-level dedup: several publishers can cover the same underlying
 * development. v1 groups qualifying hooks by near-identical normalized
 * title (not semantic/fuzzy clustering - a known, documented limitation)
 * and keeps only the strongest one per group, so publisher count never
 * substitutes for evidence strength.
 */
export function dedupeEvents(hooks: IndustryHook[]): IndustryHook[] {
  const byEvent = new Map<string, IndustryHook>();
  for (const hook of hooks) {
    const key = normalizeTitle(hook.title);
    const existing = byEvent.get(key);
    if (!existing || hook.hookStrength > existing.hookStrength) {
      byEvent.set(key, hook);
    }
  }
  return Array.from(byEvent.values());
}

function groupQueriesByPass(
  queries: { query: string; concept: string; pass: 1 | 2 | 3 }[],
): Map<1 | 2 | 3, { query: string; concept: string; pass: 1 | 2 | 3 }[]> {
  const map = new Map<1 | 2 | 3, { query: string; concept: string; pass: 1 | 2 | 3 }[]>();
  for (const q of queries) {
    const list = map.get(q.pass) ?? [];
    list.push(q);
    map.set(q.pass, list);
  }
  return map;
}

/**
 * Raw thought -> Google News RSS -> relevant external industry hooks.
 * Depends only on AIProvider and GoogleNewsClient (both interfaces), so it
 * has no idea it's talking to Gemini or to Google News specifically, and no
 * idea about Telegram, LinkedIn scoring, drafting, or voice - this is a
 * standalone mechanism a downstream system can call independently.
 */
export class IndustryHookService {
  constructor(
    private readonly ai: AIProvider,
    private readonly newsClient: GoogleNewsClient,
  ) {}

  async findHooks(rawThought: string): Promise<IndustryHookResult> {
    const trimmed = rawThought.trim();
    if (!trimmed) {
      throw new ValidationError("Empty raw thought", "Send a thought to find relevant industry hooks for.");
    }

    const planPrompt = buildIndustryHookQueryPlanPrompt(trimmed);
    const plan = await generateValidatedJSON(
      this.ai,
      IndustryHookQueryPlanSchema,
      planPrompt.systemInstruction,
      planPrompt.prompt,
    );

    const queriesByPass = groupQueriesByPass(plan.queries);

    let allCandidates: RawNewsCandidate[] = [];
    let attemptedAnyQuery = false;
    let anyQuerySucceeded = false;

    for (const pass of SEARCH_PASSES) {
      if (allCandidates.length >= RETRIEVAL_STOP_THRESHOLD) break;

      const queries = queriesByPass.get(pass) ?? [];
      for (const q of queries) {
        attemptedAnyQuery = true;
        try {
          const candidates = await this.newsClient.search(q.query);
          anyQuerySucceeded = true;
          allCandidates.push(...candidates);
        } catch (cause) {
          log.warn("Google News search failed for one query; continuing with the remaining queries", {
            query: q.query,
            cause,
          });
        }
      }
    }

    if (attemptedAnyQuery && !anyQuerySucceeded) {
      throw new NewsRetrievalError(`All Google News searches failed for thought: "${trimmed}"`);
    }

    const deduped = dedupeArticles(allCandidates);
    if (deduped.length === 0) {
      log.info("No candidates retrieved for thought", { thought: trimmed });
      return { status: "no_relevant_hook", hooks: [] };
    }

    const evalPrompt = buildHookEvaluationPrompt(trimmed, plan.concepts, deduped);
    const evaluation = await generateValidatedJSON(
      this.ai,
      HookEvaluationSchema,
      evalPrompt.systemInstruction,
      evalPrompt.prompt,
    );

    const referenceTime = new Date();
    const hooks: IndustryHook[] = [];
    for (const item of evaluation.evaluations) {
      if (item.verdict !== "qualifies") continue;
      if (item.hookStrength < HOOK_MINIMUM_SCORE) continue;

      const candidate = deduped[item.candidateIndex];
      // Guard against an out-of-range index: never build a hook that isn't
      // backed by a real, retrieved candidate.
      if (!candidate) continue;

      hooks.push({
        title: candidate.title,
        source: candidate.source,
        googleNewsUrl: candidate.googleNewsUrl,
        canonicalUrl: null,
        publishedAt: candidate.publishedAt,
        fetchedAt: candidate.fetchedAt,
        recency: classifyRecency(candidate.publishedAt, referenceTime),
        searchQuery: candidate.searchQuery,
        hookStrength: item.hookStrength,
        connectionType: item.connectionType,
        relevanceReason: item.relevanceReason,
        hookConnection: item.hookConnection,
      });
    }

    const ranked = dedupeEvents(hooks)
      .sort((a, b) => b.hookStrength - a.hookStrength)
      .slice(0, MAX_HOOKS);

    if (ranked.length === 0) {
      return { status: "no_relevant_hook", hooks: [] };
    }
    return { status: "hooks_found", hooks: ranked };
  }
}
