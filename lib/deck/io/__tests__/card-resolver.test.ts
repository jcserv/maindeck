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

// Must match FUZZY_CONCURRENCY in lib/deck/io/card-resolver.ts (kept private
// there); update both together if the resolver's concurrency cap changes.
const FUZZY_CONCURRENCY = 25;

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

  it("falls back to fuzzy when no exact match and confidence is high enough", async () => {
    // "Shockwav" (8) -> "Shockwave" (9): delta=1, confidence=1-1/8=0.875 >= 0.7
    mockFindMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ id: 42, name: "Shockwave" }] as never);

    const [row] = await resolveCardNames([parsed("Shockwav")]);

    expect(row).toMatchObject({
      cardId: 42,
      matchedName: "Shockwave",
    });
    expect(row!.match.kind).toBe("fuzzy");
    expect(row!.warnings).toHaveLength(1);
    expect(row!.warnings[0]).toContain("Shockwave");
  });

  it("returns kind:none for low-confidence fuzzy matches (below threshold)", async () => {
    // "Lightnin" (8) -> "Lightning Helix" (15): delta=7, confidence=1-7/8=0.125 < 0.7
    mockFindMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ id: 42, name: "Lightning Helix" }] as never);

    const [row] = await resolveCardNames([parsed("Lightnin")]);

    expect(row).toMatchObject({
      cardId: null,
      matchedName: null,
      match: { kind: "none" },
    });
    expect(row!.warnings).toHaveLength(0);
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

  it("issues at most FUZZY_CONCURRENCY in-flight fuzzy queries at once", async () => {
    // 100 unresolved unique names → exact returns empty, then 100 fuzzy queries
    // should be throttled to ≤25 concurrent.
    const N = 100;
    let peakConcurrent = 0;
    let currentConcurrent = 0;

    // exact-match call
    mockFindMany.mockResolvedValueOnce([] as never);

    // Each subsequent call tracks concurrent in-flight requests
    mockFindMany.mockImplementation(() => {
      currentConcurrent++;
      peakConcurrent = Math.max(peakConcurrent, currentConcurrent);
      return new Promise((resolve) =>
        setTimeout(() => {
          currentConcurrent--;
          resolve([] as never);
        }, 0),
      ) as never;
    });

    const cards = Array.from({ length: N }, (_, i) =>
      parsed(`UniqueCard${i}`),
    );
    await resolveCardNames(cards);

    expect(peakConcurrent).toBeLessThanOrEqual(FUZZY_CONCURRENCY);
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
