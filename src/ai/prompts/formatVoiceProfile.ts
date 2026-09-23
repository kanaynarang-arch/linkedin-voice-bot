import type { VoiceProfile } from "../../domain/types.js";

function section(title: string, group: { stable: string[]; occasional: string[] }): string {
  const stable = group.stable.map((s) => `  - ${s}`).join("\n");
  const occasional = group.occasional.length
    ? `\n  Occasional:\n${group.occasional.map((s) => `  - ${s}`).join("\n")}`
    : "";
  return `${title}:\n  Stable:\n${stable}${occasional}`;
}

/** Renders a VoiceProfile into a readable block for inclusion in an AI prompt. */
export function formatVoiceProfileForPrompt(profile: VoiceProfile): string {
  return [
    `AUTHOR ESSENCE:\n  ${profile.authorEssence}`,
    section("TONE & PERSONALITY", profile.tonePersonality),
    section("WRITING RHYTHM", profile.writingRhythm),
    section("VOCABULARY", profile.vocabulary),
    section("HOOKS", profile.hooks),
    section("STRUCTURE", profile.structure),
    section("STORYTELLING", profile.storytelling),
    section("THINKING STYLE", profile.thinkingStyle),
    `SIGNATURE PATTERNS:\n${profile.signaturePatterns.map((s) => `  - ${s}`).join("\n")}`,
    `AVOIDANCE PATTERNS (never do these):\n${profile.avoidancePatterns.map((s) => `  - ${s}`).join("\n")}`,
    `CORE VOICE FINGERPRINT (the rules that matter most):\n${profile.coreFingerprint
      .map((s, i) => `  ${i + 1}. ${s}`)
      .join("\n")}`,
  ].join("\n\n");
}
