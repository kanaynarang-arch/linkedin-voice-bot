import type { GenerateParams } from "../provider.js";
import type { RawNewsCandidate } from "../../news/googleNewsRss.js";

const DOMAIN_CONTEXT = `The system is being built for a founder of an Indian D2C skincare company. Use this only as professional/domain context for understanding terminology and generating relevant search concepts (things like: skincare, cosmetics, formulation, cosmetic ingredients, ingredient safety, preservatives, formulation changes, cosmetic manufacturing, suppliers, ingredient sourcing, supplier documentation, quality control, testing, regulatory developments, cosmetic claims, labeling, ingredient transparency, manufacturing standards, scientific developments relevant to skincare, consumer/product safety). Do not hard-code searches around these categories for every thought - the raw thought itself must determine the concepts. Default to an English + India-oriented perspective, but international articles are fully in scope when the development (science, regulation, ingredient safety, manufacturing, global suppliers, research) is genuinely relevant.`;

const QUERY_PLAN_SCHEMA_DESCRIPTION = `{
  "concepts": string[] (the core underlying concepts extracted from the raw thought - not the raw sentence itself, 1-8 items),
  "queries": [
    {
      "query": string (a focused Google News search query for one concept),
      "concept": string (which extracted concept this targets),
      "pass": 1 | 2 | 3
    }
  ] (1-12 items)
}`;

/**
 * Step 1+2 of the pipeline: turn a raw founder thought into extracted
 * concepts and a staged set of focused Google News search queries. Kept as
 * one LLM call (rather than two) since query generation is directly
 * downstream of concept extraction and both outputs are validated together.
 */
export function buildIndustryHookQueryPlanPrompt(rawThought: string): GenerateParams {
  const systemInstruction = `You turn a founder's raw, unfiltered thought into a small set of focused Google News search queries that could surface genuinely relevant current external industry developments - developments that provide factual/contextual hooks for that specific thought, not just "interesting industry news."

${DOMAIN_CONTEXT}

Step 1 - Understand the thought. Extract its underlying concepts: core subject, specific mechanism/process, relevant technical concepts, industry context, potential external-development categories. Do not simply reuse the raw sentence as a search query. Keep the concept set focused, not a huge taxonomy.

Step 2 - Generate focused queries from those concepts. Prefer specific technical concepts, specific industry mechanisms, specific regulatory/manufacturing/scientific developments, specific supplier/ingredient issues. Avoid generic queries like "skincare news" or "beauty news" unless the thought genuinely requires that level of breadth.

Do NOT search for: LinkedIn posts, viral content, social media trends, content ideas, engagement advice, the founder, the founder's company, or generic "things to post about." Search for the external development itself, never for content about the founder's thought.

Use a staged approach and tag every query with a pass:
- Pass 1 (most queries should be here): the most direct concepts from the thought.
- Pass 2: closely related conceptual expansion - only include if pass 1 concepts alone seem unlikely to surface enough.
- Pass 3: broader industry/regulatory/scientific expansion - only include if 1 and 2 seem unlikely to be enough. Do not broaden indefinitely.

Output strictly valid JSON matching this shape, no markdown fences, no commentary outside the JSON:
${QUERY_PLAN_SCHEMA_DESCRIPTION}`;

  const prompt = `Raw thought, exactly as sent by the founder:\n"""\n${rawThought.trim()}\n"""`;

  return { systemInstruction, prompt };
}

const EVALUATION_SCHEMA_DESCRIPTION = `{
  "evaluations": [
    {
      "candidateIndex": number (0-based index into the candidate list below, exactly as given - never invent one),
      "verdict": "qualifies" | "insufficient_evidence",
      "hookStrength": number 0-10 (only meaningful when verdict is "qualifies" - use 0 otherwise),
      "connectionType": "supports" | "illustrates" | "expands" | "contradicts" | "updates" | "contextualizes" (only meaningful when verdict is "qualifies"),
      "relevanceReason": string (factual, specific, grounded only in the given metadata),
      "hookConnection": string (why THIS article is useful for THIS thought - grounded only in the given metadata)
    }
  ]
}`;

/**
 * Step 5 of the pipeline: judge a batch of already-retrieved RSS candidates
 * against the raw thought. The model is explicitly restricted to the
 * provided RSS metadata - it must never use prior knowledge of what an
 * article "probably" says, and must reject rather than speculate when the
 * metadata is too thin to establish a genuine connection.
 */
export function buildHookEvaluationPrompt(
  rawThought: string,
  concepts: string[],
  candidates: RawNewsCandidate[],
): GenerateParams {
  const systemInstruction = `You evaluate whether retrieved Google News articles are genuinely relevant external hooks for a founder's raw thought - nothing else. A qualifying hook is external context, not proof: it must never be treated as validating the founder's observation, experience, or conclusion.

${DOMAIN_CONTEXT}

You may reason ONLY over: the raw thought, the extracted concepts below, and each candidate's title/description/source/publication date/search query exactly as given. You must NEVER use prior knowledge of what an article might contain, invent facts, quotes, statistics, or details not present in the given metadata, or assume a title implies details that aren't actually there. If the available metadata is insufficient to establish a genuine, specific connection, mark it "insufficient_evidence" - do not speculate. Prefer rejecting a candidate over guessing.

Evaluate on: (A) direct relevance - does it directly concern the issue in the thought; (B) conceptual relevance - same underlying mechanism even if worded differently; (C) contextual usefulness; (D) timeliness; (E) specificity - the connection must be specific and meaningful, not merely "same broad industry." An article about general market growth does NOT qualify for a thought about a specific supplier/formulation issue merely because both are skincare-related.

Assign exactly one connectionType to every qualifying candidate:
- supports: provides evidence/reporting consistent with the thought (this does not mean it proves the founder's specific personal experience).
- illustrates: a concrete real-world example of the same issue.
- expands: adds a dimension, consequence, mechanism, or implication not present in the thought.
- contradicts: materially challenges or conflicts with the assumption/claim in the thought.
- updates: a newer development that changes or updates the factual context.
- contextualizes: broader factual/industry context that helps situate the thought.

Do not infer causality the metadata doesn't support - use neutral language ("occurred alongside", "provides context for", "illustrates a similar issue", "is related to") rather than manufacturing a causal claim. Do not describe an article as proving the founder was right unless that exact proposition is explicitly supported by the given metadata, which will generally not be the case.

hookStrength (0.0-10.0) measures how useful this specific article is as an external hook for this specific thought - conceptual connection strength, usefulness as context, specificity, timeliness, and sufficiency of evidence. Do not use publisher fame as a substitute for relevance.

Output strictly valid JSON matching this shape, no markdown fences, no commentary outside the JSON:
${EVALUATION_SCHEMA_DESCRIPTION}`;

  const candidateList = candidates
    .map((c, index) => {
      const lines = [
        `[${index}] title: ${c.title}`,
        `    source: ${c.source ?? "(unknown)"}`,
        `    publishedAt: ${c.publishedAt ?? "(unknown)"}`,
        `    searchQuery: ${c.searchQuery}`,
      ];
      if (c.description) lines.push(`    description: ${c.description}`);
      return lines.join("\n");
    })
    .join("\n\n");

  const prompt = `Raw thought:\n"""\n${rawThought.trim()}\n"""\n\nExtracted concepts: ${concepts.join(", ")}\n\nCandidates (evaluate every index, 0 through ${candidates.length - 1}):\n${candidateList}`;

  return { systemInstruction, prompt };
}
