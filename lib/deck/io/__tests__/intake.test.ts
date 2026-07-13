import { beforeEach, describe, expect, it, vi } from "vitest";
import { Zone } from "@/lib/generated/prisma/client";
import { InvariantViolation } from "@/lib/deck/mutation/errors";

vi.mock("@/lib/db", () => ({
  prisma: {
    card: { findMany: vi.fn() },
    printing: { findMany: vi.fn() },
    deckCard: { findMany: vi.fn() },
    deckCategory: { findMany: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/deck/mutation", async () => {
  const actual = await vi.importActual<typeof import("@/lib/deck/mutation")>(
    "@/lib/deck/mutation",
  );
  return {
    ...actual,
    applyChanges: vi.fn(),
  };
});

import { prisma } from "@/lib/db";
import { applyChanges } from "@/lib/deck/mutation";
import { intakeDecklist } from "../intake";
import { MAX_CARD_LINES } from "../consts";

const mockCardFindMany = vi.mocked(prisma.card.findMany);
const mockPrintingFindMany = vi.mocked(prisma.printing.findMany);
const mockDeckCardFindMany = vi.mocked(prisma.deckCard.findMany);
const mockCategoryFindMany = vi.mocked(prisma.deckCategory.findMany);
const mockCategoryCreateMany = vi.mocked(prisma.deckCategory.createMany);
const mockTransaction = vi.mocked(prisma.$transaction);
const mockApplyChanges = vi.mocked(applyChanges);

beforeEach(() => {
  vi.clearAllMocks();
  mockPrintingFindMany.mockResolvedValue([] as never);
  mockDeckCardFindMany.mockResolvedValue([] as never);
  mockCategoryFindMany.mockResolvedValue([] as never);
  mockCategoryCreateMany.mockResolvedValue({ count: 0 } as never);
  mockApplyChanges.mockResolvedValue(undefined);
  // ensureCategories + applyChanges run inside one interactive transaction,
  // backed by the same mocks here.
  mockTransaction.mockImplementation(async (fn: unknown) =>
    typeof fn === "function"
      ? fn({
          deckCategory: {
            findMany: mockCategoryFindMany,
            createMany: mockCategoryCreateMany,
          },
        })
      : undefined,
  );
});

describe("intakeDecklist — append mode", () => {
  it("parses plain text, resolves cards, and applies adds", async () => {
    mockCardFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
    ] as never);

    const result = await intakeDecklist({
      deckId: "deck-1",
      userId: "user-1",
      text: "3 Lightning Bolt",
      mode: "append",
    });

    expect(mockApplyChanges).toHaveBeenCalledWith(
      "deck-1",
      "user-1",
      [
        expect.objectContaining({
          op: "add",
          cardId: 1,
          quantity: 3,
          zone: Zone.MAINBOARD,
        }),
      ],
      expect.objectContaining({ tx: expect.anything() }),
    );
    expect(result.added).toBe(1);
    expect(result.applied).toBe(1);
    expect(result.unmatchedNames).toEqual([]);
  });

  it("handles arena format with mainboard and sideboard zones", async () => {
    mockCardFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
      { id: 2, name: "Duress" },
    ] as never);

    const text = ["Deck", "4 Lightning Bolt", "", "Sideboard", "2 Duress"].join(
      "\n",
    );
    await intakeDecklist({
      deckId: "deck-1",
      userId: "user-1",
      text,
      mode: "append",
    });

    const changes = mockApplyChanges.mock.calls[0]![2]!;
    const main = changes.find(
      (c) => c.op === "add" && c.cardId === 1,
    ) as Extract<(typeof changes)[number], { op: "add" }>;
    const side = changes.find(
      (c) => c.op === "add" && c.cardId === 2,
    ) as Extract<(typeof changes)[number], { op: "add" }>;
    expect(main.zone).toBe(Zone.MAINBOARD);
    expect(main.quantity).toBe(4);
    expect(side.zone).toBe(Zone.SIDEBOARD);
    expect(side.quantity).toBe(2);
  });

  it("handles dek (XML) format", async () => {
    mockCardFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
      { id: 2, name: "Duress" },
    ] as never);

    const dek = `<?xml version="1.0" encoding="utf-8"?>
<Deck>
  <Cards Quantity="4" Sideboard="false" Name="Lightning Bolt" />
  <Cards Quantity="2" Sideboard="true" Name="Duress" />
</Deck>`;
    const result = await intakeDecklist({
      deckId: "deck-1",
      userId: "user-1",
      text: dek,
      mode: "append",
    });

    expect(result.added).toBe(2);
    const changes = mockApplyChanges.mock.calls[0]![2]!;
    expect(changes).toHaveLength(2);
  });

  it("returns unresolved names without aborting partial application", async () => {
    mockCardFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
    ] as never);

    const result = await intakeDecklist({
      deckId: "deck-1",
      userId: "user-1",
      text: "1 Lightning Bolt\n1 Made Up Card Name Xyz",
      mode: "append",
    });

    expect(result.added).toBe(1);
    expect(result.unmatchedNames).toEqual(["Made Up Card Name Xyz"]);
  });

  it("forwards applyOptions (e.g. skipRevision) to applyChanges", async () => {
    mockCardFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
    ] as never);

    await intakeDecklist({
      deckId: "deck-1",
      userId: "user-1",
      text: "1 Lightning Bolt",
      mode: "append",
      applyOptions: { skipRevision: true },
    });

    expect(mockApplyChanges).toHaveBeenCalledWith(
      "deck-1",
      "user-1",
      expect.any(Array),
      expect.objectContaining({ skipRevision: true, tx: expect.anything() }),
    );
  });

  it("does not call applyChanges when nothing resolved", async () => {
    mockCardFindMany.mockResolvedValueOnce([] as never);

    const result = await intakeDecklist({
      deckId: "deck-1",
      userId: "user-1",
      text: "1 Made Up Card Name Xyz",
      mode: "append",
    });

    expect(mockApplyChanges).not.toHaveBeenCalled();
    expect(result.applied).toBe(0);
  });

  it("folds InvariantViolation issues into warnings and reports zero applied", async () => {
    mockCardFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
    ] as never);
    mockApplyChanges.mockRejectedValueOnce(
      new InvariantViolation([
        { kind: "deck_size", expected: 60, actual: 1 },
      ]),
    );

    const result = await intakeDecklist({
      deckId: "deck-1",
      userId: "user-1",
      text: "1 Lightning Bolt",
      mode: "append",
    });

    expect(result.added).toBe(0);
    expect(result.applied).toBe(0);
    expect(result.warnings).toContain("Deck must have exactly 60 cards (currently 1)");
  });
});

describe("intakeDecklist — category registry", () => {
  const jsonWithCategories = JSON.stringify({
    name: "Deck",
    format: "COMMANDER",
    visibility: "PRIVATE",
    description: null,
    cards: [
      {
        name: "Sol Ring",
        quantity: 1,
        zone: "MAINBOARD",
        isFoil: false,
        categories: ["ramp"],
      },
    ],
    categories: [
      { name: "ramp", sortOrder: 0 },
      { name: "empty-bucket", sortOrder: 1 },
    ],
  });

  it("creates registry rows inside the apply transaction, including empty categories in export order", async () => {
    mockCardFindMany.mockResolvedValueOnce([
      { id: 1, name: "Sol Ring" },
    ] as never);

    await intakeDecklist({
      deckId: "deck-1",
      userId: "user-1",
      text: jsonWithCategories,
      mode: "append",
    });

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockCategoryCreateMany).toHaveBeenCalledWith({
      data: [
        { deckId: "deck-1", name: "ramp", sortOrder: 0 },
        { deckId: "deck-1", name: "empty-bucket", sortOrder: 1 },
      ],
      skipDuplicates: true,
    });
    expect(mockApplyChanges).toHaveBeenCalledWith(
      "deck-1",
      "user-1",
      [expect.objectContaining({ op: "add", categories: ["ramp"] })],
      expect.objectContaining({ tx: expect.anything() }),
    );
  });

  it("shares the transaction with applyChanges so a failed batch leaves no phantom categories", async () => {
    mockCardFindMany.mockResolvedValueOnce([
      { id: 1, name: "Sol Ring" },
    ] as never);
    mockApplyChanges.mockRejectedValueOnce(
      new InvariantViolation([{ kind: "deck_size", expected: 100, actual: 1 }]),
    );

    const result = await intakeDecklist({
      deckId: "deck-1",
      userId: "user-1",
      text: jsonWithCategories,
      mode: "append",
    });

    // Registry creation ran inside the same transaction the failure aborts,
    // so a real client rolls the phantom rows back.
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockCategoryCreateMany).toHaveBeenCalledTimes(1);
    expect(result.applied).toBe(0);
    expect(result.warnings).toContain(
      "Deck must have exactly 100 cards (currently 1)",
    );
  });

  it("replace mode carries imported categories onto add ops", async () => {
    mockCardFindMany.mockResolvedValueOnce([
      { id: 1, name: "Sol Ring" },
    ] as never);

    await intakeDecklist({
      deckId: "deck-1",
      userId: "user-1",
      text: jsonWithCategories,
      mode: "replace",
    });

    expect(mockApplyChanges).toHaveBeenCalledWith(
      "deck-1",
      "user-1",
      [
        expect.objectContaining({
          op: "add",
          cardId: 1,
          zone: Zone.MAINBOARD,
          categories: ["ramp"],
        }),
      ],
      expect.objectContaining({ tx: expect.anything() }),
    );
  });
});

describe("intakeDecklist — line cap", () => {
  it("truncates to MAX_CARD_LINES and pushes a warning when input exceeds the limit", async () => {
    // Build a 5000-line input of unique card names so they all pass through parse.
    const lines = Array.from(
      { length: 5000 },
      (_, i) => `1 FakeCard${i}`,
    ).join("\n");

    // exact-match batch returns empty → fuzzy also returns empty → all unmatched
    mockCardFindMany.mockResolvedValue([] as never);

    const result = await intakeDecklist({
      deckId: "deck-1",
      userId: "user-1",
      text: lines,
      mode: "append",
    });

    // The resolver sees at most MAX_CARD_LINES distinct names
    // (exact-match call) plus up to MAX_CARD_LINES fuzzy calls.
    // All resolved to unmatched, so applied=0.
    expect(result.unmatchedNames.length).toBeLessThanOrEqual(MAX_CARD_LINES);
    expect(result.warnings).toContain(`import truncated to ${MAX_CARD_LINES} lines`);
  });
});

describe("intakeDecklist — replace mode", () => {
  it("diffs resolved cards against existing deck rows", async () => {
    mockCardFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
      { id: 2, name: "Counterspell" },
    ] as never);
    mockDeckCardFindMany.mockResolvedValueOnce([
      {
        id: "dc-1",
        cardId: 1,
        zone: Zone.MAINBOARD,
        categoryLinks: [],
        quantity: 4,
      },
    ] as never);

    const result = await intakeDecklist({
      deckId: "deck-1",
      userId: "user-1",
      text: "2 Lightning Bolt\n1 Counterspell",
      mode: "replace",
    });

    const changes = mockApplyChanges.mock.calls[0]![2]!;
    expect(changes).toContainEqual(
      expect.objectContaining({ op: "update", deckCardId: "dc-1", quantity: 2 }),
    );
    expect(changes).toContainEqual(
      expect.objectContaining({ op: "add", cardId: 2, quantity: 1 }),
    );
    expect(result.updated).toBe(1);
    expect(result.added).toBe(1);
  });

  it("removes existing rows that aren't in the new text", async () => {
    mockCardFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
    ] as never);
    mockDeckCardFindMany.mockResolvedValueOnce([
      {
        id: "dc-1",
        cardId: 1,
        zone: Zone.MAINBOARD,
        categoryLinks: [],
        quantity: 4,
      },
      {
        id: "dc-2",
        cardId: 99,
        zone: Zone.MAINBOARD,
        categoryLinks: [],
        quantity: 1,
      },
    ] as never);

    const result = await intakeDecklist({
      deckId: "deck-1",
      userId: "user-1",
      text: "4 Lightning Bolt",
      mode: "replace",
    });

    expect(result.removed).toBe(1);
  });

  it("returns zero applied without calling applyChanges when diff yields no changes", async () => {
    mockCardFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
    ] as never);
    mockDeckCardFindMany.mockResolvedValueOnce([
      {
        id: "dc-1",
        cardId: 1,
        zone: Zone.MAINBOARD,
        categoryLinks: [],
        quantity: 4,
      },
    ] as never);

    const result = await intakeDecklist({
      deckId: "deck-1",
      userId: "user-1",
      text: "4 Lightning Bolt",
      mode: "replace",
    });

    expect(mockApplyChanges).not.toHaveBeenCalled();
    expect(result.applied).toBe(0);
    expect(result.added).toBe(0);
    expect(result.removed).toBe(0);
    expect(result.updated).toBe(0);
  });

  it("re-throws non-InvariantViolation errors from applyChanges", async () => {
    mockCardFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
    ] as never);
    mockApplyChanges.mockRejectedValueOnce(new Error("db unavailable"));

    await expect(
      intakeDecklist({
        deckId: "deck-1",
        userId: "user-1",
        text: "1 Lightning Bolt",
        mode: "append",
      }),
    ).rejects.toThrow("db unavailable");
  });
});
