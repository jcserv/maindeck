import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ updateTag: vi.fn() }));

import { updateTag } from "next/cache";
import { Visibility } from "@/lib/generated/prisma/enums";
import {
  cardDecksTag,
  deckCardMutationTags,
  deckCreateTags,
  deckDeleteTags,
  deckLikesTag,
  deckListTag,
  deckMutationTags,
  deckPrefetchTag,
  deckRevisionsTag,
  deckTag,
  deckTokensTag,
  forkLineageTag,
  invalidateTags,
  publicDecksTag,
  savedDecksTag,
  userDecksTag,
  userPublicDecksTag,
  userTag,
  viewerHoldingsTag,
} from "../cache-tags";

const mockUpdateTag = vi.mocked(updateTag);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("singleton tag helpers", () => {
  it("returns the canonical literal tag strings", () => {
    expect(deckListTag()).toBe("deck-list");
    expect(publicDecksTag()).toBe("decks:public");
    expect(userDecksTag("u1")).toBe("decks:user:u1");
    expect(deckTag("d1")).toBe("deck:d1");
    expect(deckRevisionsTag("d1")).toBe("deck:d1:revisions");
    expect(deckTokensTag("d1")).toBe("deck-tokens:d1");
    expect(cardDecksTag(42)).toBe("card-decks:42");
    expect(deckPrefetchTag("d1")).toBe("prefetch:deck/d1");
    expect(userTag("alice")).toBe("user:alice");
    expect(userPublicDecksTag("u1")).toBe("decks:user:u1:public");
    expect(savedDecksTag("u1")).toBe("saved-decks:u1");
    expect(viewerHoldingsTag("u1")).toBe("holdings:user:u1");
    expect(deckLikesTag("d1")).toBe("deck:d1:likes");
    expect(forkLineageTag("d1")).toBe("deck:d1:forks");
  });
});

describe("deckMutationTags", () => {
  it("includes deck-list and deck:${id} for any mutation", () => {
    const tags = deckMutationTags({
      deckId: "d1",
      visibility: Visibility.PRIVATE,
    });
    expect(tags).toContain("deck-list");
    expect(tags).toContain("deck:d1");
  });

  it("omits decks:public when the deck stays private", () => {
    const tags = deckMutationTags({
      deckId: "d1",
      visibility: Visibility.PRIVATE,
    });
    expect(tags).not.toContain("decks:public");
  });

  it("includes decks:public when the deck is currently public", () => {
    const tags = deckMutationTags({
      deckId: "d1",
      visibility: Visibility.PUBLIC,
    });
    expect(tags).toContain("decks:public");
  });

  it("includes decks:public when the deck was previously public", () => {
    const tags = deckMutationTags({
      deckId: "d1",
      visibility: Visibility.PRIVATE,
      prevVisibility: Visibility.PUBLIC,
    });
    expect(tags).toContain("decks:public");
  });

  it("omits decks:public for unlisted decks", () => {
    const tags = deckMutationTags({
      deckId: "d1",
      visibility: Visibility.UNLISTED,
    });
    expect(tags).not.toContain("decks:public");
  });

  it("bumps decks:user:${userId}:public when visibility is or was PUBLIC and userId is supplied", () => {
    expect(
      deckMutationTags({
        deckId: "d1",
        visibility: Visibility.PUBLIC,
        userId: "u1",
      }),
    ).toContain("decks:user:u1:public");
    expect(
      deckMutationTags({
        deckId: "d1",
        visibility: Visibility.PRIVATE,
        prevVisibility: Visibility.PUBLIC,
        userId: "u1",
      }),
    ).toContain("decks:user:u1:public");
  });

  it("omits the per-user public-deck tag when the deck never touches PUBLIC", () => {
    expect(
      deckMutationTags({
        deckId: "d1",
        visibility: Visibility.PRIVATE,
        userId: "u1",
      }),
    ).not.toContain("decks:user:u1:public");
  });

  it("omits the per-user public-deck tag when userId is not supplied", () => {
    const tags = deckMutationTags({
      deckId: "d1",
      visibility: Visibility.PUBLIC,
    });
    expect(tags.some((t) => t.endsWith(":public") && t.startsWith("decks:user:"))).toBe(
      false,
    );
  });
});

describe("deckCreateTags", () => {
  it("never includes deck:${id} (no readers for a brand-new deck)", () => {
    const tags = deckCreateTags({ visibility: Visibility.PUBLIC });
    expect(tags.some((t) => t.startsWith("deck:"))).toBe(false);
  });

  it("includes decks:public only for public new decks", () => {
    expect(deckCreateTags({ visibility: Visibility.PRIVATE })).toEqual([
      "deck-list",
    ]);
    expect(deckCreateTags({ visibility: Visibility.UNLISTED })).toEqual([
      "deck-list",
    ]);
    expect(deckCreateTags({ visibility: Visibility.PUBLIC })).toEqual([
      "deck-list",
      "decks:public",
    ]);
  });
});

describe("deckDeleteTags", () => {
  it("always invalidates the per-deck cache to clear stale getDeckById results", () => {
    const tags = deckDeleteTags({
      deckId: "d1",
      visibility: Visibility.PRIVATE,
    });
    expect(tags).toContain("deck:d1");
  });

  it("includes decks:public only when the deleted deck was public", () => {
    expect(
      deckDeleteTags({ deckId: "d1", visibility: Visibility.PRIVATE }),
    ).not.toContain("decks:public");
    expect(
      deckDeleteTags({ deckId: "d1", visibility: Visibility.PUBLIC }),
    ).toContain("decks:public");
  });
});

describe("deckCardMutationTags", () => {
  it("returns the per-deck tag, prefetch tag, and skips list-level tags", () => {
    const tags = deckCardMutationTags({ deckId: "d1" });
    expect(tags).toEqual(["deck:d1", "prefetch:deck/d1"]);
  });

  it("adds the revisions tag when withRevision is true", () => {
    const tags = deckCardMutationTags({ deckId: "d1", withRevision: true });
    expect(tags).toEqual(["deck:d1", "prefetch:deck/d1", "deck:d1:revisions"]);
  });

  it("includes the prefetch tag so hover-prefetch manifests are invalidated on card changes", () => {
    const tags = deckCardMutationTags({ deckId: "abc123" });
    expect(tags).toContain("prefetch:deck/abc123");
  });
});

describe("invalidateTags", () => {
  it("calls updateTag once per tag in order", () => {
    invalidateTags(["a", "b", "c"]);
    expect(mockUpdateTag).toHaveBeenCalledTimes(3);
    expect(mockUpdateTag).toHaveBeenNthCalledWith(1, "a");
    expect(mockUpdateTag).toHaveBeenNthCalledWith(2, "b");
    expect(mockUpdateTag).toHaveBeenNthCalledWith(3, "c");
  });

  it("is a no-op for empty input", () => {
    invalidateTags([]);
    expect(mockUpdateTag).not.toHaveBeenCalled();
  });
});
