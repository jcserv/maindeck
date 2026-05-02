"use client";

import {
  cloneElement,
  useEffect,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactElement,
} from "react";
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
import type { ClientPrinting } from "@/lib/card/printing-types";
import { updateCardPrinting } from "@/app/_actions/deck/printings";

const DESKTOP_QUERY = "(min-width: 768px)";
function subscribeDesktop(cb: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function getDesktopSnapshot() {
  return window.matchMedia(DESKTOP_QUERY).matches;
}
function getDesktopServerSnapshot() {
  return false;
}
function useIsDesktop() {
  return useSyncExternalStore(
    subscribeDesktop,
    getDesktopSnapshot,
    getDesktopServerSnapshot,
  );
}

interface PrintingPickerProps {
  deckId: string;
  deckCardId: string;
  cardId: number;
  cardName: string;
  currentPrintingId: number | null;
  currentIsFoil: boolean;
  trigger: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/cards/${cardId}/printings`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: ClientPrinting[] = await res.json();
        if (!cancelled) setPrintings(data);
      } catch {
        if (!cancelled) setFetchError("Failed to load printings.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  if (fetchError) {
    return (
      <p className="text-sm text-destructive text-center py-8">{fetchError}</p>
    );
  }

  if (printings === null) {
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
  open,
  onOpenChange,
}: PrintingPickerProps) {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const [isSaving, startSave] = useTransition();

  const isOpen = isControlled ? open : internalOpen;
  const setOpen = (next: boolean) => {
    if (isControlled) onOpenChange?.(next);
    else setInternalOpen(next);
  };

  function handleSelect(printingId: number, isFoil: boolean) {
    startSave(async () => {
      await updateCardPrinting(deckId, deckCardId, printingId, isFoil);
      setOpen(false);
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

  if (isDesktop) {
    return (
      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogTrigger nativeButton={false} render={trigger} />
        <DialogContent
          className="sm:max-w-lg overflow-y-auto max-h-[90vh]"
          aria-busy={isSaving}
        >
          <DialogHeader>
            <DialogTitle>{cardName}</DialogTitle>
          </DialogHeader>
          {isOpen && pickerContent}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      {cloneElement(trigger as ReactElement<{ onClick?: () => void }>, {
        onClick: () => setOpen(true),
      })}
      <BottomSheet open={isOpen} onOpenChange={setOpen} title={cardName}>
        {isOpen && pickerContent}
      </BottomSheet>
    </>
  );
}
