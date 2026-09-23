import type { IdeaPipelineResult } from "../domain/ideaPipeline.js";
import type { ResearchSource, VoiceProfile } from "../domain/types.js";
import { formatDate } from "./telegramUtils.js";

function formatSources(sources: ResearchSource[]): string {
  return sources
    .slice(0, 3)
    .map((s) => `  - ${s.title}: ${s.url}`)
    .join("\n");
}

/** Renders a completed idea-pipeline run into the IDEA/DECISION/ANGLE/... template. */
export function formatPipelineResult(result: IdeaPipelineResult): string {
  const lines: string[] = ["IDEA", result.analysis.ideaSummary, "", "DECISION"];

  if (!result.analysis.worthDeveloping) {
    lines.push("Not worth developing", "", "WHY NOT", result.analysis.reasoning);
    lines.push("", `Disagree? Send /write ${result.idea.id} to get a draft anyway.`);
    return lines.join("\n");
  }

  lines.push("Worth developing", "", "ANGLE", result.analysis.angle || "(none identified)");

  if (result.research?.used && result.research.summary) {
    lines.push("", "CURRENT CONTEXT", result.research.summary);
    if (result.research.sources.length > 0) {
      lines.push(formatSources(result.research.sources));
    }
  }

  if (result.draft) {
    lines.push("", "DRAFT", result.draft.content);
    lines.push(
      "",
      `Review before posting. Reply "/rewrite ${result.idea.id} <feedback>" to revise, or "/write ${result.idea.id}" to regenerate from scratch.`,
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
