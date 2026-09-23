import { loadEnv } from "../src/config/env.js";
import { openDatabase } from "../src/db/client.js";
import { UsersRepository } from "../src/db/repositories/users.js";
import { VoiceProfilesRepository } from "../src/db/repositories/voiceProfiles.js";
import { VoiceProfileSchema } from "../src/domain/types.js";

const PROFILE = {
  authorEssence:
    "A formulation-trained founder who writes to close the gap between what skincare labels claim and what the underlying chemistry actually supports. The recurring posture is \"I have technical access most readers don't, and I'm going to hand it over plainly, including the parts that make my own company look unfinished.\" The writing behaves like a technical memo that has been made readable, not like marketing copy that has been made to sound technical. Credibility is built through disclosure of limits (own failures, unresolved product development, incomplete evidence) rather than through claims of authority.",
  tonePersonality: {
    stable: [
      "Measured and even-tempered even when describing failures or industry malpractice; no outrage, no moral grandstanding.",
      "Confident about mechanism/science, deliberately hedged about certainty where evidence is thin (\"the clinical results are more variable\").",
      "Dry, restrained irony rather than jokes - humor lands through understatement, not wit-for-its-own-sake, e.g. \"This is legal. It is also not helpful.\" / \"She didn't, which is a reasonable outcome...\"",
      "Self-implicating: includes her own company/past self among those who got it wrong (\"by us in our early formulations,\" \"it took us embarrassingly long\").",
      "Talks to the reader as a capable adult (\"you,\" direct address) without flattery or urgency-manufacturing.",
    ],
    occasional: [
      "A single moment of open personal reflection near the end of longer pieces (the 18-months retrospective, the Vitamin C email) - not present in every piece, mainly the \"Founder Story\" category.",
    ],
  },
  writingRhythm: {
    stable: [
      "Alternates long explanatory paragraphs with short, standalone punch-sentences or punch-paragraphs (often 3-8 words) used for emphasis or closure of a point, e.g. \"Nobody else in the room asked about it. The formulation passed review. I left the company 7 months later.\"",
      "Frequently sequences three short declarative sentences in a row to land a conclusion (triadic cadence), often stripping conjunctions.",
      "Long sentences are used for mechanism/causal explanation; short sentences are used for verdicts.",
      "Paragraph breaks are frequent - rarely more than 5-6 sentences before a new paragraph, even mid-argument.",
    ],
    occasional: [
      "One-sentence paragraphs used as a section pivot (\"Here's why it matters.\" / \"Here's what I want you to take from this.\").",
    ],
  },
  vocabulary: {
    stable: [
      "Formulation/clinical register used unglossed but explained in-line: pH, CoA, INCI, bioavailable, occlusive, humectant, penetration, degradation, vasodilation, stratum corneum, transepidermal water loss.",
      "Recurring qualifier phrases: \"I want to be [precise/clear/honest/careful] about...\", \"to be fair,\" \"in practice,\" \"the honest answer is.\"",
      "Recurring evaluative closers: \"that's useful information,\" \"that tells you something,\" \"worth investigating further,\" \"worth doing.\"",
      "Recurring frame: \"the gap between X and Y\" (label vs. chemistry, formulation science vs. marketing communication, mechanism vs. commercial efficacy).",
      "Uses precise figures instead of vague quantifiers at every opportunity (23%, 71%, pH 3.2, 67% repeat rate, 4-6 months) - including for her own brand's failures, not just for external critique.",
    ],
    occasional: [
      "Light India-market vocabulary anchoring (Mumbai, Chennai, Kochi, Kolkata; Indian UV index; Indian cosmetic labelling guidelines) - used only in India-specific pieces, not a constant tic.",
    ],
  },
  hooks: {
    stable: [
      "Opens with a specific, concrete claim, scene, or statistic - never a general statement, never a question, never a platitude, e.g. \"The niacinamide serum you're using probably has...\" / \"In 2021 I was sitting in a stability review meeting...\" / \"In the 12 months to June 2025, 23% of our product returns...\"",
      "Newsletters open with the salutation \"Hi,\" directly followed by the hook - no warm-up small talk.",
      "The hook typically implies a claim that will be complicated or corrected over the course of the piece (a label number, a claim on a banner, a customer's simple question).",
    ],
    occasional: [],
  },
  structure: {
    stable: [
      "Recurring shape across nearly all pieces: 1) Concrete hook (fact, scene, or claim to be examined). 2) Mechanism/science explanation broken into enumerated conditions (frequently exactly three: pH / delivery base / batch consistency; penetration / concentration / stability). 3) A case example - usually Skinstinct's own data or process, including where it fell short. 4) An explicit disclaimer paragraph pre-empting misinterpretation (\"I'm not saying X... What I'm saying is Y\"). 5) A reader-facing action: what to ask, what to look for, what documentation to request. 6) A short closing line that reframes or downplays the piece itself rather than summarizing it.",
      "Newsletters additionally: always sign off with \"Meera\" on its own line; often include an explicit non-commercial disclaimer (\"I'm not selling a sunscreen,\" \"we don't currently sell a Vitamin C product\") before the close.",
    ],
    occasional: [],
  },
  storytelling: {
    stable: [
      "Anecdotes are dated and specific (\"Last September,\" \"In 2021,\" \"18 months of Skinstinct\") rather than generalized (\"once, a customer...\").",
      "Own-company data is used as evidence, including negative data (return rates, reformulation, a founder leaving a job after a compliance gap).",
      "Never invents a composite/hypothetical customer story for effect - anecdotes are either her own experience or aggregate company data.",
      "Founder-story pieces explicitly reject the \"inspiring origin story\" framing (\"It is not a particularly inspiring story,\" \"I wasn't sure I had a celebration version of this year to give you\").",
    ],
    occasional: [],
  },
  thinkingStyle: {
    stable: [
      "Cause-and-effect chains stated explicitly and sequentially (\"X happens because Y, which means Z\").",
      "Regularly separates \"legal/regulated\" from \"meaningful/substantiated\" as two different axes - this distinction reappears across multiple pieces (label claims, \"clinically tested,\" \"natural,\" fragrance).",
      "Steelmans the opposing or industry-standard position before critiquing it (clean beauty, parabens, natural claims) rather than dismissing it outright.",
      "Explicitly refuses binary framings (\"That binary is one of the most unproductive framings in skincare\").",
      "Converts every abstract science point into a concrete \"what this means for you\" instruction before closing.",
    ],
    occasional: [],
  },
  signaturePatterns: [
    "The disclaimer-contrast construction: \"I'm not saying [X]. I'm saying [Y].\" / \"I want to be precise about what I'm not saying here.\"",
    "Ending on an evaluative, not summarizing, sentence - the last line often reframes the piece's purpose rather than recapping content.",
    "Explicit non-sales disclaimers embedded inside educational content, even when the topic is adjacent to a product Skinstinct could sell.",
    "Disclosure of unresolved/ongoing problems (a Vitamin C product 14 months in development and still not launched; \"one has been in development for over a year... I've learned not to assume\").",
    "Percentage/data-first sentences used as topic sentences rather than as supporting evidence buried mid-paragraph.",
    "Dash-based appositive clarification (\"the vehicle, the base that carries the actives, is calibrated for a different climate\").",
  ],
  avoidancePatterns: [
    "No emojis, no exclamation marks, no hashtags anywhere in the corpus.",
    "No hype/superlative marketing language (\"game-changer,\" \"must-have,\" \"obsessed,\" \"holy grail\").",
    "No bullet-point-heavy formatting - arguments are carried in prose paragraphs, not listicles.",
    "No rhetorical question strings used for engagement-bait; questions, when used, are functional (posed by a customer, or posed to a brand rep) rather than addressed rhetorically to the reader for effect.",
    "No direct product pitch inside educational content - plugs are actively disclaimed rather than inserted.",
    "No composite/invented customer anecdotes; no unfalsifiable claims of \"everyone\" or \"no one\" without a stated data source.",
    "No all-caps for emphasis (all-caps appears once, quoting someone else's banner verbatim, not as her own device).",
  ],
  coreFingerprint: [
    "Opens every piece with a concrete, dated, or numeric hook - never a general statement or an engagement question.",
    "Breaks technical claims into enumerated causal conditions, most often exactly three, before drawing a conclusion.",
    "Uses the explicit contrast device \"I'm not saying X - I'm saying Y\" roughly once per piece to pre-empt misreading.",
    "Alternates long, causal explanatory paragraphs with short (often single-sentence) paragraphs used purely for rhetorical punch or closure.",
    "Treats her own company's failures and unresolved projects as evidence of credibility, always naming specific numbers and the corrective action taken.",
    "Closes with a reader-directed action (what to ask, request, or look for) rather than a content summary, and follows it with a short reframing line rather than a recap.",
    "Maintains a hard separation between \"legally permitted claim\" and \"substantiated/meaningful claim,\" applying this lens to nearly every topic (labels, \"clinical,\" \"natural,\" fragrance-free).",
    "Disclaims commercial motive explicitly whenever the topic borders a product category Skinstinct could sell.",
    "Never uses emojis, exclamation marks, hashtags, superlatives, or bulleted listicle formatting; all argument is carried in prose.",
    "Newsletters are framed by a fixed ritual: open with \"Hi,\" close with \"Meera,\" with no other salutation variation across the corpus.",
  ],
};

async function main(): Promise<void> {
  const env = loadEnv();
  const parsed = VoiceProfileSchema.parse(PROFILE);

  const db = await openDatabase(env.DATABASE_URL);
  const users = new UsersRepository(db);
  const voiceProfiles = new VoiceProfilesRepository(db);

  const user = await users.getOrCreate(env.TELEGRAM_CHAT_ID);
  const record = await voiceProfiles.save(user.id, parsed, 15, "manual-import:linkedin_voice_profile.txt");

  console.log(`Imported voice profile #${record.id} for user ${user.id} (chat ${env.TELEGRAM_CHAT_ID}).`);
  await db.close();
}

main().catch((error) => {
  console.error("Import failed:", error);
  process.exit(1);
});
