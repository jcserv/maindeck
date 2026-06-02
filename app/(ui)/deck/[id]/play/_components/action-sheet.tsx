"use client";

import BottomSheet from "@/app/_components/bottom-sheet";
import { Button } from "@/components/ui/button";
import type { PlaytestCard, PlaytestZone } from "../playtest-reducer";

interface ActionSheetProps {
  card: PlaytestCard | null;
  open: boolean;
  onClose: () => void;
  onSendTo: (id: string, zone: PlaytestZone) => void;
}

const ZONE_ACTIONS: { label: string; zone: PlaytestZone }[] = [
  { label: "→ Battlefield", zone: "battlefield" },
  { label: "→ Hand", zone: "hand" },
  { label: "→ Graveyard", zone: "graveyard" },
  { label: "→ Exile", zone: "exile" },
  { label: "→ Library (top)", zone: "library" },
];

export function ActionSheet({ card, open, onClose, onSendTo }: ActionSheetProps) {
  if (!card) return null;

  return (
    <BottomSheet open={open} onOpenChange={(o) => !o && onClose()} title={card.name}>
      <div className="flex flex-col gap-2 pt-2">
        {ZONE_ACTIONS.filter((a) => a.zone !== card.zone).map((a) => (
          <Button
            key={a.zone}
            variant="outline"
            className="w-full justify-start"
            onClick={() => {
              onSendTo(card.instanceId, a.zone);
              onClose();
            }}
          >
            {a.label}
          </Button>
        ))}
      </div>
    </BottomSheet>
  );
}
