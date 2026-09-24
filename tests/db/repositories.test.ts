import { describe, expect, it, beforeEach } from "vitest";
import type { Database } from "../../src/db/client.js";
import { createTestDb } from "../testUtils/testContainer.js";
import { UsersRepository } from "../../src/db/repositories/users.js";
import { PostsRepository } from "../../src/db/repositories/posts.js";
import { IdeasRepository } from "../../src/db/repositories/ideas.js";
import { DraftsRepository } from "../../src/db/repositories/drafts.js";
import { ConversationStateRepository } from "../../src/db/repositories/conversationState.js";
import { ProcessedUpdatesRepository } from "../../src/db/repositories/processedUpdates.js";

describe("repositories", () => {
  let db: Database;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it("UsersRepository returns the same user for the same chat id", async () => {
    const users = new UsersRepository(db);
    const first = await users.getOrCreate("chat-1");
    const second = await users.getOrCreate("chat-1");
    expect(second.id).toBe(first.id);

    const other = await users.getOrCreate("chat-2");
    expect(other.id).not.toBe(first.id);
  });

  it("PostsRepository stores, lists, counts, and clears posts per user", async () => {
    const users = new UsersRepository(db);
    const posts = new PostsRepository(db);
    const user = await users.getOrCreate("chat-1");

    await posts.addMany(user.id, ["post one", "post two"]);
    expect(await posts.countByUser(user.id)).toBe(2);
    expect((await posts.listByUser(user.id)).map((p) => p.content)).toEqual(["post one", "post two"]);

    const removed = await posts.clearByUser(user.id);
    expect(removed).toBe(2);
    expect(await posts.countByUser(user.id)).toBe(0);
  });

  it("IdeasRepository detects exact-text duplicates scoped to a user", async () => {
    const users = new UsersRepository(db);
    const ideas = new IdeasRepository(db);
    const userA = await users.getOrCreate("chat-a");
    const userB = await users.getOrCreate("chat-b");

    const idea = await ideas.create(userA.id, "same text");
    expect((await ideas.findDuplicate(userA.id, "same text"))?.id).toBe(idea.id);
    expect(await ideas.findDuplicate(userA.id, "different text")).toBeNull();
    expect(await ideas.findDuplicate(userB.id, "same text")).toBeNull();
  });

  it("IdeasRepository tracks status transitions", async () => {
    const users = new UsersRepository(db);
    const ideas = new IdeasRepository(db);
    const user = await users.getOrCreate("chat-1");
    const idea = await ideas.create(user.id, "an idea");
    expect(idea.status).toBe("captured");

    await ideas.setStatus(idea.id, "drafted");
    expect((await ideas.getById(idea.id))?.status).toBe("drafted");
  });

  it("DraftsRepository increments version per idea", async () => {
    const users = new UsersRepository(db);
    const ideas = new IdeasRepository(db);
    const drafts = new DraftsRepository(db);
    const user = await users.getOrCreate("chat-1");
    const idea = await ideas.create(user.id, "an idea");

    const v1 = await drafts.create(idea.id, "draft v1", "test-model", null, false);
    const v2 = await drafts.create(idea.id, "draft v2", "test-model", null, false, "make it shorter");

    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect((await drafts.getLatestForIdea(idea.id))?.id).toBe(v2.id);
    expect(v2.feedback).toBe("make it shorter");
    expect(v1.status).toBe("pending");
  });

  it("DraftsRepository stores and rounds-trips a news hook", async () => {
    const users = new UsersRepository(db);
    const ideas = new IdeasRepository(db);
    const drafts = new DraftsRepository(db);
    const user = await users.getOrCreate("chat-1");
    const idea = await ideas.create(user.id, "an idea");

    const hook = {
      title: "Supplier changes preservative system",
      source: "Industry Wire",
      googleNewsUrl: "https://news.google.com/rss/articles/x",
      canonicalUrl: null,
      publishedAt: "2026-01-01T00:00:00.000Z",
      fetchedAt: "2026-01-01T00:00:00.000Z",
      recency: "CURRENT" as const,
      searchQuery: "cosmetic preservative supplier",
      hookStrength: 7.5,
      connectionType: "contextualizes" as const,
      relevanceReason: "Direct match.",
      hookConnection: "Recent example of the same issue.",
    };

    const draft = await drafts.create(idea.id, "draft content", "test-model", hook, true);

    expect(draft.usedNewsHook).toBe(true);
    expect(draft.newsHook?.title).toBe(hook.title);
    expect(draft.newsHook?.source).toBe(hook.source);
    expect(draft.newsHook?.googleNewsUrl).toBe(hook.googleNewsUrl);
    expect(draft.newsHook?.hookStrength).toBe(hook.hookStrength);
    expect(draft.newsHook?.connectionType).toBe(hook.connectionType);
  });

  it("DraftsRepository setStatus records the Review Gate decision", async () => {
    const users = new UsersRepository(db);
    const ideas = new IdeasRepository(db);
    const drafts = new DraftsRepository(db);
    const user = await users.getOrCreate("chat-1");
    const idea = await ideas.create(user.id, "an idea");
    const draft = await drafts.create(idea.id, "draft content", "test-model", null, false);
    expect(draft.status).toBe("pending");

    await drafts.setStatus(draft.id, "approved");
    expect((await drafts.getById(draft.id))?.status).toBe("approved");
  });

  it("ConversationStateRepository persists and resets per-user state", async () => {
    const users = new UsersRepository(db);
    const states = new ConversationStateRepository(db);
    const user = await users.getOrCreate("chat-1");

    expect(await states.get(user.id)).toEqual({ state: "idle", data: {} });

    await states.set(user.id, "collecting_posts", { addedCount: 2 });
    expect(await states.get(user.id)).toEqual({ state: "collecting_posts", data: { addedCount: 2 } });

    await states.reset(user.id);
    expect(await states.get(user.id)).toEqual({ state: "idle", data: {} });
  });

  it("ProcessedUpdatesRepository claims an update id exactly once", async () => {
    const processedUpdates = new ProcessedUpdatesRepository(db);

    expect(await processedUpdates.tryClaim(12345)).toBe(true);
    expect(await processedUpdates.tryClaim(12345)).toBe(false);
    expect(await processedUpdates.tryClaim(12345)).toBe(false);
    // A different update id is unaffected by an earlier claim.
    expect(await processedUpdates.tryClaim(67890)).toBe(true);
  });

  it("DraftsRepository rejects a second draft with the same idea_id and version", async () => {
    const users = new UsersRepository(db);
    const ideas = new IdeasRepository(db);
    const user = await users.getOrCreate("chat-1");
    const idea = await ideas.create(user.id, "an idea");

    // Bypasses the repository's own version computation to simulate two
    // concurrent writers both landing on version 1 - the unique index is
    // the backstop for that race, so the second raw insert must fail
    // rather than silently succeed with an ambiguous duplicate.
    await db.query("INSERT INTO drafts (idea_id, content, version, model) VALUES ($1, $2, 1, $3)", [
      idea.id,
      "first",
      "test-model",
    ]);
    await expect(
      db.query("INSERT INTO drafts (idea_id, content, version, model) VALUES ($1, $2, 1, $3)", [
        idea.id,
        "second",
        "test-model",
      ]),
    ).rejects.toThrow();
  });
});
