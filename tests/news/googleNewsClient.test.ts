import { describe, expect, it, vi, afterEach } from "vitest";
import { RealGoogleNewsClient, isResultStale, DEFAULT_RECENCY_DAYS } from "../../src/news/googleNewsClient.js";
import { NewsRetrievalError } from "../../src/utils/errors.js";
import type { RawNewsCandidate } from "../../src/news/googleNewsRss.js";

function feedWithOneItem(title: string, link: string, pubDate?: string): string {
  return `<rss><channel><item><title>${title}</title><link>${link}</link>${
    pubDate ? `<pubDate>${pubDate}</pubDate>` : ""
  }</item></channel></rss>`;
}

function mockFetchSequence(...responses: Array<{ ok: boolean; status?: number; body: string } | Error>) {
  const fetchMock = vi.fn();
  for (const response of responses) {
    if (response instanceof Error) {
      fetchMock.mockRejectedValueOnce(response);
    } else {
      fetchMock.mockResolvedValueOnce({
        ok: response.ok,
        status: response.status ?? 200,
        text: () => Promise.resolve(response.body),
      });
    }
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("RealGoogleNewsClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("appends the recency operator to the first attempt", async () => {
    const fetchMock = mockFetchSequence({ ok: true, body: feedWithOneItem("A", "https://news.google.com/rss/articles/a") });
    const client = new RealGoogleNewsClient();

    await client.search("cosmetic preservative");

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(new URL(url).searchParams.get("q")).toBe(`cosmetic preservative when:${DEFAULT_RECENCY_DAYS}d`);
  });

  it("returns results from the recency-constrained query when it succeeds with candidates", async () => {
    mockFetchSequence({ ok: true, body: feedWithOneItem("A", "https://news.google.com/rss/articles/a") });
    const client = new RealGoogleNewsClient();

    const results = await client.search("cosmetic preservative");

    expect(results).toHaveLength(1);
    expect(results[0]?.searchQuery).toBe(`cosmetic preservative when:${DEFAULT_RECENCY_DAYS}d`);
  });

  it("falls back to the bare query when the recency-constrained query throws", async () => {
    const fetchMock = mockFetchSequence(
      new Error("network error"),
      { ok: true, body: feedWithOneItem("B", "https://news.google.com/rss/articles/b") },
    );
    const client = new RealGoogleNewsClient();

    const results = await client.search("cosmetic preservative");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [fallbackUrl] = fetchMock.mock.calls[1] as [string];
    expect(new URL(fallbackUrl).searchParams.get("q")).toBe("cosmetic preservative");
    expect(results[0]?.searchQuery).toBe("cosmetic preservative");
  });

  it("falls back to the bare query when the recency-constrained query returns no results", async () => {
    const fetchMock = mockFetchSequence(
      { ok: true, body: `<rss><channel></channel></rss>` },
      { ok: true, body: feedWithOneItem("B", "https://news.google.com/rss/articles/b") },
    );
    const client = new RealGoogleNewsClient();

    const results = await client.search("cosmetic preservative");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(1);
  });

  it("propagates NewsRetrievalError when both the recency and fallback queries fail", async () => {
    mockFetchSequence(new Error("network error 1"), new Error("network error 2"));
    const client = new RealGoogleNewsClient();

    await expect(client.search("cosmetic preservative")).rejects.toThrow(NewsRetrievalError);
  });
});

function candidate(publishedAt: string | null): RawNewsCandidate {
  return {
    title: "t",
    source: "s",
    googleNewsUrl: "https://news.google.com/rss/articles/x",
    publishedAt,
    description: null,
    searchQuery: "q",
    fetchedAt: new Date().toISOString(),
  };
}

describe("isResultStale", () => {
  it("is false when most dated candidates are within the recency window", () => {
    const now = Date.now();
    const recent = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(isResultStale([candidate(recent), candidate(recent)])).toBe(false);
  });

  it("is true when most dated candidates are older than the recency window", () => {
    const old = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
    expect(isResultStale([candidate(old), candidate(old)])).toBe(true);
  });

  it("is false when no candidates have a usable publication date (can't judge staleness)", () => {
    expect(isResultStale([candidate(null), candidate(null)])).toBe(false);
  });

  it("is false for an empty candidate list", () => {
    expect(isResultStale([])).toBe(false);
  });
});
