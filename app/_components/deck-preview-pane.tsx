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
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ManaCost } from "@/app/_components/mana-cost";
import { OracleText } from "@/app/_components/oracle-text";
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

export interface PreviewCard {
  name: string;
  imageUri: string | null;
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

interface PreviewContextValue {
  preview: (card: PreviewCard) => void;
  clear: () => void;
  openSheet: (card: PreviewCard) => void;
  openDetail: (card: PreviewCard, returnFocus?: HTMLElement | null) => void;
  current: PreviewCard | null;
  sheetCard: PreviewCard | null;
  setSheetCard: (card: PreviewCard | null) => void;
  detailCard: PreviewCard | null;
  setDetailCard: (card: PreviewCard | null) => void;
  setOrderedCards: (cards: PreviewCard[]) => void;
  getOrderedCards: () => PreviewCard[];
}

const PreviewContext = createContext<PreviewContextValue | null>(null);

export function useDeckPreview() {
  return useContext(PreviewContext);
}

export function DeckPreviewProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<PreviewCard | null>(null);
  const [sheetCard, setSheetCard] = useState<PreviewCard | null>(null);
  const [detailCard, setDetailCard] = useState<PreviewCard | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const orderedCardsRef = useRef<PreviewCard[]>([]);

  const setOrderedCards = useCallback((cards: PreviewCard[]) => {
    orderedCardsRef.current = cards;
  }, []);

  const getOrderedCards = useCallback(() => orderedCardsRef.current, []);

  const preview = useCallback((card: PreviewCard) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setCurrent(card), 150);
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

  const value = useMemo<PreviewContextValue>(
    () => ({
      preview,
      clear,
      openSheet,
      openDetail,
      current,
      sheetCard,
      setSheetCard,
      detailCard,
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
      current,
      sheetCard,
      detailCard,
      setOrderedCards,
      getOrderedCards,
    ],
  );

  useEffect(() => {
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (detailCard !== null) return;
      if (sheetCard !== null) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const target = e.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
          return;
        }
      }
      const rows = Array.from(
        document.querySelectorAll<HTMLElement>("[data-deck-row]"),
      );
      if (rows.length === 0) return;
      const active =
        typeof document !== "undefined" ? document.activeElement : null;
      let currentIdx = -1;
      if (active instanceof HTMLElement) {
        const row = active.matches("[data-deck-row]")
          ? active
          : active.closest<HTMLElement>("[data-deck-row]");
        if (row) currentIdx = rows.indexOf(row);
      }
      if (currentIdx === -1) {
        const hovered = document.querySelector<HTMLElement>(
          "[data-deck-row]:hover",
        );
        if (hovered) currentIdx = rows.indexOf(hovered);
      }
      const delta = e.key === "ArrowRight" ? 1 : -1;
      const nextIdx =
        currentIdx === -1
          ? delta === 1
            ? 0
            : rows.length - 1
          : (currentIdx + delta + rows.length) % rows.length;
      const next = rows[nextIdx];
      if (!next) return;
      e.preventDefault();
      next.focus();
      next.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [detailCard, sheetCard]);

  return (
    <PreviewContext.Provider value={value}>
      {children}
      <DeckPreviewSheet />
      <DeckDetailSheet />
    </PreviewContext.Provider>
  );
}

export function DeckPreviewPane() {
  const ctx = useContext(PreviewContext);
  const card = ctx?.current ?? null;
  return (
    <aside
      aria-label="Card preview"
      className="sticky top-20 hidden lg:flex flex-col gap-3 w-[280px] shrink-0"
    >
      <Eyebrow>Preview</Eyebrow>
      <div
        className={cn(
          "aspect-[63/88] w-full rounded-xl border bg-muted/30 overflow-hidden flex items-center justify-center",
          card?.isFoil && "card",
        )}
      >
        {card?.imageUri ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={card.imageUri}
              alt={card.name}
              className="w-full h-full object-contain"
              loading="lazy"
            />
            {card.isFoil && <FoilOverlays />}
          </>
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
  const ctx = useContext(PreviewContext);
  const card = ctx?.sheetCard ?? null;
  const open = card !== null;
  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) ctx?.setSheetCard(null);
      }}
      title={card?.name ?? "Card preview"}
    >
      {card ? (
        <div className="flex flex-col items-center gap-3">
          <div
            className={cn(
              "aspect-[63/88] w-full max-w-[280px] rounded-xl border bg-muted/30 overflow-hidden flex items-center justify-center",
              card.isFoil && "card",
            )}
          >
            {card.imageUri ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={card.imageUri}
                  alt={card.name}
                  className="w-full h-full object-contain"
                />
                {card.isFoil && <FoilOverlays />}
              </>
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

function DeckDetailSheet() {
  const ctx = useContext(PreviewContext);
  const card = ctx?.detailCard ?? null;
  const open = card !== null;
  const hasSiblings = (ctx?.getOrderedCards().length ?? 0) >= 2;

  const cycle = useCallback(
    (delta: 1 | -1) => {
      if (!ctx || !card) return;
      const list = ctx.getOrderedCards();
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
      ctx.setDetailCard(next);
    },
    [ctx, card],
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const target = e.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          target.isContentEditable
        ) {
          return;
        }
      }
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
        if (!next) ctx?.setDetailCard(null);
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
                  "aspect-[63/88] w-full max-w-[320px] rounded-xl border bg-muted/30 overflow-hidden flex items-center justify-center min-w-0 flex-1",
                  card.isFoil && "card",
                )}
              >
                {card.imageUri ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={card.imageUri}
                      alt={card.name}
                      className="w-full h-full object-contain"
                    />
                    {card.isFoil && <FoilOverlays />}
                  </>
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
            {card.oracleText && (
              <div className="border-t border-border pt-3">
                <OracleText text={card.oracleText} size="sm" />
              </div>
            )}
            <Link
              href={`/card/${toNameSlug(card.name)}`}
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
