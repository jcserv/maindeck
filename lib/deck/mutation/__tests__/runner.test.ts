import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    deck: { findUnique: vi.fn() },
  },
}));

import { updateTag } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { runOwnerDeckMutation } from "../runner";

const mockSession = vi.mocked(requireSession);
const mockDeckFindUnique = vi.mocked(prisma.deck.findUnique);
const mockUpdateTag = vi.mocked(updateTag);

const USER_ID = "user-1";
const DECK_ID = "deck-1";

function asOwner() {
  mockSession.mockResolvedValue({ userId: USER_ID, email: "t@t.com" } as never);
  mockDeckFindUnique.mockResolvedValue({ userId: USER_ID } as never);
}

function asOutsider() {
  mockSession.mockResolvedValue({ userId: USER_ID, email: "t@t.com" } as never);
  mockDeckFindUnique.mockResolvedValue({ userId: "someone-else" } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runOwnerDeckMutation", () => {
  it("runs requireDeckOwner before invoking the body", async () => {
    asOwner();
    const body = vi.fn(async () => "ok");
    const action = runOwnerDeckMutation("deck.test", "none", body);

    const result = await action(DECK_ID);

    expect(result).toBe("ok");
    expect(mockDeckFindUnique).toHaveBeenCalledTimes(1);
    expect(body).toHaveBeenCalledWith({ deckId: DECK_ID, userId: USER_ID });
  });

  it("404s for non-owners and never invokes the body", async () => {
    asOutsider();
    const body = vi.fn(async () => "ok");
    const action = runOwnerDeckMutation("deck.test", "card", body);

    await expect(action(DECK_ID)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(body).not.toHaveBeenCalled();
    expect(mockUpdateTag).not.toHaveBeenCalled();
  });

  it("forwards extra args after deckId to the body", async () => {
    asOwner();
    const body = vi.fn(async (_ctx, a: number, b: string) => `${a}-${b}`);
    const action = runOwnerDeckMutation("deck.test", "none", body);

    const result = await action(DECK_ID, 42, "hello");

    expect(result).toBe("42-hello");
    expect(body).toHaveBeenCalledWith(
      { deckId: DECK_ID, userId: USER_ID },
      42,
      "hello",
    );
  });

  it('emits deck:* and deck:*:revisions for "card" tag', async () => {
    asOwner();
    const action = runOwnerDeckMutation("deck.test", "card", async () => {});

    await action(DECK_ID);

    const tagCalls = mockUpdateTag.mock.calls.map((c) => c[0]);
    expect(tagCalls).toEqual([`deck:${DECK_ID}`, `deck:${DECK_ID}:revisions`]);
  });

  it('emits only deck:* for "category" tag', async () => {
    asOwner();
    const action = runOwnerDeckMutation("deck.test", "category", async () => {});

    await action(DECK_ID);

    const tagCalls = mockUpdateTag.mock.calls.map((c) => c[0]);
    expect(tagCalls).toEqual([`deck:${DECK_ID}`]);
  });

  it('emits deck:*, deck-list, decks:public for "meta" tag', async () => {
    asOwner();
    const action = runOwnerDeckMutation("deck.test", "meta", async () => {});

    await action(DECK_ID);

    const tagCalls = mockUpdateTag.mock.calls.map((c) => c[0]);
    expect(tagCalls).toEqual(
      expect.arrayContaining([
        "deck-list",
        "decks:public",
        `deck:${DECK_ID}`,
      ]),
    );
    expect(tagCalls).toHaveLength(3);
  });

  it('emits no tags for "none" tag (body owns its tags)', async () => {
    asOwner();
    const action = runOwnerDeckMutation("deck.test", "none", async () => {});

    await action(DECK_ID);

    expect(mockUpdateTag).not.toHaveBeenCalled();
  });

  it("does not emit tags when the body throws", async () => {
    asOwner();
    const action = runOwnerDeckMutation("deck.test", "card", async () => {
      throw new Error("boom");
    });

    await expect(action(DECK_ID)).rejects.toThrow("boom");
    expect(mockUpdateTag).not.toHaveBeenCalled();
  });

  it("propagates body errors unchanged so callers can catch domain errors", async () => {
    asOwner();
    class DomainError extends Error {}
    const action = runOwnerDeckMutation("deck.test", "card", async () => {
      throw new DomainError("nope");
    });

    await expect(action(DECK_ID)).rejects.toBeInstanceOf(DomainError);
  });
});
