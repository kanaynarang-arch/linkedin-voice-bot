import { describe, expect, it, beforeEach } from "vitest";
import type { Database } from "../../src/db/client.js";
import { createTestDb } from "../testUtils/testContainer.js";
import { UsersRepository } from "../../src/db/repositories/users.js";
import { PostsRepository } from "../../src/db/repositories/posts.js";
import { IdeasRepository } from "../../src/db/repositories/ideas.js";
import { AnalysesRepository } from "../../src/db/repositories/analyses.js";
import { DraftsRepository } from "../../src/db/repositories/drafts.js";
import { ConversationStateRepository } from "../../src/db/repositories/conversationState.js";

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
    const analyses = new AnalysesRepository(db);
    const drafts = new DraftsRepository(db);
    const user = await users.getOrCreate("chat-1");
    const idea = await ideas.create(user.id, "an idea");
    const analysis = await analyses.create({
      ideaId: idea.id,
      ideaSummary: "summary",
      worthDeveloping: true,
      reasoning: "reasoning",
      angle: "angle",
      research: null,
      model: "test-model",
    });

    const v1 = await drafts.create(idea.id, analysis.id, "draft v1", "test-model");
    const v2 = await drafts.create(idea.id, analysis.id, "draft v2", "test-model", "make it shorter");

    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect((await drafts.getLatestForIdea(idea.id))?.id).toBe(v2.id);
    expect(v2.feedback).toBe("make it shorter");
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
});
