import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));
vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    deck: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import { updateTag } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Format, Visibility } from "@/lib/generated/prisma/enums";
import {
  createDeck,
  deleteDeck,
  updateDeck,
  updateDeckDescription,
  updateDeckManualBracket,
  updateDeckName,
  updateDeckVisibility,
} from "../crud";

const mockSession = vi.mocked(requireSession);
const mockDeckCreate = vi.mocked(prisma.deck.create);
const mockDeckUpdate = vi.mocked(prisma.deck.update);
const mockDeckDelete = vi.mocked(prisma.deck.delete);
const mockDeckFindUnique = vi.mocked(prisma.deck.findUnique);
const mockUpdateTag = vi.mocked(updateTag);

const USER_ID = "user-1";
const DECK_ID = "deck-1";

function formDataFrom(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({
    userId: USER_ID,
    email: "test@test.com",
  } as never);
  mockDeckFindUnique.mockResolvedValue({ userId: USER_ID } as never);
});

describe("createDeck", () => {
  it("creates a deck with validated fields and invalidates deck-list", async () => {
    mockDeckCreate.mockResolvedValue({ id: DECK_ID } as never);

    const id = await createDeck(
      formDataFrom({
        name: "  My Deck  ",
        format: Format.COMMANDER,
        visibility: Visibility.PRIVATE,
        description: "scratch notes",
      }),
    );

    expect(id).toBe(DECK_ID);
    expect(mockDeckCreate).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        name: "My Deck",
        format: Format.COMMANDER,
        visibility: Visibility.PRIVATE,
        description: "scratch notes",
      },
    });
    expect(mockUpdateTag).toHaveBeenCalledWith("deck-list");
    expect(mockUpdateTag).toHaveBeenCalledWith("decks:public");
  });

  it("falls back to 'Untitled Deck' when name is empty after trim", async () => {
    mockDeckCreate.mockResolvedValue({ id: DECK_ID } as never);

    await createDeck(
      formDataFrom({
        name: "   ",
        format: Format.COMMANDER,
        visibility: Visibility.PRIVATE,
      }),
    );

    expect(mockDeckCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Untitled Deck" }),
      }),
    );
  });

  it("rejects when name exceeds max length", async () => {
    await expect(
      createDeck(
        formDataFrom({
          name: "x".repeat(101),
          format: Format.COMMANDER,
          visibility: Visibility.PRIVATE,
        }),
      ),
    ).rejects.toThrow();
    expect(mockDeckCreate).not.toHaveBeenCalled();
  });

  it("falls back to defaults for unknown enum values", async () => {
    mockDeckCreate.mockResolvedValue({ id: DECK_ID } as never);

    await createDeck(
      formDataFrom({
        name: "Deck",
        format: "GARBAGE",
        visibility: "WHATEVER",
      }),
    );

    expect(mockDeckCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          format: Format.COMMANDER,
          visibility: Visibility.PRIVATE,
        }),
      }),
    );
  });

  it("requires a session", async () => {
    mockSession.mockRejectedValue(new Error("UNAUTHENTICATED"));

    await expect(
      createDeck(
        formDataFrom({
          name: "Deck",
          format: Format.COMMANDER,
          visibility: Visibility.PRIVATE,
        }),
      ),
    ).rejects.toThrow("UNAUTHENTICATED");
    expect(mockDeckCreate).not.toHaveBeenCalled();
  });
});

describe("updateDeck", () => {
  it("updates a deck owned by the caller and busts both cache tags", async () => {
    mockDeckUpdate.mockResolvedValue({ id: DECK_ID } as never);

    await updateDeck(
      DECK_ID,
      formDataFrom({
        name: "Renamed",
        format: Format.STANDARD,
        visibility: Visibility.PUBLIC,
        description: "",
      }),
    );

    expect(mockDeckUpdate).toHaveBeenCalledWith({
      where: { id: DECK_ID },
      data: {
        name: "Renamed",
        format: Format.STANDARD,
        visibility: Visibility.PUBLIC,
        description: null,
      },
    });
    expect(mockUpdateTag).toHaveBeenCalledWith("deck-list");
    expect(mockUpdateTag).toHaveBeenCalledWith("decks:public");
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  it("throws NEXT_NOT_FOUND when the deck does not belong to the caller", async () => {
    mockDeckFindUnique.mockResolvedValue({ userId: "someone-else" } as never);

    await expect(
      updateDeck(
        DECK_ID,
        formDataFrom({
          name: "Renamed",
          format: Format.STANDARD,
          visibility: Visibility.PUBLIC,
        }),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockDeckUpdate).not.toHaveBeenCalled();
  });

  it("throws NEXT_NOT_FOUND when the deck does not exist", async () => {
    mockDeckFindUnique.mockResolvedValue(null);

    await expect(
      updateDeck(
        DECK_ID,
        formDataFrom({
          name: "Renamed",
          format: Format.STANDARD,
          visibility: Visibility.PUBLIC,
        }),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockDeckUpdate).not.toHaveBeenCalled();
  });

  it("omits the name field when no name is provided", async () => {
    mockDeckUpdate.mockResolvedValue({ id: DECK_ID } as never);

    await updateDeck(
      DECK_ID,
      formDataFrom({
        format: Format.STANDARD,
        visibility: Visibility.PRIVATE,
      }),
    );

    const [call] = mockDeckUpdate.mock.calls;
    const data = (call?.[0] as { data: Record<string, unknown> }).data;
    expect("name" in data).toBe(false);
  });
});

describe("updateDeckName", () => {
  it("updates the deck name with the trimmed value and busts all tags", async () => {
    mockDeckUpdate.mockResolvedValue({ id: DECK_ID } as never);

    await updateDeckName(DECK_ID, "  Renamed Deck  ");

    expect(mockDeckUpdate).toHaveBeenCalledWith({
      where: { id: DECK_ID },
      data: { name: "Renamed Deck" },
    });
    expect(mockUpdateTag).toHaveBeenCalledWith("deck-list");
    expect(mockUpdateTag).toHaveBeenCalledWith("decks:public");
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  it("rejects an empty name", async () => {
    await expect(updateDeckName(DECK_ID, "   ")).rejects.toThrow();
    expect(mockDeckUpdate).not.toHaveBeenCalled();
  });

  it("rejects a name over the max length", async () => {
    await expect(updateDeckName(DECK_ID, "x".repeat(101))).rejects.toThrow();
    expect(mockDeckUpdate).not.toHaveBeenCalled();
  });

  it("404s for non-owners", async () => {
    mockDeckFindUnique.mockResolvedValue({ userId: "someone-else" } as never);

    await expect(updateDeckName(DECK_ID, "Renamed")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockDeckUpdate).not.toHaveBeenCalled();
  });
});

describe("updateDeckDescription", () => {
  it("clears the description when given an empty string", async () => {
    mockDeckUpdate.mockResolvedValue({ id: DECK_ID } as never);

    await updateDeckDescription(DECK_ID, "   ");

    expect(mockDeckUpdate).toHaveBeenCalledWith({
      where: { id: DECK_ID },
      data: { description: null },
    });
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  it("rejects descriptions over the max length", async () => {
    await expect(
      updateDeckDescription(DECK_ID, "x".repeat(2001)),
    ).rejects.toThrow();
    expect(mockDeckUpdate).not.toHaveBeenCalled();
  });

  it("enforces ownership", async () => {
    mockDeckFindUnique.mockResolvedValue({ userId: "someone-else" } as never);

    await expect(updateDeckDescription(DECK_ID, "notes")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockDeckUpdate).not.toHaveBeenCalled();
  });
});

describe("updateDeckVisibility", () => {
  it("updates visibility and busts both cache tags", async () => {
    mockDeckUpdate.mockResolvedValue({ id: DECK_ID } as never);

    await updateDeckVisibility(DECK_ID, Visibility.PUBLIC);

    expect(mockDeckUpdate).toHaveBeenCalledWith({
      where: { id: DECK_ID },
      data: { visibility: Visibility.PUBLIC },
    });
    expect(mockUpdateTag).toHaveBeenCalledWith("deck-list");
    expect(mockUpdateTag).toHaveBeenCalledWith("decks:public");
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  it("rejects an unknown visibility value", async () => {
    await expect(
      updateDeckVisibility(DECK_ID, "BOGUS" as Visibility),
    ).rejects.toThrow();
    expect(mockDeckUpdate).not.toHaveBeenCalled();
  });

  it("404s for non-owners", async () => {
    mockDeckFindUnique.mockResolvedValue({ userId: "someone-else" } as never);

    await expect(
      updateDeckVisibility(DECK_ID, Visibility.PUBLIC),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockDeckUpdate).not.toHaveBeenCalled();
  });
});

describe("updateDeckManualBracket", () => {
  it("updates the manual bracket and busts both cache tags", async () => {
    mockDeckUpdate.mockResolvedValue({ id: DECK_ID } as never);

    await updateDeckManualBracket(DECK_ID, 3);

    expect(mockDeckUpdate).toHaveBeenCalledWith({
      where: { id: DECK_ID },
      data: { manualBracket: 3 },
    });
    expect(mockUpdateTag).toHaveBeenCalledWith("deck-list");
    expect(mockUpdateTag).toHaveBeenCalledWith("decks:public");
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  it("allows null to clear the manual bracket", async () => {
    mockDeckUpdate.mockResolvedValue({ id: DECK_ID } as never);

    await updateDeckManualBracket(DECK_ID, null);

    expect(mockDeckUpdate).toHaveBeenCalledWith({
      where: { id: DECK_ID },
      data: { manualBracket: null },
    });
  });

  it("rejects out-of-range bracket values", async () => {
    await expect(updateDeckManualBracket(DECK_ID, 7)).rejects.toThrow();
    expect(mockDeckUpdate).not.toHaveBeenCalled();
  });

  it("404s for non-owners", async () => {
    mockDeckFindUnique.mockResolvedValue({ userId: "someone-else" } as never);

    await expect(updateDeckManualBracket(DECK_ID, 2)).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockDeckUpdate).not.toHaveBeenCalled();
  });
});

describe("deleteDeck", () => {
  it("deletes the deck, busts tags, and redirects", async () => {
    mockDeckDelete.mockResolvedValue({ id: DECK_ID } as never);

    await expect(deleteDeck(DECK_ID)).rejects.toThrow("NEXT_REDIRECT:/decks");

    expect(mockDeckDelete).toHaveBeenCalledWith({ where: { id: DECK_ID } });
    expect(mockUpdateTag).toHaveBeenCalledWith("deck-list");
    expect(mockUpdateTag).toHaveBeenCalledWith("decks:public");
    expect(mockUpdateTag).toHaveBeenCalledWith(`deck:${DECK_ID}`);
  });

  it("refuses to delete a deck owned by someone else", async () => {
    mockDeckFindUnique.mockResolvedValue({ userId: "someone-else" } as never);

    await expect(deleteDeck(DECK_ID)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockDeckDelete).not.toHaveBeenCalled();
  });
});
