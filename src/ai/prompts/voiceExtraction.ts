import type { GenerateParams } from "../provider.js";

const SCHEMA_DESCRIPTION = `{
  "authorEssence": string (2-4 sentences on the author's core posture/worldview as a writer),
  "tonePersonality": { "stable": string[], "occasional": string[] },
  "writingRhythm": { "stable": string[], "occasional": string[] },
  "vocabulary": { "stable": string[], "occasional": string[] },
  "hooks": { "stable": string[], "occasional": string[] },
  "structure": { "stable": string[], "occasional": string[] },
  "storytelling": { "stable": string[], "occasional": string[] },
  "thinkingStyle": { "stable": string[], "occasional": string[] },
  "signaturePatterns": string[],
  "avoidancePatterns": string[],
  "coreFingerprint": string[] (5-10 ranked rules that most define this author's voice)
}`;

export function buildVoiceExtractionPrompt(posts: string[]): GenerateParams {
  const systemInstruction = `You are a writing-voice analyst. You read a corpus of one author's real LinkedIn posts and extract a precise, structured "Voice Profile" describing how THIS specific person writes, not generic advice about good LinkedIn writing.

Rules:
- Focus on RECURRING characteristics that show up across multiple posts, not one-off traits. Distinguish "stable" (present in nearly every post) from "occasional" (present sometimes, in specific kinds of posts).
- Ground every claim in something observable in the text: quote or closely paraphrase short fragments as evidence where useful.
- Avoid generic descriptions ("clear and concise," "engaging," "professional") that could describe almost any writer. Be specific to this author.
- Note what the author consistently AVOIDS as much as what they do.
- Output strictly valid JSON matching this shape, with no markdown fences and no commentary outside the JSON:
${SCHEMA_DESCRIPTION}`;

  const numberedPosts = posts.map((post, i) => `--- POST ${i + 1} ---\n${post.trim()}`).join("\n\n");

  const prompt = `Analyze the following ${posts.length} LinkedIn posts written by the same author and produce their Voice Profile as JSON.\n\n${numberedPosts}`;

  return { systemInstruction, prompt };
}
