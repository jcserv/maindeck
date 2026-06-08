"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { FlippableCardImage } from "@/app/_components/card/flippable-card-image";
import { ManaCost } from "@/app/_components/card/mana-cost";
import { OracleText } from "@/app/_components/card/oracle-text";
import { Eyebrow } from "@/components/ui/eyebrow";
import BottomSheet from "@/app/_components/bottom-sheet";
import Link from "@/app/_components/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, toNameSlug } from "@/lib/utils";
import {
  computeNextRowIndex,
  isFocusInRow,
  isTextInputTarget,
  resolveCurrentRowIndex,
  rowNavDelta,
} from "./deck-preview-pane-keys";

export interface PreviewCard {
  name: string;
  imageUri: string | null;
  backImageUri?: string | null;
  manaCost: string | null;
  typeLine: string | null;
  oracleText?: string | null;
  setCode?: string | null;
  collectorNumber?: string | null;
  isFoil?: boolean;
}

function FoilOverlays() {
  return (
    <>
      <div className="foil-effect" aria-hidden />
      <div className="foil-overlay-1" aria-hidden />
      <div className="foil-overlay-2" aria-hidden />
    </>
  );
}

// Stable callbacks — value never changes after mount, so card-row consumers
// don't re-render on hover.
interface PreviewActionsValue {
  preview: (card: PreviewCard) => void;
  clear: () => void;
  openSheet: (card: PreviewCard) => void;
  openDetail: (card: PreviewCard, returnFocus?: HTMLElement | null) => void;
  setSheetCard: (card: PreviewCard | null) => void;
  setDetailCard: (card: PreviewCard | null) => void;
  setOrderedCards: (cards: PreviewCard[]) => void;
  getOrderedCards: () => PreviewCard[];
}

// Previewed-card state — changes on hover; consumed only by the panes.
interface PreviewStateValue {
  current: PreviewCard | null;
  sheetCard: PreviewCard | null;
  detailCard: PreviewCard | null;
  // Reactive length of the ordered paging list. The list itself lives in a ref
  // (so hover doesn't re-render rows), but the detail modal needs to re-render
  // when the list populates so the Prev/Next controls appear.
  orderedCount: number;
}

const PreviewActionsContext = createContext<PreviewActionsValue | null>(null);
const PreviewStateContext = createContext<PreviewStateValue | null>(null);

export function useDeckPreview() {
  return useContext(PreviewActionsContext);
}

function usePreviewState() {
  return useContext(PreviewStateContext);
}

export function DeckPreviewProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<PreviewCard | null>(null);
  const [sheetCard, setSheetCard] = useState<PreviewCard | null>(null);
  const [detailCard, setDetailCard] = useState<PreviewCard | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const orderedCardsRef = useRef<PreviewCard[]>([]);
  const [orderedCount, setOrderedCount] = useState(0);

  const setOrderedCards = useCallback((cards: PreviewCard[]) => {
    orderedCardsRef.current = cards;
    // Track length as state so the detail modal re-renders when the list
    // populates. The sync effect runs every render with the same-length list,
    // so the guard keeps this from looping — it only fires on real changes.
    setOrderedCount((prev) => (prev === cards.length ? prev : cards.length));
  }, []);

  const getOrderedCards = useCallback(() => orderedCardsRef.current, []);

  const preview = useCallback((card: PreviewCard) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    // Short debounce: collapses pass-through during fast flicks but keeps the
    // preview tracking the cursor. The main thread is idle on hover, so a tight
    // value reads as responsive rather than "delayed".
    hoverTimer.current = setTimeout(() => setCurrent(card), 40);
  }, []);

  const clear = useCallback(() => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }, []);

  const openSheet = useCallback((card: PreviewCard) => {
    setSheetCard(card);
  }, []);

  const openDetail = useCallback(
    (card: PreviewCard, returnFocus?: HTMLElement | null) => {
      returnFocusRef.current = returnFocus ?? null;
      setDetailCard(card);
    },
    [],
  );

  const closeDetail = useCallback(() => {
    setDetailCard(null);
    const el = returnFocusRef.current;
    returnFocusRef.current = null;
    // Defer to after unmount so focus lands on the original row
    if (el) requestAnimationFrame(() => el.focus());
  }, []);

  const actions = useMemo<PreviewActionsValue>(
    () => ({
      preview,
      clear,
      openSheet,
      openDetail,
      setSheetCard,
      setDetailCard: (c) => {
        if (c === null) closeDetail();
        else setDetailCard(c);
      },
      setOrderedCards,
      getOrderedCards,
    }),
    [
      preview,
      clear,
      openSheet,
      openDetail,
      closeDetail,
      setOrderedCards,
      getOrderedCards,
    ],
  );

  const state = useMemo<PreviewStateValue>(
    () => ({ current, sheetCard, detailCard, orderedCount }),
    [current, sheetCard, detailCard, orderedCount],
  );

  useEffect(() => {
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (detailCard !== null || sheetCard !== null) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTextInputTarget(e.target)) return;
      const delta = rowNavDelta(e.key);
      if (delta === null) return;

      const rows = Array.from(
        document.querySelectorAll<HTMLElement>("[data-deck-row]"),
      );
      if (rows.length === 0) return;

      // j/k only fires when the focus is already on a deck row, so a stray
      // keystroke anywhere else on the page doesn't steal focus.
      if ((e.key === "j" || e.key === "k") && !isFocusInRow()) return;

      const currentIdx = resolveCurrentRowIndex(rows);
      const next = rows[computeNextRowIndex(currentIdx, rows.length, delta)];
      if (!next) return;
      e.preventDefault();
      next.focus();
      next.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [detailCard, sheetCard]);

  return (
    <PreviewStateContext.Provider value={state}>
      <PreviewActionsContext.Provider value={actions}>
        {children}
        <DeckPreviewSheet />
        <DeckDetailSheet />
      </PreviewActionsContext.Provider>
    </PreviewStateContext.Provider>
  );
}

export function DeckPreviewPane() {
  const card = usePreviewState()?.current ?? null;
  return (
    <aside
      aria-label="Card preview"
      className="sticky top-20 hidden lg:flex flex-col gap-3 w-[280px] shrink-0"
    >
      <Eyebrow>Preview</Eyebrow>
      <div
        className={cn(
          "relative aspect-[63/88] w-full rounded-xl border bg-muted/30 overflow-hidden flex items-center justify-center",
          card?.isFoil && "card",
        )}
      >
        {card?.imageUri ? (
          <FlippableCardImage
            frontUrl={card.imageUri}
            backUrl={card.backImageUri}
            alt={card.name}
            fill
            sizes="280px"
            className="object-contain"
            containerClassName="absolute inset-0"
            unoptimized
            frontOverlay={card.isFoil ? <FoilOverlays /> : null}
          />
        ) : (
          <span className="text-xs text-muted-foreground text-center px-4">
            Hover a card to preview
          </span>
        )}
      </div>
      {card && (
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <span className="font-medium truncate">{card.name}</span>
            {card.manaCost && (
              <ManaCost cost={card.manaCost} className="shrink-0" />
            )}
          </div>
          {card.typeLine && (
            <div className="text-xs text-muted-foreground truncate">
              {card.typeLine}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

function DeckPreviewSheet() {
  const actions = useDeckPreview();
  const card = usePreviewState()?.sheetCard ?? null;
  const open = card !== null;
  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) actions?.setSheetCard(null);
      }}
      title={card?.name ?? "Card preview"}
    >
      {card ? (
        <div className="flex flex-col items-center gap-3">
          <div
            className={cn(
              "relative aspect-[63/88] w-full max-w-[280px] rounded-xl border bg-muted/30 overflow-hidden flex items-center justify-center",
              card.isFoil && "card",
            )}
          >
            {card.imageUri ? (
              <FlippableCardImage
                frontUrl={card.imageUri}
                backUrl={card.backImageUri}
                alt={card.name}
                fill
                sizes="280px"
                className="object-contain"
                containerClassName="absolute inset-0"
                frontOverlay={card.isFoil ? <FoilOverlays /> : null}
              />
            ) : (
              <span className="text-xs text-muted-foreground">
                No preview available
              </span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 w-full">
            {card.typeLine && (
              <span className="text-xs text-muted-foreground truncate">
                {card.typeLine}
              </span>
            )}
            {card.manaCost && <ManaCost cost={card.manaCost} className="shrink-0" />}
          </div>
        </div>
      ) : null}
    </BottomSheet>
  );
}

function DetailCardBody({ card }: { card: PreviewCard }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-col min-w-0">
        {card.typeLine && (
          <span className="text-sm text-muted-foreground truncate">
            {card.typeLine}
          </span>
        )}
        {(card.setCode || card.collectorNumber) && (
          <span className="font-mono text-[11px] text-muted-foreground">
            {card.setCode?.toUpperCase() ?? ""}
            {card.collectorNumber ? ` #${card.collectorNumber}` : ""}
          </span>
        )}
      </div>
      {card.manaCost && (
        <ManaCost cost={card.manaCost} className="shrink-0" />
      )}
    </div>
  );
}

function DeckDetailSheet() {
  const actions = useDeckPreview();
  const pathname = usePathname();
  const previewState = usePreviewState();
  const card = previewState?.detailCard ?? null;
  const open = card !== null;
  const hasSiblings = (previewState?.orderedCount ?? 0) >= 2;

  const cycle = useCallback(
    (delta: 1 | -1) => {
      if (!actions || !card) return;
      const list = actions.getOrderedCards();
      if (list.length < 2) return;
      let idx = list.indexOf(card);
      if (idx === -1) {
        idx = list.findIndex(
          (c) =>
            c.name === card.name &&
            (c.setCode ?? null) === (card.setCode ?? null) &&
            (c.collectorNumber ?? null) === (card.collectorNumber ?? null),
        );
      }
      if (idx === -1) return;
      const nextIdx = (idx + delta + list.length) % list.length;
      const next = list[nextIdx];
      if (!next) return;
      actions.setDetailCard(next);
    },
    [actions, card],
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (isTextInputTarget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      cycle(e.key === "ArrowRight" ? 1 : -1);
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, [open, cycle]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) actions?.setDetailCard(null);
      }}
    >
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-8">
            {card?.name ?? "Card details"}
          </DialogTitle>
        </DialogHeader>
        {card && (
          <div className="flex flex-col gap-4">
            <div className="relative w-full flex items-center justify-center gap-2">
              {hasSiblings && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Previous card"
                  onClick={() => cycle(-1)}
                  className="shrink-0 min-h-11 min-w-11"
                >
                  <ChevronLeft className="size-5" aria-hidden />
                </Button>
              )}
              <div
                className={cn(
                  "relative aspect-[63/88] w-full max-w-[320px] rounded-xl border bg-muted/30 overflow-hidden flex items-center justify-center min-w-0 flex-1",
                  card.isFoil && "card",
                )}
              >
                {card.imageUri ? (
                  <FlippableCardImage
                    frontUrl={card.imageUri}
                    backUrl={card.backImageUri}
                    alt={card.name}
                    fill
                    sizes="320px"
                    className="object-contain"
                    containerClassName="absolute inset-0"
                    frontOverlay={card.isFoil ? <FoilOverlays /> : null}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    No preview available
                  </span>
                )}
              </div>
              {hasSiblings && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Next card"
                  onClick={() => cycle(1)}
                  className="shrink-0 min-h-11 min-w-11"
                >
                  <ChevronRight className="size-5" aria-hidden />
                </Button>
              )}
            </div>
            <DetailCardBody card={card} />
            {card.oracleText && (
              <div className="border-t border-border pt-3">
                <OracleText text={card.oracleText} size="sm" />
              </div>
            )}
            <Link
              href={
                pathname
                  ? `/card/${toNameSlug(card.name)}?from=${encodeURIComponent(pathname)}`
                  : `/card/${toNameSlug(card.name)}`
              }
              className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 self-start"
            >
              View full page →
            </Link>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
