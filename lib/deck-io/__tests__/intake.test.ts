import { beforeEach, describe, expect, it, vi } from "vitest";
import { Zone } from "@/lib/generated/prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: {
    card: { findMany: vi.fn() },
    printing: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { detectFormat, parseDecklist } from "../parse";
import { resolveDecklist } from "../resolve";
import { decklistAsAdds, decklistAsReplace } from "../intake";
import type { ExistingDeckCard } from "@/lib/deck/mutation/diff";

const mockCardFindMany = vi.mocked(prisma.card.findMany);
const mockPrintingFindMany = vi.mocked(prisma.printing.findMany);

async function intake(text: string) {
  const parsed = parseDecklist(text, detectFormat(text));
  return resolveDecklist(parsed);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrintingFindMany.mockResolvedValue([] as never);
});

describe("parse + resolve pipeline", () => {
  it("parses text and resolves matched cards", async () => {
    mockCardFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
    ] as never);

    const out = await intake("1 Lightning Bolt");

    expect(out.parsed.format).toBe("text");
    expect(out.cards).toHaveLength(1);
    expect(out.cards.filter((c) => c.cardId !== null)).toHaveLength(1);
    expect(out.cards[0]?.cardId).toBe(1);
  });

  it("includes resolution warnings (e.g. foil downgrades) flat", async () => {
    mockCardFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
    ] as never);
    mockPrintingFindMany.mockResolvedValueOnce([
      {
        id: 99,
        cardId: 1,
        setCode: "lea",
        collectorNumber: "100",
        finishes: ["nonfoil"],
      },
    ] as never);

    const out = await intake("1 Lightning Bolt (LEA) 100 *F*");

    expect(out.warnings.some((w) => w.includes("not available in foil"))).toBe(
      true,
    );
  });
});

describe("decklistAsAdds", () => {
  it("converts matched resolved cards into add ops", async () => {
    mockCardFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
    ] as never);

    const resolved = await intake("3 Lightning Bolt");
    const changes = decklistAsAdds(resolved);

    expect(changes).toEqual([
      {
        op: "add",
        cardId: 1,
        quantity: 3,
        zone: Zone.MAINBOARD,
        category: null,
        printingId: null,
        isFoil: false,
      },
    ]);
  });

  it("skips cards that didn't resolve", async () => {
    mockCardFindMany
      .mockResolvedValueOnce([{ id: 1, name: "Lightning Bolt" }] as never)
      .mockResolvedValueOnce([] as never);

    const resolved = await intake("1 Lightning Bolt\n1 Made Up Card Name");
    const changes = decklistAsAdds(resolved);

    expect(changes).toHaveLength(1);
    expect(changes[0]?.op).toBe("add");
  });
});

describe("decklistAsReplace", () => {
  it("diffs resolved cards against existing deck rows", async () => {
    mockCardFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
      { id: 2, name: "Counterspell" },
    ] as never);

    const resolved = await intake("2 Lightning Bolt\n1 Counterspell");

    const existing: ExistingDeckCard[] = [
      {
        deckCardId: "dc-1",
        cardId: 1,
        zone: Zone.MAINBOARD,
        category: null,
        quantity: 4,
      },
    ];

    const changes = decklistAsReplace(resolved, existing);

    expect(changes).toContainEqual(
      expect.objectContaining({ op: "update", deckCardId: "dc-1", quantity: 2 }),
    );
    expect(changes).toContainEqual(
      expect.objectContaining({ op: "add", cardId: 2, quantity: 1 }),
    );
  });
});
