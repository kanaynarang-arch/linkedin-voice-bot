import type { GenerateParams } from "../provider.js";
import type { IndustryHook, VoiceProfile } from "../../domain/types.js";
import { formatVoiceProfileForPrompt } from "./formatVoiceProfile.js";

export interface DraftGenerationInput {
  rawIdea: string;
  voiceProfile: VoiceProfile;
  /** The single strongest Google News RSS hook found for this idea, if any - never forced, see BASE_RULES. */
  newsHook: IndustryHook | null;
  recentPostExcerpts: string[];
  /** When set, this is a rewrite: the previous draft plus the author's feedback on it. */
  rewrite?: { previousDraft: string; feedback: string };
}

const SCHEMA_DESCRIPTION = `{
  "draft": string (the finished LinkedIn post, ready for human review),
  "usedNewsHook": boolean (true only if a news hook was provided below AND the post actually references/incorporates it - false if none was provided, or one was provided but didn't genuinely fit and you left it out)
}`;

const BASE_RULES = `You write a single LinkedIn post on behalf of one specific author, using their Voice Profile below. The idea has already been judged worth developing - your job is only to turn it into a post, never to reconsider whether it's good enough. The post must:
- Preserve the author's underlying idea and intent exactly - do not change what they meant, and do not invent experiences, anecdotes, customers, numbers, or opinions the author did not give you. If the raw note is uncertain, preserve that uncertainty rather than turning speculation into fact.
- Sound like this author specifically: match their tone, rhythm, vocabulary, structure, and signature patterns from the Voice Profile.
- Never copy or closely paraphrase sentences from their past posts (shown below only as pattern reference, not content to reuse).
- Never force a hook, call-to-action, story structure, or news angle if it doesn't genuinely fit this idea - it is better to be shorter and honest than to pad with generic LinkedIn structure.
- Avoid generic AI/LinkedIn language: no "In today's fast-paced world," no "game-changer," no engagement-bait questions, no emoji unless the voice profile's avoidance patterns say the author actually uses them.
- If a news hook is provided below and it genuinely strengthens the point, you may incorporate it briefly and attribute it naturally (e.g. "a recent report found..."); an article is external context, not proof of the author's claim - never present it as validating or confirming what the author experienced. Do not force it in if it doesn't fit; it is completely normal and expected to leave it out.
- Output strictly valid JSON matching this shape, no markdown fences, no commentary outside the JSON:
${SCHEMA_DESCRIPTION}`;

function formatNewsHook(hook: IndustryHook): string {
  return `\n\nOPTIONAL NEWS HOOK (use only if it genuinely strengthens the post - do not force it):
Title: ${hook.title}
Source: ${hook.source ?? "unknown"}${hook.publishedAt ? `\nPublished: ${hook.publishedAt}` : ""}
Relationship to the idea (${hook.connectionType}): ${hook.hookConnection}`;
}

export function buildDraftGenerationPrompt(input: DraftGenerationInput): GenerateParams {
  const systemInstruction = `You are a ghostwriter who writes exclusively in one author's voice, never your own.\n\n${BASE_RULES}\n\nVOICE PROFILE:\n${formatVoiceProfileForPrompt(input.voiceProfile)}`;

  const excerpts = input.recentPostExcerpts.length
    ? `\n\nPATTERN REFERENCE ONLY (past posts by this author - study the patterns, never reuse the sentences):\n${input.recentPostExcerpts
        .map((p, i) => `--- REFERENCE ${i + 1} ---\n${p.trim()}`)
        .join("\n\n")}`
    : "";

  const newsHook = input.newsHook ? formatNewsHook(input.newsHook) : "";

  if (input.rewrite) {
    const prompt = `RAW NOTE FROM AUTHOR: ${input.rawIdea}${newsHook}

PREVIOUS DRAFT:\n"""\n${input.rewrite.previousDraft}\n"""

AUTHOR'S FEEDBACK ON THAT DRAFT:\n"""\n${input.rewrite.feedback}\n"""

Rewrite the post to address this feedback directly while still following the Voice Profile and all rules above. Do not just append the feedback as new text - integrate it properly.${excerpts}`;
    return { systemInstruction, prompt };
  }

  const prompt = `RAW NOTE FROM AUTHOR: ${input.rawIdea}${newsHook}\n\nWrite the post now.${excerpts}`;

  return { systemInstruction, prompt };
}
