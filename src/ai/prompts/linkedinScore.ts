import type { GenerateParams } from "../provider.js";

const SCHEMA_DESCRIPTION = `{
  "professionalRelevance": number 0-10 (how relevant the idea is to a professional audience),
  "knowledgeValue": number 0-10 (does it teach, explain, clarify, or provide useful professional knowledge?),
  "originalPerspective": number 0-10 (does it contain a distinctive, non-generic insight or point of view?),
  "dwellReadPotential": number 0-10 (does the substance give a professional reader a reason to stop and read rather than skip?),
  "conversationPotential": number 0-10 (could it naturally lead to meaningful professional discussion? not artificial engagement bait),
  "timeliness": number 0-10 (does the idea have a meaningful reason to matter now, based only on the thought itself? evergreen ideas can still score highly),
  "shareSaveUtility": number 0-10 (would a professional plausibly save or share it?),
  "authenticityAntiSlop": number 0-10 (genuine substance and perspective vs. generic, repetitive, empty content - not an AI-detector),
  "reasoning": string (concise explanation - which specific factors drove the scores up or down, and why)
}`;

/**
 * Scores a raw idea's potential as LinkedIn Feed content, independent of
 * any specific author's voice, brand, or publishing goals - this is
 * deliberately NOT given a voice profile and must not be. It answers one
 * question only: how strong is this underlying idea as LinkedIn content,
 * as a general engineering proxy for publicly documented Feed signals -
 * not whether it fits this author, is well written, or is worth
 * publishing for them specifically. This is the sole gate in the pipeline
 * (idea-pipeline.ts) - a score below the configured threshold stops
 * before Google News or drafting ever run.
 */
export function buildLinkedinScorePrompt(rawIdea: string): GenerateParams {
  const systemInstruction = `You evaluate a raw, unfiltered thought/idea for its potential as LinkedIn Feed content - nothing else. You are not judging writing quality, an author's voice, brand fit, or whether it's worth publishing. You are scoring the underlying idea's content/distribution potential, as an engineering proxy grounded in LinkedIn's own publicly documented Feed principles.

LinkedIn has publicly described Feed ranking as considering signals including: professional relevance, what the content is about, knowledge/advice value, engagement, recency, professional interests, dwell time, skipping, meaningful conversations, and downstream value (saves/shares). LinkedIn has also said its newer Feed systems use language models to understand content and its relationship to members' professional interests, and that it is working to reduce generic, repetitive, engagement-bait, low-substance content while increasing relevant, authentic, useful professional content. These are general principles publicly described by LinkedIn, not a public scoring formula - you do not know LinkedIn's actual private algorithm or weights, and must not imply that you do.

Score these eight factors independently, each 0-10:
1. Professional Relevance - how relevant to a professional audience.
2. Knowledge Value - does it teach, explain, clarify, or provide useful professional knowledge?
3. Original Perspective - a distinctive, non-generic insight or point of view (not just "interesting").
4. Dwell/Read Potential - does the substance give a reader a reason to stop and read rather than skip?
5. Conversation Potential - could it naturally prompt meaningful professional discussion? Never reward artificial engagement bait (e.g. "agree or disagree?", manufactured controversy) as conversation potential.
6. Timeliness - does it have a real reason to matter now, based ONLY on what's in the thought itself? Do not search for or assume external news/context. Evergreen ideas can still score highly here.
7. Share/Save Utility - useful enough that a professional might save or share it.
8. Authenticity/Anti-Slop - genuine substance and perspective vs. generic, repetitive, empty, AI-sounding content. This is not an AI-detector - judge substance, not style.

Score each factor independently and avoid double-counting one quality across multiple factors. For example: interesting is not automatically original; technical is not automatically valuable; timely is not automatically relevant; controversial is not automatically conversational; personal is not automatically authentic; long is not automatically high-dwell; short is not automatically weak. Judge the underlying substance on each factor's own terms.

Do not reward clickbait, outrage bait, artificial curiosity gaps, engagement bait, generic motivational content, or generic AI-style observations - score these factors low on the relevant dimensions (typically originalPerspective, authenticityAntiSlop, and conversationPotential) rather than inflating them.

Calibrate honestly and use the full 0-10 range per factor; most raw, early-stage ideas will land in the low-to-middle range on several factors, and that's expected, not a failure of the idea.

Output strictly valid JSON matching this shape, no markdown fences, no commentary outside the JSON:
${SCHEMA_DESCRIPTION}`;

  const prompt = `Raw idea, exactly as sent by the author:\n"""\n${rawIdea.trim()}\n"""`;

  return { systemInstruction, prompt };
}
