import { beforeEach, describe, expect, it, vi } from "vitest";
import { Zone } from "@/lib/generated/prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: {
    card: { findMany: vi.fn() },
    printing: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import {
  matchedResolved,
  parseAndResolve,
  toAddChanges,
  toReplaceChanges,
} from "../resolved-decklist";
import type { ExistingDeckCard } from "@/lib/deck/mutation/diff";

const mockCardFindMany = vi.mocked(prisma.card.findMany);
const mockPrintingFindMany = vi.mocked(prisma.printing.findMany);

beforeEach(() => {
  vi.clearAllMocks();
  mockPrintingFindMany.mockResolvedValue([] as never);
});

describe("parseAndResolve", () => {
  it("parses text and resolves matched cards", async () => {
    mockCardFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
    ] as never);

    const out = await parseAndResolve("1 Lightning Bolt");

    expect(out.parse.format).toBe("text");
    expect(out.resolution.resolved).toHaveLength(1);
    expect(matchedResolved(out)).toHaveLength(1);
    expect(matchedResolved(out)[0]?.cardId).toBe(1);
  });

  it("includes resolution warnings (e.g. foil downgrades)", async () => {
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

    const out = await parseAndResolve("1 Lightning Bolt (LEA) 100 *F*");

    expect(out.warnings.some((w) => w.includes("not available in foil"))).toBe(
      true,
    );
  });
});

describe("toAddChanges", () => {
  it("converts matched resolved cards into add ops", async () => {
    mockCardFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
    ] as never);

    const resolved = await parseAndResolve("3 Lightning Bolt");
    const changes = toAddChanges(resolved);

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

    const resolved = await parseAndResolve(
      "1 Lightning Bolt\n1 Made Up Card Name",
    );
    const changes = toAddChanges(resolved);

    expect(changes).toHaveLength(1);
    expect(changes[0]?.op).toBe("add");
  });
});

describe("toReplaceChanges", () => {
  it("diffs resolved cards against existing deck rows", async () => {
    mockCardFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
      { id: 2, name: "Counterspell" },
    ] as never);

    const resolved = await parseAndResolve(
      "2 Lightning Bolt\n1 Counterspell",
    );

    const existing: ExistingDeckCard[] = [
      {
        deckCardId: "dc-1",
        cardId: 1,
        zone: Zone.MAINBOARD,
        category: null,
        quantity: 4,
      },
    ];

    const changes = toReplaceChanges(resolved, existing);

    expect(changes).toContainEqual(
      expect.objectContaining({ op: "update", deckCardId: "dc-1", quantity: 2 }),
    );
    expect(changes).toContainEqual(
      expect.objectContaining({ op: "add", cardId: 2, quantity: 1 }),
    );
  });
});
