import {
  fetchGoogleNewsRss,
  DEFAULT_LOCALE,
  type RawNewsCandidate,
  type GoogleNewsLocale,
} from "./googleNewsRss.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("google-news-client");

export const DEFAULT_RECENCY_DAYS = 30;

/**
 * Retrieves candidates for one conceptual search query. Kept as an
 * interface (mirroring AIProvider) so the domain-level
 * hook service never depends on Google News RSS directly, and so tests can
 * inject a fake instead of hitting the network.
 */
export interface GoogleNewsClient {
  search(conceptQuery: string): Promise<RawNewsCandidate[]>;
}

/**
 * Production client: tries the recency-constrained query first (`when:30d`),
 * and falls back to the bare query if the constrained one fails or comes
 * back empty - `when:30d` is an observed query pattern, not a documented,
 * guaranteed API contract, so it must degrade gracefully rather than being
 * trusted blindly.
 */
export class RealGoogleNewsClient implements GoogleNewsClient {
  constructor(
    private readonly locale: GoogleNewsLocale = DEFAULT_LOCALE,
    private readonly recencyDays: number = DEFAULT_RECENCY_DAYS,
  ) {}

  async search(conceptQuery: string): Promise<RawNewsCandidate[]> {
    const recentQuery = `${conceptQuery} when:${this.recencyDays}d`;

    try {
      const candidates = await fetchGoogleNewsRss(recentQuery, this.locale);
      if (candidates.length > 0) {
        if (isResultStale(candidates)) {
          log.warn("Recency-constrained Google News query returned mostly stale results", {
            query: recentQuery,
          });
        }
        return candidates;
      }
      // Empty result from the constrained query isn't necessarily a real
      // "nothing exists" - fall through to the unconstrained query below.
    } catch (cause) {
      log.warn("Recency-constrained Google News query failed; retrying without the recency operator", {
        query: recentQuery,
        cause,
      });
    }

    return fetchGoogleNewsRss(conceptQuery, this.locale);
  }
}

/**
 * A `when:Nd`-constrained query is supposed to return recent results, but
 * that's an observed behavior, not a guarantee. If most of what it actually
 * returned is old, treat the result as potentially degraded so callers
 * don't silently trust a stale feed as current news (recency is still
 * classified per-article afterwards regardless of this signal).
 */
export function isResultStale(candidates: RawNewsCandidate[], recencyDays = DEFAULT_RECENCY_DAYS): boolean {
  const withDates = candidates.filter((c): c is RawNewsCandidate & { publishedAt: string } =>
    Boolean(c.publishedAt),
  );
  if (withDates.length === 0) return false;

  const now = Date.now();
  const currentCount = withDates.filter((c) => {
    const ageDays = (now - new Date(c.publishedAt).getTime()) / (1000 * 60 * 60 * 24);
    return ageDays >= 0 && ageDays <= recencyDays;
  }).length;

  return currentCount / withDates.length < 0.5;
}
