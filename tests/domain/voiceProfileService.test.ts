import { describe, expect, it } from "vitest";
import { createTestSetup, sampleVoiceProfilePayload } from "../testUtils/testContainer.js";
import { InsufficientDataError, MissingVoiceProfileError } from "../../src/utils/errors.js";

describe("VoiceProfileService", () => {
  it("refuses to analyze with fewer posts than the configured minimum", async () => {
    const { container } = await createTestSetup(3);
    const user = await container.users.getOrCreate("chat-1");
    await container.posts.add(user.id, "just one post");

    await expect(container.voiceProfileService.analyze(user.id)).rejects.toThrow(InsufficientDataError);
  });

  it("builds and stores a voice profile once enough posts are present", async () => {
    const { container, ai } = await createTestSetup(2);
    const user = await container.users.getOrCreate("chat-1");
    await container.posts.add(user.id, "First post about formulation.");
    await container.posts.add(user.id, "Second post about clean beauty claims.");

    ai.queueJSON(sampleVoiceProfilePayload());

    const record = await container.voiceProfileService.analyze(user.id);

    expect(record.postCount).toBe(2);
    expect(record.isActive).toBe(true);
    expect(record.profile.coreFingerprint.length).toBeGreaterThan(0);

    const active = await container.voiceProfiles.getActive(user.id);
    expect(active?.id).toBe(record.id);
  });

  it("deactivates the previous profile when a new one is saved", async () => {
    const { container, ai } = await createTestSetup(1);
    const user = await container.users.getOrCreate("chat-1");
    await container.posts.add(user.id, "A post.");

    ai.queueJSON(sampleVoiceProfilePayload());
    const first = await container.voiceProfileService.analyze(user.id);

    ai.queueJSON(sampleVoiceProfilePayload());
    const second = await container.voiceProfileService.analyze(user.id);

    const all = await container.voiceProfiles.listByUser(user.id);
    expect(all).toHaveLength(2);
    expect((await container.voiceProfiles.getActive(user.id))?.id).toBe(second.id);
    expect(first.id).not.toBe(second.id);
  });

  it("throws MissingVoiceProfileError when no active profile exists", async () => {
    const { container } = await createTestSetup(1);
    const user = await container.users.getOrCreate("chat-1");
    await expect(container.voiceProfileService.getActiveOrThrow(user.id)).rejects.toThrow(
      MissingVoiceProfileError,
    );
  });
});
