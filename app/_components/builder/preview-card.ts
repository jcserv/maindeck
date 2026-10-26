import type { PreviewCard } from "@/app/_components/deck/deck-preview-pane";
import {
  resolveCardBackImage,
  resolveCardImage,
  type DeckCard,
} from "@/lib/deck/zone-view";

export function toPreviewCard(dc: DeckCard): PreviewCard {
  return {
    deckCardId: dc.id,
    name: dc.card.name,
    imageUri: resolveCardImage(dc),
    backImageUri: resolveCardBackImage(dc),
    manaCost: dc.card.manaCost ?? null,
    typeLine: dc.card.typeLine ?? null,
    oracleText: dc.card.oracleText ?? null,
    setCode: dc.printing?.setCode ?? null,
    collectorNumber: dc.printing?.collectorNumber ?? null,
    isFoil: dc.isFoil,
  };
}
