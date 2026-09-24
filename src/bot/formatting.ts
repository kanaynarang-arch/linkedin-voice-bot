import type { IdeaPipelineResult, NewsStatus } from "../domain/ideaPipeline.js";
import type { IndustryHook, VoiceProfile } from "../domain/types.js";
import { formatDate } from "./telegramUtils.js";

/**
 * The mandatory NEWS SOURCE / verify block (section 34 of the audit spec).
 * Shown when a draft incorporated the selected hook - using a hook is now
 * mandatory whenever one qualifies (ideaPipeline.ts), so in practice this
 * shows whenever `newsStatus` is "relevant_hook_found" - and Meera is
 * explicitly told to verify it herself before publishing; a qualifying
 * article is context, not proof of her claim.
 */
function formatNewsSourceBlock(hook: IndustryHook): string {
  const date = hook.publishedAt ? formatDate(hook.publishedAt) : "date unknown";
  const source = hook.source ?? "unknown source";
  return [
    "─────────────────────────────────",
    `NEWS SOURCE: ${hook.title}`,
    `FROM: ${source} · ${date}`,
    `LINK: ${hook.googleNewsUrl}`,
    "⚠ Check this before publishing — you are the author of this claim",
    "─────────────────────────────────",
  ].join("\n");
}

/**
 * A one-line, always-shown summary of what the Google News step actually
 * did - distinct from the NEWS SOURCE block, which only appears when a
 * hook was found. Without this, "nothing relevant found" and "the lookup
 * failed" were indistinguishable from Telegram alone (both just show no
 * source block). The "found but not used" case is kept for defensive
 * completeness even though using a qualifying hook is now mandatory
 * (ideaPipeline.ts always sets usedNewsHook = Boolean(newsHook)), so it
 * shouldn't currently be reachable in practice.
 */
function formatNewsStatusLine(newsStatus: NewsStatus, usedNewsHook: boolean): string {
  switch (newsStatus) {
    case "relevant_hook_found":
      return usedNewsHook
        ? "NEWS: found and used"
        : "NEWS: found a candidate, but it didn't fit - drafted without it";
    case "no_relevant_hook":
      return "NEWS: nothing relevant found";
    case "retrieval_failure":
      return "NEWS: lookup failed - drafted without it";
    case "not_searched":
      return "NEWS: not searched";
  }
}

/** Renders a completed idea-pipeline run: score, gate decision, and (if it passed) the draft. */
export function formatPipelineResult(result: IdeaPipelineResult): string {
  const scoreLine = `SCORE: ${result.score.linkedinScore.toFixed(1)}/10.0`;

  if (!result.passed) {
    return [
      scoreLine,
      "",
      "DECISION: Not worth developing",
      "",
      "WHY NOT",
      result.score.reasoning,
      "",
      `Disagree? Send /write ${result.idea.id} to get a draft anyway.`,
    ].join("\n");
  }

  const lines: string[] = [scoreLine, "", "DECISION: Worth developing"];

  if (result.draft) {
    lines.push("", formatNewsStatusLine(result.newsStatus, result.draft.usedNewsHook));
    lines.push("", "DRAFT", result.draft.content);

    if (result.draft.usedNewsHook && result.draft.newsHook) {
      lines.push("", formatNewsSourceBlock(result.draft.newsHook));
    }

    lines.push(
      "",
      `Review before posting - you decide whether and how to publish. Reply "/rewrite ${result.idea.id} <feedback>" to revise, "/write ${result.idea.id}" to regenerate from scratch, or "/approve ${result.idea.id}" / "/reject ${result.idea.id}" to record your decision.`,
    );
  }

  return lines.join("\n");
}

function bulletList(items: string[]): string {
  return items.length ? items.map((s) => `  • ${s}`).join("\n") : "  (none)";
}

/** Human-readable rendering of a Voice Profile for the /profile command. */
export function formatVoiceProfileSummary(profile: VoiceProfile, postCount: number, createdAt: string): string {
  return [
    `VOICE PROFILE (built from ${postCount} posts on ${formatDate(createdAt)})`,
    "",
    "Author essence:",
    `  ${profile.authorEssence}`,
    "",
    "Tone & personality (stable):",
    bulletList(profile.tonePersonality.stable),
    "",
    "Writing rhythm (stable):",
    bulletList(profile.writingRhythm.stable),
    "",
    "Hooks (stable):",
    bulletList(profile.hooks.stable),
    "",
    "Structure (stable):",
    bulletList(profile.structure.stable),
    "",
    "Signature patterns:",
    bulletList(profile.signaturePatterns),
    "",
    "Avoidance patterns:",
    bulletList(profile.avoidancePatterns),
    "",
    "Core voice fingerprint:",
    profile.coreFingerprint.map((s, i) => `  ${i + 1}. ${s}`).join("\n"),
  ].join("\n");
}
