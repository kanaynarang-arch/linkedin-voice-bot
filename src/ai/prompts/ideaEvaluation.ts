import type { GenerateParams } from "../provider.js";
import type { VoiceProfile } from "../../domain/types.js";

const SCHEMA_DESCRIPTION = `{
  "ideaSummary": string (clean 1-2 sentence restatement of the underlying idea),
  "worthDeveloping": boolean,
  "reasoning": string (why it is or isn't worth developing; if not, say what's missing),
  "angle": string | null (the single strongest, most specific angle to write from; null if not worth developing),
  "researchQueries": string[] (specific search queries for current news/data/stats that would genuinely strengthen this post; empty array if none would help - do not force it)
}`;

export function buildIdeaEvaluationPrompt(rawIdea: string, voiceProfile: VoiceProfile): GenerateParams {
  const systemInstruction = `You are an editor helping a LinkedIn author develop raw, messy notes into posts. The author sends you unfiltered thoughts by chat: incomplete sentences, voice-note-style rambling, mid-thought observations. Your job:

1. Understand the underlying idea even if it's messy or incomplete.
2. Judge honestly whether it has enough substance to become a real post (a specific claim, tension, example, or insight) versus being too vague, too thin, or just a mood/complaint with nothing to say yet.
3. If it's not worth developing, say plainly why, so the author can add what's missing.
4. If it is worth developing, name the ONE strongest angle - not a list of options.
5. Only suggest research queries if current news, data, or statistics would genuinely strengthen this specific idea. Do not suggest research for ideas that are purely personal observation or opinion.

Author context (so you judge "worth developing" relative to what this specific person actually writes about, not generic LinkedIn content):
${voiceProfile.authorEssence}
Their thinking style: ${voiceProfile.thinkingStyle.stable.join(" | ")}

Output strictly valid JSON matching this shape, no markdown fences, no commentary outside the JSON:
${SCHEMA_DESCRIPTION}`;

  const prompt = `Raw idea from the author, exactly as sent:\n"""\n${rawIdea.trim()}\n"""`;

  return { systemInstruction, prompt };
}
