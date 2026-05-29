import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    card: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));
vi.mock("../cycles", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../cycles")>();
  return {
    ...actual,
    classifyLandCycle: vi.fn(),
    fetchableColors: vi.fn(),
  };
});

import { prisma } from "@/lib/db";
import { classifyLandCycle, fetchableColors } from "../cycles";
import {
  getBasicLandCardIds,
  getBasicLandImages,
  getLandCandidates,
} from "../candidates";

const mockQueryRaw = vi.mocked(prisma.$queryRaw);
const mockCardFindMany = vi.mocked(prisma.card.findMany);
const mockClassify = vi.mocked(classifyLandCycle);
const mockFetchableColors = vi.mocked(fetchableColors);

function makeRow(overrides: Partial<{
  id: number;
  name: string;
  type_line: string | null;
  oracle_text: string | null;
  mana_cost: string | null;
  image_uri: string;
  colors: string[] | null;
  color_identity: string[] | null;
}> = {}) {
  return {
    id: 1,
    name: "Test Land",
    type_line: "Land",
    oracle_text: null,
    mana_cost: null,
    image_uri: "/img.webp",
    colors: [],
    color_identity: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getLandCandidates", () => {
  it("returns empty buckets when no rows match", async () => {
    mockQueryRaw.mockResolvedValue([] as never);

    const result = await getLandCandidates(["W", "U"], "COMMANDER");

    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    // Every cycle bucket exists but is empty
    for (const value of Object.values(result)) {
      expect(value).toEqual([]);
    }
  });

  it("places classified row into the correct cycle bucket", async () => {
    const row = makeRow({ id: 42, name: "Steam Vents", color_identity: ["U", "R"] });
    mockQueryRaw.mockResolvedValue([row] as never);
    mockClassify.mockReturnValue("shock");

    const result = await getLandCandidates(["U", "R"], "MODERN");

    expect(result["shock"]).toHaveLength(1);
    expect(result["shock"]![0]).toMatchObject({
      id: 42,
      name: "Steam Vents",
      cycleId: "shock",
    });
  });

  it("skips rows classifyLandCycle returns null for", async () => {
    mockQueryRaw.mockResolvedValue([makeRow()] as never);
    mockClassify.mockReturnValue(null);

    const result = await getLandCandidates(["W"], "STANDARD");

    for (const value of Object.values(result)) {
      expect(value).toEqual([]);
    }
  });

  it("includes a fetch land that can grab at least one on-color basic", async () => {
    const row = makeRow({ name: "Scalding Tarn", oracle_text: "Island or Mountain" });
    mockQueryRaw.mockResolvedValue([row] as never);
    mockClassify.mockReturnValue("fetch");
    mockFetchableColors.mockReturnValue(["U", "R"]);

    const result = await getLandCandidates(["U", "R"], "MODERN");

    expect(result["fetch"]).toHaveLength(1);
  });

  it("excludes a fetch land whose fetchable colors are all off-color", async () => {
    const row = makeRow({ name: "Marsh Flats", oracle_text: "Plains or Swamp" });
    mockQueryRaw.mockResolvedValue([row] as never);
    mockClassify.mockReturnValue("fetch");
    mockFetchableColors.mockReturnValue(["W", "B"]);

    // Deck is U/R only — W and B are both off-color
    const result = await getLandCandidates(["U", "R"], "MODERN");

    expect(result["fetch"]).toHaveLength(0);
  });

  it("includes a generic fetch land (fetchableColors returns empty array)", async () => {
    const row = makeRow({ name: "Prismatic Vista", oracle_text: "basic land" });
    mockQueryRaw.mockResolvedValue([row] as never);
    mockClassify.mockReturnValue("fetch");
    mockFetchableColors.mockReturnValue([]);

    const result = await getLandCandidates(["W"], "COMMANDER");

    expect(result["fetch"]).toHaveLength(1);
  });

  it("handles null color_identity and colors on row gracefully", async () => {
    const row = makeRow({ color_identity: null, colors: null });
    mockQueryRaw.mockResolvedValue([row] as never);
    mockClassify.mockReturnValue("shock");

    const result = await getLandCandidates(["W", "U", "B", "R", "G"], "COMMANDER");

    expect(result["shock"]![0]!.colorIdentity).toEqual([]);
  });

  it("passes all 5 WUBRG colors in identity — no exclusion clause needed", async () => {
    mockQueryRaw.mockResolvedValue([] as never);

    await getLandCandidates(["W", "U", "B", "R", "G"], "COMMANDER");

    // SQL is still called once; exclusion branch for WUBRG-inclusive decks exercised
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });

  it("passes a colorless/mono-color identity — exclusion clause filters off-color lands", async () => {
    mockQueryRaw.mockResolvedValue([] as never);

    await getLandCandidates(["W"], "COMMANDER");

    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });
});

describe("getBasicLandCardIds", () => {
  it("maps basic land names to card ids", async () => {
    mockCardFindMany.mockResolvedValue([
      { id: 1, name: "Plains" },
      { id: 2, name: "Island" },
      { id: 3, name: "Swamp" },
      { id: 4, name: "Mountain" },
      { id: 5, name: "Forest" },
      { id: 6, name: "Wastes" },
    ] as never);

    const result = await getBasicLandCardIds();

    expect(result).toEqual({ W: 1, U: 2, B: 3, R: 4, G: 5, C: 6 });
  });

  it("queries only basic land names", async () => {
    mockCardFindMany.mockResolvedValue([
      { id: 1, name: "Plains" },
      { id: 2, name: "Island" },
      { id: 3, name: "Swamp" },
      { id: 4, name: "Mountain" },
      { id: 5, name: "Forest" },
      { id: 6, name: "Wastes" },
    ] as never);

    await getBasicLandCardIds();

    expect(mockCardFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          name: {
            in: expect.arrayContaining(["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes"]),
          },
        },
      }),
    );
  });
});

describe("getBasicLandImages", () => {
  const BASIC_ROWS = [
    { name: "Plains", image_uri: "/plains.webp" },
    { name: "Island", image_uri: "/island.webp" },
    { name: "Swamp", image_uri: "/swamp.webp" },
    { name: "Mountain", image_uri: "/mountain.webp" },
    { name: "Forest", image_uri: "/forest.webp" },
    { name: "Wastes", image_uri: "/wastes.webp" },
  ];

  it("returns image URIs keyed by color", async () => {
    mockQueryRaw.mockResolvedValue(BASIC_ROWS as never);

    const result = await getBasicLandImages();

    expect(result).toEqual({
      W: "/plains.webp",
      U: "/island.webp",
      B: "/swamp.webp",
      R: "/mountain.webp",
      G: "/forest.webp",
      C: "/wastes.webp",
    });
  });

  it("throws when a basic land image is missing", async () => {
    // Return only 5 basics — Wastes is missing
    mockQueryRaw.mockResolvedValue(BASIC_ROWS.slice(0, 5) as never);

    await expect(getBasicLandImages()).rejects.toThrow(
      "Missing basic land images for: C",
    );
  });

  it("throws listing all missing colors when multiple are absent", async () => {
    mockQueryRaw.mockResolvedValue([] as never);

    await expect(getBasicLandImages()).rejects.toThrow(
      "Missing basic land images for:",
    );
  });
});
