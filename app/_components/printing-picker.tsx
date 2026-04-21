"use client";

import { cloneElement, useEffect, useState, useTransition, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import BottomSheet from "@/app/_components/bottom-sheet";
import { PrintingCarousel } from "@/app/_components/printing-carousel";
import { fetchPrintingsForCard, type ClientPrinting } from "@/lib/deck/printing-fetch-action";
import { updateCardPrinting } from "@/lib/deck/printing-actions";

interface PrintingPickerProps {
  deckId: string;
  deckCardId: string;
  cardId: number;
  cardName: string;
  currentPrintingId: number | null;
  currentIsFoil: boolean;
  trigger: ReactElement;
}

interface PickerContentProps {
  cardId: number;
  cardName: string;
  currentPrintingId: number | null;
  currentIsFoil: boolean;
  onSelect: (printingId: number, isFoil: boolean) => void;
}

function PickerContent({
  cardId,
  cardName,
  currentPrintingId,
  currentIsFoil,
  onSelect,
}: PickerContentProps) {
  const [printings, setPrintings] = useState<ClientPrinting[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isFetching, startFetch] = useTransition();

  useEffect(() => {
    let cancelled = false;
    startFetch(async () => {
      try {
        const data = await fetchPrintingsForCard(cardId);
        if (!cancelled) setPrintings(data);
      } catch {
        if (!cancelled) setFetchError("Failed to load printings.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  if (fetchError) {
    return (
      <p className="text-sm text-destructive text-center py-8">{fetchError}</p>
    );
  }

  if (isFetching || printings === null) {
    return (
      <div className="flex items-center justify-center py-12" aria-label="Loading printings">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  if (printings.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No printings found for {cardName}.
      </p>
    );
  }

  return (
    <PrintingCarousel
      printings={printings}
      selectedId={currentPrintingId}
      isFoil={currentIsFoil}
      onSelect={onSelect}
    />
  );
}

export function PrintingPicker({
  deckId,
  deckCardId,
  cardId,
  cardName,
  currentPrintingId,
  currentIsFoil,
  trigger,
}: PrintingPickerProps) {
  const router = useRouter();
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isSaving, startSave] = useTransition();

  function handleSelect(printingId: number, isFoil: boolean) {
    startSave(async () => {
      await updateCardPrinting(deckId, deckCardId, printingId, isFoil);
      setDesktopOpen(false);
      setMobileOpen(false);
      router.refresh();
    });
  }

  const pickerContent = (
    <PickerContent
      cardId={cardId}
      cardName={cardName}
      currentPrintingId={currentPrintingId}
      currentIsFoil={currentIsFoil}
      onSelect={handleSelect}
    />
  );

  return (
    <>
      {/* Desktop: Dialog — hidden on mobile */}
      <span className="hidden md:contents">
        <Dialog open={desktopOpen} onOpenChange={setDesktopOpen}>
          <DialogTrigger render={trigger} />
          <DialogContent
            className="sm:max-w-lg overflow-y-auto max-h-[90vh]"
            aria-busy={isSaving}
          >
            <DialogHeader>
              <DialogTitle>{cardName}</DialogTitle>
            </DialogHeader>
            {desktopOpen && pickerContent}
          </DialogContent>
        </Dialog>
      </span>

      {/* Mobile: BottomSheet — hidden on desktop */}
      <span className="contents md:hidden">
        {cloneElement(trigger as ReactElement<{ onClick?: () => void }>, {
          onClick: () => setMobileOpen(true),
        })}

        <BottomSheet
          open={mobileOpen}
          onOpenChange={setMobileOpen}
          title={cardName}
        >
          {mobileOpen && pickerContent}
        </BottomSheet>
      </span>
    </>
  );
}
