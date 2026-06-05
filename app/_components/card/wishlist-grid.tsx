"use client";

import { useOptimistic } from "react";
import CardTile from "@/app/_components/card/card-tile";
import { WishlistRemoveButton } from "@/app/_components/card/wishlist-remove-button";
import { Chip } from "@/components/ui/chip";
import { toNameSlug } from "@/lib/utils";
import type { WishlistEntry } from "@/lib/inventory/queries";

function entryKey(e: Pick<WishlistEntry, "printingId" | "isFoil">) {
  return `${e.printingId}:${e.isFoil}`;
}

export function WishlistGrid({ entries }: { entries: WishlistEntry[] }) {
  const [visible, removeEntry] = useOptimistic(
    entries,
    (curr: WishlistEntry[], key: string) =>
      curr.filter((e) => entryKey(e) !== key),
  );

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {visible.map((entry) => {
        const key = entryKey(entry);
        return (
          <div key={key} className="relative">
            <CardTile
              id={key}
              name={entry.cardName}
              thumbnailUrl={entry.imageUri}
              heroUrl={entry.imageUri}
              href={`/card/${entry.nameSlug ?? toNameSlug(entry.cardName)}`}
              gameChanger={entry.gameChanger}
            />
            {entry.isFoil && (
              <Chip
                tone="accent"
                size="sm"
                className="absolute bottom-1.5 left-1.5 shadow-sm"
                title="Foil"
              >
                Foil
              </Chip>
            )}
            <WishlistRemoveButton
              printingId={entry.printingId}
              isFoil={entry.isFoil}
              onRemoved={() => removeEntry(key)}
            />
          </div>
        );
      })}
    </div>
  );
}
