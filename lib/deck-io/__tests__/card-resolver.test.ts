import { beforeEach, describe, expect, it, vi } from "vitest";
import { Zone } from "@/lib/generated/prisma/client";
import type { ParsedCard } from "../parse";

vi.mock("@/lib/db", () => ({
  prisma: {
    card: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { resolveCardNames } from "../card-resolver";

const mockFindMany = vi.mocked(prisma.card.findMany);

function parsed(name: string, overrides: Partial<ParsedCard> = {}): ParsedCard {
  return {
    name,
    quantity: 1,
    isFoil: false,
    zone: Zone.MAINBOARD,
    category: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveCardNames", () => {
  it("matches exactly (case-insensitive)", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
    ] as never);

    const [row] = await resolveCardNames([parsed("lightning bolt")]);

    expect(row).toMatchObject({
      cardId: 1,
      matchedName: "Lightning Bolt",
      match: { kind: "exact" },
    });
    expect(mockFindMany).toHaveBeenCalledTimes(1);
  });

  it("falls back to fuzzy when no exact match", async () => {
    mockFindMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ id: 42, name: "Lightning Helix" }] as never);

    const [row] = await resolveCardNames([parsed("Lightnin")]);

    expect(row).toMatchObject({
      cardId: 42,
      matchedName: "Lightning Helix",
    });
    expect(row!.match.kind).toBe("fuzzy");
  });

  it("picks the closest-length candidate", async () => {
    mockFindMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        { id: 10, name: "Shockwave Totem Of The Ancients" },
        { id: 11, name: "Shock" },
        { id: 12, name: "Shockwave" },
      ] as never);

    const [row] = await resolveCardNames([parsed("Shockwav")]);

    expect(row).toMatchObject({ cardId: 12, matchedName: "Shockwave" });
  });

  it("returns kind: none for truly unknown names", async () => {
    mockFindMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    const [row] = await resolveCardNames([parsed("Nonexistent")]);

    expect(row).toMatchObject({
      cardId: null,
      matchedName: null,
      match: { kind: "none" },
    });
  });

  it("dedupes lookups when multiple rows reference the same name", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 1, name: "Lightning Bolt" },
    ] as never);

    const rows = await resolveCardNames([
      parsed("Lightning Bolt"),
      parsed("LIGHTNING BOLT"),
      parsed("lightning bolt"),
    ]);

    expect(rows.every((r) => r.cardId === 1)).toBe(true);
    expect(mockFindMany).toHaveBeenCalledTimes(1);
  });
});
