import { describe, expect, it, beforeEach } from "vitest";
import { openDatabase, type DB } from "../../src/db/client.js";
import { UsersRepository } from "../../src/db/repositories/users.js";
import { PostsRepository } from "../../src/db/repositories/posts.js";
import { IdeasRepository } from "../../src/db/repositories/ideas.js";
import { AnalysesRepository } from "../../src/db/repositories/analyses.js";
import { DraftsRepository } from "../../src/db/repositories/drafts.js";
import { ConversationStateRepository } from "../../src/db/repositories/conversationState.js";

describe("repositories", () => {
  let db: DB;

  beforeEach(() => {
    db = openDatabase(":memory:");
  });

  it("UsersRepository returns the same user for the same chat id", () => {
    const users = new UsersRepository(db);
    const first = users.getOrCreate("chat-1");
    const second = users.getOrCreate("chat-1");
    expect(second.id).toBe(first.id);

    const other = users.getOrCreate("chat-2");
    expect(other.id).not.toBe(first.id);
  });

  it("PostsRepository stores, lists, counts, and clears posts per user", () => {
    const users = new UsersRepository(db);
    const posts = new PostsRepository(db);
    const user = users.getOrCreate("chat-1");

    posts.addMany(user.id, ["post one", "post two"]);
    expect(posts.countByUser(user.id)).toBe(2);
    expect(posts.listByUser(user.id).map((p) => p.content)).toEqual(["post one", "post two"]);

    const removed = posts.clearByUser(user.id);
    expect(removed).toBe(2);
    expect(posts.countByUser(user.id)).toBe(0);
  });

  it("IdeasRepository detects exact-text duplicates scoped to a user", () => {
    const users = new UsersRepository(db);
    const ideas = new IdeasRepository(db);
    const userA = users.getOrCreate("chat-a");
    const userB = users.getOrCreate("chat-b");

    const idea = ideas.create(userA.id, "same text");
    expect(ideas.findDuplicate(userA.id, "same text")?.id).toBe(idea.id);
    expect(ideas.findDuplicate(userA.id, "different text")).toBeNull();
    expect(ideas.findDuplicate(userB.id, "same text")).toBeNull();
  });

  it("IdeasRepository tracks status transitions", () => {
    const users = new UsersRepository(db);
    const ideas = new IdeasRepository(db);
    const user = users.getOrCreate("chat-1");
    const idea = ideas.create(user.id, "an idea");
    expect(idea.status).toBe("captured");

    ideas.setStatus(idea.id, "drafted");
    expect(ideas.getById(idea.id)?.status).toBe("drafted");
  });

  it("DraftsRepository increments version per idea", () => {
    const users = new UsersRepository(db);
    const ideas = new IdeasRepository(db);
    const analyses = new AnalysesRepository(db);
    const drafts = new DraftsRepository(db);
    const user = users.getOrCreate("chat-1");
    const idea = ideas.create(user.id, "an idea");
    const analysis = analyses.create({
      ideaId: idea.id,
      ideaSummary: "summary",
      worthDeveloping: true,
      reasoning: "reasoning",
      angle: "angle",
      research: null,
      model: "test-model",
    });

    const v1 = drafts.create(idea.id, analysis.id, "draft v1", "test-model");
    const v2 = drafts.create(idea.id, analysis.id, "draft v2", "test-model", "make it shorter");

    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect(drafts.getLatestForIdea(idea.id)?.id).toBe(v2.id);
    expect(v2.feedback).toBe("make it shorter");
  });

  it("ConversationStateRepository persists and resets per-user state", () => {
    const users = new UsersRepository(db);
    const states = new ConversationStateRepository(db);
    const user = users.getOrCreate("chat-1");

    expect(states.get(user.id)).toEqual({ state: "idle", data: {} });

    states.set(user.id, "collecting_posts", { addedCount: 2 });
    expect(states.get(user.id)).toEqual({ state: "collecting_posts", data: { addedCount: 2 } });

    states.reset(user.id);
    expect(states.get(user.id)).toEqual({ state: "idle", data: {} });
  });
});
