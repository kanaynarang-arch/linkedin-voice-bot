import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildGoogleNewsRssUrl,
  parseGoogleNewsRssXml,
  fetchGoogleNewsRss,
  DEFAULT_LOCALE,
} from "../../src/news/googleNewsRss.js";
import { NewsRetrievalError } from "../../src/utils/errors.js";

const VALID_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>"cosmetic preservative" - Google News</title>
<item>
<title>Cosmetic makers reassess preservative blends &amp; supplier disclosures</title>
<link>https://news.google.com/rss/articles/CBMiXYZ</link>
<guid isPermaLink="false">abc123</guid>
<pubDate>Mon, 01 Sep 2025 10:00:00 GMT</pubDate>
<description>Manufacturers are re-evaluating preservative systems after new supplier disclosure practices.</description>
<source url="https://industrywire.example.com">Industry Wire</source>
</item>
<item>
<title>Second article, same story</title>
<link>https://news.google.com/rss/articles/CBMiOther</link>
<pubDate>Tue, 02 Sep 2025 08:30:00 GMT</pubDate>
<source url="https://other.example.com">Other Outlet</source>
</item>
</channel>
</rss>`;

describe("buildGoogleNewsRssUrl", () => {
  it("URL-encodes the query and includes locale params", () => {
    const url = buildGoogleNewsRssUrl("cosmetic preservative & supplier", DEFAULT_LOCALE);
    const parsed = new URL(url);

    expect(parsed.origin + parsed.pathname).toBe("https://news.google.com/rss/search");
    expect(parsed.searchParams.get("q")).toBe("cosmetic preservative & supplier");
    expect(parsed.searchParams.get("hl")).toBe("en-US");
    expect(parsed.searchParams.get("gl")).toBe("IN");
    expect(parsed.searchParams.get("ceid")).toBe("IN:en");
  });

  it("respects a custom locale", () => {
    const url = buildGoogleNewsRssUrl("query", { hl: "en-GB", gl: "GB", ceid: "GB:en" });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("gl")).toBe("GB");
  });
});

describe("parseGoogleNewsRssXml", () => {
  it("extracts title, source, url, publishedAt, and description for each item", () => {
    const fetchedAt = "2025-09-03T00:00:00.000Z";
    const candidates = parseGoogleNewsRssXml(VALID_FEED, "cosmetic preservative", fetchedAt);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      title: "Cosmetic makers reassess preservative blends & supplier disclosures",
      source: "Industry Wire",
      googleNewsUrl: "https://news.google.com/rss/articles/CBMiXYZ",
      description: "Manufacturers are re-evaluating preservative systems after new supplier disclosure practices.",
      searchQuery: "cosmetic preservative",
      fetchedAt,
    });
    expect(candidates[0]?.publishedAt).toBe(new Date("Mon, 01 Sep 2025 10:00:00 GMT").toISOString());
  });

  it("decodes HTML entities in title and description", () => {
    const candidates = parseGoogleNewsRssXml(VALID_FEED, "q", "2025-09-03T00:00:00.000Z");
    expect(candidates[0]?.title).toContain("&");
    expect(candidates[0]?.title).not.toContain("&amp;");
  });

  it("preserves the exact search query passed in, per candidate", () => {
    const candidates = parseGoogleNewsRssXml(VALID_FEED, "exact query used", "2025-09-03T00:00:00.000Z");
    expect(candidates.every((c) => c.searchQuery === "exact query used")).toBe(true);
  });

  it("records fetchedAt distinctly from publishedAt", () => {
    const fetchedAt = "2099-01-01T00:00:00.000Z";
    const candidates = parseGoogleNewsRssXml(VALID_FEED, "q", fetchedAt);
    expect(candidates[0]?.fetchedAt).toBe(fetchedAt);
    expect(candidates[0]?.fetchedAt).not.toBe(candidates[0]?.publishedAt);
  });

  it("handles a single <item> the same as multiple (fast-xml-parser doesn't array-wrap singletons)", () => {
    const singleItemFeed = `<rss><channel><item><title>Only one</title><link>https://news.google.com/rss/articles/only</link></item></channel></rss>`;
    const candidates = parseGoogleNewsRssXml(singleItemFeed, "q", "2025-09-03T00:00:00.000Z");
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.title).toBe("Only one");
  });

  it("returns an empty array for a channel with no items", () => {
    const emptyFeed = `<rss><channel><title>No results</title></channel></rss>`;
    expect(parseGoogleNewsRssXml(emptyFeed, "q", "2025-09-03T00:00:00.000Z")).toEqual([]);
  });

  it("skips an item missing a title, without fabricating one", () => {
    const feed = `<rss><channel><item><link>https://news.google.com/rss/articles/x</link></item></channel></rss>`;
    expect(parseGoogleNewsRssXml(feed, "q", "2025-09-03T00:00:00.000Z")).toEqual([]);
  });

  it("skips an item missing a link, without fabricating one", () => {
    const feed = `<rss><channel><item><title>No link here</title></item></channel></rss>`;
    expect(parseGoogleNewsRssXml(feed, "q", "2025-09-03T00:00:00.000Z")).toEqual([]);
  });

  it("leaves publishedAt null when pubDate is missing, rather than inventing a date", () => {
    const feed = `<rss><channel><item><title>No date</title><link>https://news.google.com/rss/articles/x</link></item></channel></rss>`;
    const candidates = parseGoogleNewsRssXml(feed, "q", "2025-09-03T00:00:00.000Z");
    expect(candidates[0]?.publishedAt).toBeNull();
  });

  it("leaves publishedAt null when pubDate is unparseable, rather than trusting garbage", () => {
    const feed = `<rss><channel><item><title>Bad date</title><link>https://news.google.com/rss/articles/x</link><pubDate>not-a-date</pubDate></item></channel></rss>`;
    const candidates = parseGoogleNewsRssXml(feed, "q", "2025-09-03T00:00:00.000Z");
    expect(candidates[0]?.publishedAt).toBeNull();
  });

  it("leaves source null when the feed doesn't supply one", () => {
    const feed = `<rss><channel><item><title>No source</title><link>https://news.google.com/rss/articles/x</link></item></channel></rss>`;
    const candidates = parseGoogleNewsRssXml(feed, "q", "2025-09-03T00:00:00.000Z");
    expect(candidates[0]?.source).toBeNull();
  });

  it("throws NewsRetrievalError on genuinely malformed XML", () => {
    expect(() => parseGoogleNewsRssXml("not valid xml at all {}<<<", "q", "2025-09-03T00:00:00.000Z")).toThrow(
      NewsRetrievalError,
    );
  });

  it("throws NewsRetrievalError when the parsed document isn't an RSS feed", () => {
    expect(() => parseGoogleNewsRssXml("<html><body>hi</body></html>", "q", "2025-09-03T00:00:00.000Z")).toThrow(
      NewsRetrievalError,
    );
  });
});

describe("fetchGoogleNewsRss", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the built URL and parses the response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(VALID_FEED),
    });
    vi.stubGlobal("fetch", fetchMock);

    const candidates = await fetchGoogleNewsRss("cosmetic preservative");

    expect(candidates).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    const parsed = new URL(calledUrl);
    expect(parsed.origin + parsed.pathname).toBe("https://news.google.com/rss/search");
    expect(parsed.searchParams.get("q")).toBe("cosmetic preservative");
  });

  it("throws NewsRetrievalError when the network request itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );
    await expect(fetchGoogleNewsRss("q")).rejects.toThrow(NewsRetrievalError);
  });

  it("throws NewsRetrievalError on a non-OK HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503, text: () => Promise.resolve("") }),
    );
    await expect(fetchGoogleNewsRss("q")).rejects.toThrow(NewsRetrievalError);
  });

  it("throws NewsRetrievalError on an empty response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve("   ") }),
    );
    await expect(fetchGoogleNewsRss("q")).rejects.toThrow(NewsRetrievalError);
  });
});
