"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { withActionLogging } from "@/lib/telemetry";
import { invalidateTags, viewerHoldingsTag } from "@/lib/deck/cache-tags";

const setHoldingSchema = z.object({
  printingId: z.number().int().positive(),
  isFoil: z.boolean(),
  quantity: z.number().int().min(0),
});

const setWishlistSchema = z.object({
  printingId: z.number().int().positive(),
  isFoil: z.boolean(),
  on: z.boolean(),
});

async function assertPrintingSupportsFoil(
  printingId: number,
  isFoil: boolean,
): Promise<void> {
  const printing = await prisma.printing.findUnique({
    where: { id: printingId },
    select: { finishes: true },
  });
  if (!printing) {
    throw new Error("Printing not found");
  }
  if (isFoil && !printing.finishes.includes("foil")) {
    throw new Error("This printing is not available in foil");
  }
}

export const setHolding = withActionLogging(
  "inventory.setHolding",
  async (
    printingId: number,
    isFoil: boolean,
    quantity: number,
  ): Promise<void> => {
    const args = setHoldingSchema.parse({ printingId, isFoil, quantity });
    const session = await requireSession();
    await assertPrintingSupportsFoil(args.printingId, args.isFoil);

    if (args.quantity === 0) {
      await prisma.holding.deleteMany({
        where: {
          userId: session.userId,
          printingId: args.printingId,
          isFoil: args.isFoil,
        },
      });
    } else {
      await prisma.holding.upsert({
        where: {
          userId_printingId_isFoil: {
            userId: session.userId,
            printingId: args.printingId,
            isFoil: args.isFoil,
          },
        },
        create: {
          userId: session.userId,
          printingId: args.printingId,
          isFoil: args.isFoil,
          state: "OWNED",
          quantity: args.quantity,
        },
        update: { state: "OWNED", quantity: args.quantity },
      });
    }

    invalidateTags([viewerHoldingsTag(session.userId)]);
  },
);

export const setWishlist = withActionLogging(
  "inventory.setWishlist",
  async (
    printingId: number,
    isFoil: boolean,
    on: boolean,
  ): Promise<void> => {
    const args = setWishlistSchema.parse({ printingId, isFoil, on });
    const session = await requireSession();
    await assertPrintingSupportsFoil(args.printingId, args.isFoil);

    if (args.on) {
      await prisma.holding.upsert({
        where: {
          userId_printingId_isFoil: {
            userId: session.userId,
            printingId: args.printingId,
            isFoil: args.isFoil,
          },
        },
        create: {
          userId: session.userId,
          printingId: args.printingId,
          isFoil: args.isFoil,
          state: "WISHLIST",
          quantity: 0,
        },
        update: { state: "WISHLIST", quantity: 0 },
      });
    } else {
      await prisma.holding.deleteMany({
        where: {
          userId: session.userId,
          printingId: args.printingId,
          isFoil: args.isFoil,
          state: "WISHLIST",
        },
      });
    }

    invalidateTags([viewerHoldingsTag(session.userId)]);
  },
);
