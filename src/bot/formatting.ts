import type { IdeaPipelineResult } from "../domain/ideaPipeline.js";
import type { IndustryHook, VoiceProfile } from "../domain/types.js";
import { formatDate } from "./telegramUtils.js";

/**
 * The mandatory NEWS SOURCE / verify block (section 34 of the audit spec).
 * Shown ONLY when a draft actually incorporated the selected hook - never
 * just because a hook was retrieved - and Meera is explicitly told to
 * verify it herself before publishing; a qualifying article is context,
 * not proof of her claim.
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
