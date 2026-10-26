"use server";

import { notFound } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { withActionLogging } from "@/lib/telemetry";
import { DeckKind, Format, Visibility } from "@/lib/generated/prisma/enums";
import { applyChanges, runOwnerDeckMutation } from "@/lib/deck/mutation";
import { ensureDeckCategories } from "@/lib/deck/category-registry";
import { deckCreateTags, invalidateTags } from "@/lib/deck/cache-tags";
import { deckNameSchema } from "@/lib/deck/forms";
import { getPackagesByUser, type PackageSummary } from "@/lib/deck/package-queries";
import { planPackageApply, type PackageCard } from "@/lib/deck/package";

const packageIdSchema = z.string().min(1);

export const createPackage = withActionLogging(
  "package.create",
  async (name: string): Promise<string> => {
    const session = await requireSession();
    const parsed = deckNameSchema.parse(name);

    const pkg = await prisma.deck.create({
      data: {
        userId: session.userId,
        name: parsed,
        format: Format.CASUAL,
        visibility: Visibility.PRIVATE,
        kind: DeckKind.PACKAGE,
      },
      select: { id: true },
    });

    invalidateTags(deckCreateTags({ visibility: Visibility.PRIVATE }));
    return pkg.id;
  },
);

export async function listMyPackages(): Promise<PackageSummary[]> {
  const { userId } = await requireSession();
  return getPackagesByUser(userId);
}

/**
 * 404s on missing, non-package, and PRIVATE-and-not-owner ids so callers
 * can't probe which package ids exist.
 */
async function loadViewablePackage(
  packageId: string,
  viewerId: string,
): Promise<{ cards: PackageCard[]; categoryNames: string[] }> {
  const pkg = await prisma.deck.findUnique({
    where: { id: packageId },
    select: {
      userId: true,
      kind: true,
      visibility: true,
      categories: { orderBy: { sortOrder: "asc" }, select: { name: true } },
      cards: {
        orderBy: { createdAt: "asc" },
        select: {
          cardId: true,
          zone: true,
          quantity: true,
          printingId: true,
          isFoil: true,
          card: { select: { name: true, typeLine: true } },
          categoryLinks: {
            orderBy: { position: "asc" },
            select: { deckCategory: { select: { name: true } } },
          },
        },
      },
    },
  });
  if (
    !pkg ||
    pkg.kind !== DeckKind.PACKAGE ||
    (pkg.visibility === Visibility.PRIVATE && pkg.userId !== viewerId)
  ) {
    notFound();
  }

  return {
    categoryNames: pkg.categories.map((c) => c.name),
    cards: pkg.cards.map((c) => ({
      cardId: c.cardId,
      cardName: c.card.name,
      typeLine: c.card.typeLine,
      zone: c.zone,
      quantity: c.quantity,
      printingId: c.printingId,
      isFoil: c.isFoil,
      categories: c.categoryLinks.map((l) => l.deckCategory.name),
    })),
  };
}

type ApplyPackageResult = { added: number; skipped: string[] };

/**
 * One-time copy of a package's cards into the caller's deck. Later edits to
 * the package don't propagate. The package's categories are registered on the
 * deck (in the package's order) before the cards that reference them land.
 */
export const applyPackageToDeck = runOwnerDeckMutation(
  "deck.applyPackage",
  "none",
  async (
    { deckId, userId },
    packageId: string,
  ): Promise<ApplyPackageResult> => {
    const id = packageIdSchema.parse(packageId);
    const [pkg, deck, existing] = await Promise.all([
      loadViewablePackage(id, userId),
      prisma.deck.findUniqueOrThrow({
        where: { id: deckId },
        select: { format: true },
      }),
      prisma.deckCard.findMany({
        where: { deckId },
        select: { cardId: true },
        distinct: ["cardId"],
      }),
    ]);

    const { changes, skipped } = planPackageApply(
      pkg.cards,
      new Set(existing.map((r) => r.cardId)),
      deck.format,
    );
    if (changes.length === 0) return { added: 0, skipped };

    const used = new Set(
      changes.flatMap((c) => (c.op === "add" ? c.categories : [])),
    );
    await prisma.$transaction(async (tx) => {
      await ensureDeckCategories(
        tx,
        deckId,
        pkg.categoryNames.filter((name) => used.has(name)),
      );
      await applyChanges(deckId, userId, changes, { tx });
    });

    const added = changes.reduce(
      (sum, c) => sum + (c.op === "add" ? c.quantity : 0),
      0,
    );
    return { added, skipped };
  },
);
