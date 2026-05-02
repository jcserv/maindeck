import { beforeEach, describe, expect, it, vi } from "vitest";
import { Zone } from "@/lib/generated/prisma/client";
import { InvariantViolation } from "@/lib/deck/mutation/errors";

vi.mock("@/lib/db", () => ({
  prisma: {
    card: { findMany: vi.fn() },
    printing: { findMany: vi.fn() },
    deckCard: { findMany: vi.fn() },
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

const mockCardFindMany = vi.mocked(prisma.card.findMany);
const mockPrintingFindMany = vi.mocked(prisma.printing.findMany);
const mockDeckCardFindMany = vi.mocked(prisma.deckCard.findMany);
const mockApplyChanges = vi.mocked(applyChanges);

beforeEach(() => {
  vi.clearAllMocks();
  mockPrintingFindMany.mockResolvedValue([] as never);
  mockDeckCardFindMany.mockResolvedValue([] as never);
  mockApplyChanges.mockResolvedValue(undefined);
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
      undefined,
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
      { skipRevision: true },
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
        { code: "test", message: "Mainboard exceeds size limit" },
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
    expect(result.warnings).toContain("Mainboard exceeds size limit");
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
        category: null,
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
        category: null,
        quantity: 4,
      },
      {
        id: "dc-2",
        cardId: 99,
        zone: Zone.MAINBOARD,
        category: null,
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
});
