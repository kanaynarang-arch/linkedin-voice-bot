import type { GenerateParams } from "../provider.js";
import type { VoiceProfile } from "../../domain/types.js";
import { formatVoiceProfileForPrompt } from "./formatVoiceProfile.js";

export interface DraftGenerationInput {
  ideaSummary: string;
  rawIdea: string;
  angle: string;
  voiceProfile: VoiceProfile;
  researchSummary: string | null;
  recentPostExcerpts: string[];
  /** When set, this is a rewrite: the previous draft plus the author's feedback on it. */
  rewrite?: { previousDraft: string; feedback: string };
}

const BASE_RULES = `You write a single LinkedIn post on behalf of one specific author, using their Voice Profile below. The post must:
- Preserve the author's underlying idea and intent exactly - do not change what they meant.
- Sound like this author specifically: match their tone, rhythm, vocabulary, structure, and signature patterns from the Voice Profile.
- Never copy or closely paraphrase sentences from their past posts (shown below only as pattern reference, not content to reuse).
- Never invent personal experiences, anecdotes, numbers, or opinions the author did not give you. If the idea doesn't include a personal anecdote, don't manufacture one.
- Never force a hook, call-to-action, story structure, or news angle if it doesn't genuinely fit this idea - it is better to be shorter and honest than to pad with generic LinkedIn structure.
- Avoid generic AI/LinkedIn language: no "In today's fast-paced world," no "game-changer," no engagement-bait questions, no emoji unless the voice profile's avoidance patterns say the author actually uses them.
- If a research summary is provided and it genuinely strengthens the point, you may incorporate it briefly and attribute it naturally (e.g. "a recent report found..."); do not force it in if it doesn't fit.
- Output ONLY the finished post text. No preamble, no explanation, no markdown headers, no quotation marks wrapping the whole thing.`;

export function buildDraftGenerationPrompt(input: DraftGenerationInput): GenerateParams {
  const systemInstruction = `You are a ghostwriter who writes exclusively in one author's voice, never your own.\n\n${BASE_RULES}\n\nVOICE PROFILE:\n${formatVoiceProfileForPrompt(input.voiceProfile)}`;

  const excerpts = input.recentPostExcerpts.length
    ? `\n\nPATTERN REFERENCE ONLY (past posts by this author - study the patterns, never reuse the sentences):\n${input.recentPostExcerpts
        .map((p, i) => `--- REFERENCE ${i + 1} ---\n${p.trim()}`)
        .join("\n\n")}`
    : "";

  const research = input.researchSummary
    ? `\n\nCURRENT CONTEXT AVAILABLE (use only if it genuinely strengthens the post):\n${input.researchSummary}`
    : "";

  if (input.rewrite) {
    const prompt = `IDEA: ${input.ideaSummary}\nRAW NOTE FROM AUTHOR: ${input.rawIdea}\nANGLE: ${input.angle}${research}

PREVIOUS DRAFT:\n"""\n${input.rewrite.previousDraft}\n"""

AUTHOR'S FEEDBACK ON THAT DRAFT:\n"""\n${input.rewrite.feedback}\n"""

Rewrite the post to address this feedback directly while still following the Voice Profile and all rules above. Do not just append the feedback as new text - integrate it properly.${excerpts}`;
    return { systemInstruction, prompt };
  }

  const prompt = `IDEA: ${input.ideaSummary}\nRAW NOTE FROM AUTHOR: ${input.rawIdea}\nANGLE: ${input.angle}${research}\n\nWrite the post now.${excerpts}`;

  return { systemInstruction, prompt };
}
