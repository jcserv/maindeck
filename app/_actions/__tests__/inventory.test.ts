import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));
vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    printing: { findUnique: vi.fn() },
    holding: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession, getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { setHolding, setWishlist } from "../inventory";

const mockRequireSession = vi.mocked(requireSession);
const mockGetSession = vi.mocked(getSession);
const mockRedirect = vi.mocked(redirect);
const mockPrintingFindUnique = vi.mocked(prisma.printing.findUnique);
const mockHoldingUpsert = vi.mocked(prisma.holding.upsert);
const mockHoldingDeleteMany = vi.mocked(prisma.holding.deleteMany);
const mockUpdateTag = vi.mocked(updateTag);

const USER_ID = "user-1";
const PRINTING_ID = 42;

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSession.mockResolvedValue({
    userId: USER_ID,
    email: "v@test.com",
  } as never);
  mockPrintingFindUnique.mockResolvedValue({
    finishes: ["nonfoil", "foil"],
  } as never);
});

describe("setHolding", () => {
  it("upserts an OWNED row for the (user, printing, isFoil) key when quantity > 0", async () => {
    mockHoldingUpsert.mockResolvedValue({} as never);

    await setHolding(PRINTING_ID, false, 1);

    expect(mockHoldingUpsert).toHaveBeenCalledWith({
      where: {
        userId_printingId_isFoil: {
          userId: USER_ID,
          printingId: PRINTING_ID,
          isFoil: false,
        },
      },
      create: {
        userId: USER_ID,
        printingId: PRINTING_ID,
        isFoil: false,
        state: "OWNED",
        quantity: 1,
      },
      update: { state: "OWNED", quantity: 1 },
    });
    expect(mockUpdateTag).toHaveBeenCalledWith(`holdings:user:${USER_ID}`);
  });

  it("deletes the row when quantity === 0 (idempotent clear)", async () => {
    mockHoldingDeleteMany.mockResolvedValue({ count: 1 } as never);

    await setHolding(PRINTING_ID, false, 0);

    expect(mockHoldingDeleteMany).toHaveBeenCalledWith({
      where: {
        userId: USER_ID,
        printingId: PRINTING_ID,
        isFoil: false,
      },
    });
    expect(mockHoldingUpsert).not.toHaveBeenCalled();
    expect(mockUpdateTag).toHaveBeenCalledWith(`holdings:user:${USER_ID}`);
  });

  it("throws when the printing does not exist", async () => {
    mockPrintingFindUnique.mockResolvedValue(null);

    await expect(setHolding(PRINTING_ID, false, 1)).rejects.toThrow(
      "Printing not found",
    );
    expect(mockHoldingUpsert).not.toHaveBeenCalled();
  });

  it("throws when isFoil=true but the printing has no foil finish", async () => {
    mockPrintingFindUnique.mockResolvedValue({
      finishes: ["nonfoil"],
    } as never);

    await expect(setHolding(PRINTING_ID, true, 1)).rejects.toThrow(
      "This printing is not available in foil",
    );
    expect(mockHoldingUpsert).not.toHaveBeenCalled();
  });

  it("redirects to /sign-in when no session", async () => {
    mockRequireSession.mockImplementation(async () => {
      mockGetSession.mockResolvedValue(null);
      redirect("/sign-in");
      throw new Error("unreachable");
    });

    await expect(setHolding(PRINTING_ID, false, 1)).rejects.toThrow(
      /NEXT_REDIRECT:\/sign-in/,
    );
    expect(mockRedirect).toHaveBeenCalledWith("/sign-in");
  });

  it("rejects invalid quantity (negative)", async () => {
    await expect(setHolding(PRINTING_ID, false, -1)).rejects.toThrow();
    expect(mockHoldingUpsert).not.toHaveBeenCalled();
    expect(mockHoldingDeleteMany).not.toHaveBeenCalled();
  });

  it("bumps only the viewer holdings tag — never a deck-scoped tag", async () => {
    mockHoldingUpsert.mockResolvedValue({} as never);

    await setHolding(PRINTING_ID, false, 1);

    expect(mockUpdateTag).toHaveBeenCalledTimes(1);
    expect(mockUpdateTag).toHaveBeenCalledWith(`holdings:user:${USER_ID}`);
  });
});

describe("setWishlist", () => {
  it("upserts a WISHLIST row when on=true", async () => {
    mockHoldingUpsert.mockResolvedValue({} as never);

    await setWishlist(PRINTING_ID, false, true);

    expect(mockHoldingUpsert).toHaveBeenCalledWith({
      where: {
        userId_printingId_isFoil: {
          userId: USER_ID,
          printingId: PRINTING_ID,
          isFoil: false,
        },
      },
      create: {
        userId: USER_ID,
        printingId: PRINTING_ID,
        isFoil: false,
        state: "WISHLIST",
        quantity: 0,
      },
      update: { state: "WISHLIST", quantity: 0 },
    });
    expect(mockUpdateTag).toHaveBeenCalledWith(`holdings:user:${USER_ID}`);
  });

  it("on=false only deletes WISHLIST rows — does not touch an OWNED row at the same key", async () => {
    mockHoldingDeleteMany.mockResolvedValue({ count: 1 } as never);

    await setWishlist(PRINTING_ID, false, false);

    expect(mockHoldingDeleteMany).toHaveBeenCalledWith({
      where: {
        userId: USER_ID,
        printingId: PRINTING_ID,
        isFoil: false,
        state: "WISHLIST",
      },
    });
    expect(mockHoldingUpsert).not.toHaveBeenCalled();
  });

  it("foil validation applies to wishlist too", async () => {
    mockPrintingFindUnique.mockResolvedValue({
      finishes: ["nonfoil"],
    } as never);

    await expect(setWishlist(PRINTING_ID, true, true)).rejects.toThrow(
      "This printing is not available in foil",
    );
  });

  it("throws when the printing does not exist", async () => {
    mockPrintingFindUnique.mockResolvedValue(null);

    await expect(setWishlist(PRINTING_ID, false, true)).rejects.toThrow(
      "Printing not found",
    );
  });
});
