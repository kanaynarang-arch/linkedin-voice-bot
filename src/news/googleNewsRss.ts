import { XMLParser } from "fast-xml-parser";
import { NewsRetrievalError } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("google-news-rss");

const GOOGLE_NEWS_RSS_BASE = "https://news.google.com/rss/search";
const REQUEST_TIMEOUT_MS = 8000;

/**
 * One article as retrieved from Google News RSS, before any LLM judgment
 * is applied. Every field here is ground truth from the feed (or null if
 * the feed didn't supply it) - nothing here is ever inferred or invented.
 */
export interface RawNewsCandidate {
  title: string;
  /** Publisher/source name as supplied by the feed, e.g. "Reuters". */
  source: string | null;
  /** The exact URL returned by the feed - typically a news.google.com redirect, not the publisher's canonical URL. */
  googleNewsUrl: string;
  /** ISO 8601, or null if the feed's pubDate was missing or unparseable. */
  publishedAt: string | null;
  description: string | null;
  /** The exact query string that produced this candidate. */
  searchQuery: string;
  /** When this candidate was retrieved (not when the article was published). */
  fetchedAt: string;
}

export interface GoogleNewsLocale {
  hl: string;
  gl: string;
  ceid: string;
}

/** English + India edition by default - the founder this is built for is India-based, per product context. */
export const DEFAULT_LOCALE: GoogleNewsLocale = { hl: "en-US", gl: "IN", ceid: "IN:en" };

/**
 * Builds a Google News RSS search URL. This is a documented-by-observation
 * retrieval pattern, not an officially published Google News API contract -
 * see the implementation summary for the usage/production caveat.
 */
export function buildGoogleNewsRssUrl(query: string, locale: GoogleNewsLocale = DEFAULT_LOCALE): string {
  const params = new URLSearchParams({ q: query, hl: locale.hl, gl: locale.gl, ceid: locale.ceid });
  return `${GOOGLE_NEWS_RSS_BASE}?${params.toString()}`;
}

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

/**
 * Parses a Google News RSS XML response into candidates. Pure and
 * deterministic - no network I/O - so it's directly unit-testable against
 * fixture XML strings without mocking fetch.
 */
export function parseGoogleNewsRssXml(xml: string, searchQuery: string, fetchedAt: string): RawNewsCandidate[] {
  let parsed: unknown;
  try {
    parsed = xmlParser.parse(xml);
  } catch (cause) {
    throw new NewsRetrievalError(`Malformed Google News RSS XML for query "${searchQuery}"`, cause);
  }

  const channel = asRecord(parsed)?.rss && asRecord(asRecord(parsed)?.rss)?.channel;
  if (!channel || typeof channel !== "object") {
    throw new NewsRetrievalError(`Unexpected Google News RSS structure for query "${searchQuery}"`);
  }

  const rawItems = asRecord(channel)?.item;
  if (rawItems === undefined) return [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];

  const candidates: RawNewsCandidate[] = [];
  for (const item of items) {
    const record = asRecord(item);
    if (!record) continue;

    const title = typeof record.title === "string" ? record.title.trim() : "";
    const link = typeof record.link === "string" ? record.link.trim() : "";
    // Missing title or link means this item can't be used - skip it rather
    // than fabricating either field.
    if (!title || !link) continue;

    candidates.push({
      title: decodeEntities(title),
      source: extractSource(record.source),
      googleNewsUrl: link,
      publishedAt: normalizePubDate(record.pubDate),
      description: typeof record.description === "string" && record.description.trim()
        ? decodeEntities(record.description.trim())
        : null,
      searchQuery,
      fetchedAt,
    });
  }
  return candidates;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function extractSource(source: unknown): string | null {
  if (typeof source === "string") return source.trim() || null;
  const record = asRecord(source);
  const text = record?.["#text"];
  return typeof text === "string" && text.trim() ? text.trim() : null;
}

function normalizePubDate(pubDate: unknown): string | null {
  if (typeof pubDate !== "string" || !pubDate.trim()) return null;
  const date = new Date(pubDate);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Fetches and parses one Google News RSS search. The only function in this
 * module that performs network I/O - everything else here is pure.
 */
export async function fetchGoogleNewsRss(
  query: string,
  locale: GoogleNewsLocale = DEFAULT_LOCALE,
): Promise<RawNewsCandidate[]> {
  const url = buildGoogleNewsRssUrl(query, locale);
  const fetchedAt = new Date().toISOString();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; linkedin-voice-bot/1.0)" },
    });
  } catch (cause) {
    throw new NewsRetrievalError(`Google News RSS request failed for query "${query}"`, cause);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new NewsRetrievalError(`Google News RSS returned HTTP ${response.status} for query "${query}"`);
  }

  const xml = await response.text();
  if (!xml.trim()) {
    throw new NewsRetrievalError(`Google News RSS returned an empty response for query "${query}"`);
  }

  const candidates = parseGoogleNewsRssXml(xml, query, fetchedAt);
  log.debug("Fetched Google News RSS", { query, count: candidates.length });
  return candidates;
}
