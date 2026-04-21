"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Search, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import type { ClientPrinting } from "@/lib/deck/printing-fetch-action";
import {
  buildSetSuggestions,
  filterPrintings,
  isExactSingleSetMatch,
  type SetOption,
} from "@/lib/deck/printing-filter";

interface PrintingCarouselProps {
  printings: ClientPrinting[];
  selectedId?: number | null;
  isFoil?: boolean;
  onSelect?: (printingId: number, isFoil: boolean) => void;
}

const CARD_WIDTH = 336;
const CARD_HEIGHT = 468;

const OPTION_ID_PREFIX = "printing-set-option-";

export function PrintingCarousel({
  printings,
  selectedId = null,
  isFoil = false,
  onSelect,
}: PrintingCarouselProps) {
  const [query, setQuery] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSetIndex, setActiveSetIndex] = useState(0);

  const filtered = useMemo(
    () => filterPrintings(printings, query),
    [printings, query],
  );

  const setSuggestions = useMemo<SetOption[]>(
    () => buildSetSuggestions(printings, query),
    [printings, query],
  );

  const showSuggestions =
    suggestionsOpen &&
    setSuggestions.length > 0 &&
    !isExactSingleSetMatch(setSuggestions, query);

  // Reset highlight to first option whenever the suggestion list changes
  useEffect(() => {
    setActiveSetIndex(0);
  }, [setSuggestions]);

  function handleSelectSet(option: SetOption) {
    setQuery(option.setName);
    setSuggestionsOpen(false);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setSuggestionsOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      if (setSuggestions.length === 0) return;
      e.preventDefault();
      if (!suggestionsOpen) setSuggestionsOpen(true);
      setActiveSetIndex((i) => Math.min(i + 1, setSuggestions.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      if (!showSuggestions) return;
      e.preventDefault();
      setActiveSetIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Home") {
      if (!showSuggestions) return;
      e.preventDefault();
      setActiveSetIndex(0);
      return;
    }
    if (e.key === "End") {
      if (!showSuggestions) return;
      e.preventDefault();
      setActiveSetIndex(setSuggestions.length - 1);
      return;
    }
    if (e.key === "Enter") {
      if (!showSuggestions) return;
      const opt = setSuggestions[activeSetIndex];
      if (!opt) return;
      e.preventDefault();
      handleSelectSet(opt);
    }
  }

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!suggestionsOpen) return;
    function handlePointerDown(e: PointerEvent) {
      const node = searchContainerRef.current;
      if (!node) return;
      if (!node.contains(e.target as Node)) setSuggestionsOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [suggestionsOpen]);

  // Scroll the highlighted suggestion into view
  useEffect(() => {
    if (!showSuggestions) return;
    const listbox = listboxRef.current;
    if (!listbox) return;
    const active = listbox.querySelector<HTMLElement>(
      `#${OPTION_ID_PREFIX}${activeSetIndex}`,
    );
    active?.scrollIntoView({ block: "nearest" });
  }, [activeSetIndex, showSuggestions]);

  const [currentIndex, setCurrentIndex] = useState(() => {
    if (selectedId === null) return 0;
    const idx = printings.findIndex((p) => p.id === selectedId);
    return idx !== -1 ? idx : 0;
  });

  // Snap index to selected printing (or first) whenever the filtered list changes
  useEffect(() => {
    if (filtered.length === 0) return;
    const idx =
      selectedId !== null
        ? filtered.findIndex((p) => p.id === selectedId)
        : -1;
    setCurrentIndex(idx !== -1 ? idx : 0);
  }, [filtered, selectedId]);

  // Track local foil toggle independently of committed isFoil
  const [localFoil, setLocalFoil] = useState(isFoil);

  // Reset local foil when external isFoil changes (e.g. re-open)
  useEffect(() => {
    setLocalFoil(isFoil);
  }, [isFoil]);

  const searchInput = (
    <div ref={searchContainerRef} className="relative w-full">
      <InputGroup>
        <InputGroupAddon>
          <Search className="size-4" aria-hidden />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Filter by set name, code, or #"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSuggestionsOpen(true);
          }}
          onFocus={() => setSuggestionsOpen(true)}
          onKeyDown={handleSearchKeyDown}
          role="combobox"
          aria-expanded={showSuggestions}
          aria-controls="printing-set-suggestions"
          aria-autocomplete="list"
          aria-activedescendant={
            showSuggestions
              ? `${OPTION_ID_PREFIX}${activeSetIndex}`
              : undefined
          }
          aria-label="Filter printings"
        />
        {query && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              aria-label="Clear filter"
              onClick={() => {
                setQuery("");
                setSuggestionsOpen(false);
              }}
            >
              <X aria-hidden />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>

      {showSuggestions && (
        <ul
          ref={listboxRef}
          id="printing-set-suggestions"
          role="listbox"
          aria-label="Matching sets"
          className="absolute left-0 right-0 top-full mt-1 z-50 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-md"
        >
          {setSuggestions.map((option, index) => {
            const active = index === activeSetIndex;
            return (
              <li
                key={option.setCode}
                id={`${OPTION_ID_PREFIX}${index}`}
                role="option"
                aria-selected={active}
              >
                <button
                  type="button"
                  onMouseDown={(e) => {
                    // Prevent the input from losing focus before click fires
                    e.preventDefault();
                    handleSelectSet(option);
                  }}
                  onMouseEnter={() => setActiveSetIndex(index)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-3 py-2 text-sm text-left",
                    active ? "bg-muted" : "hover:bg-muted/60",
                  )}
                >
                  <span className="truncate">{option.setName}</span>
                  <span className="shrink-0 flex items-center gap-2 text-xs text-muted-foreground font-mono">
                    <span className="uppercase">{option.setCode}</span>
                    <span className="tabular-nums">×{option.count}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const current = filtered[currentIndex];
  if (!current) {
    return (
      <div className="flex flex-col gap-3">
        {searchInput}
        <p className="text-sm text-muted-foreground text-center py-8">
          {printings.length === 0
            ? "No printings available."
            : "No printings match your filter."}
        </p>
      </div>
    );
  }

  const canFoil = current.finishes.includes("foil");
  const activeFoil = localFoil && canFoil;

  const displayUsd = activeFoil ? (current.priceUsdFoil ?? current.priceUsd) : current.priceUsd;
  const displayEur = activeFoil ? (current.priceEurFoil ?? current.priceEur) : current.priceEur;

  // Printing model has no releasedAt field — omit release year

  function handlePrev() {
    setCurrentIndex((i) => (i <= 0 ? filtered.length - 1 : i - 1));
  }

  function handleNext() {
    setCurrentIndex((i) => (i >= filtered.length - 1 ? 0 : i + 1));
  }

  function handleFoilToggle() {
    if (!canFoil) return;
    setLocalFoil((f) => !f);
  }

  function handleSelectPrinting() {
    if (!current || !onSelect) return;
    onSelect(current.id, activeFoil);
  }

  const isCurrentlySelected =
    current.id === selectedId && activeFoil === isFoil;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Search / filter input */}
      <div className="w-full">{searchInput}</div>

      {/* Card image with prev/next controls */}
      <div className="relative w-full flex items-center justify-center gap-2">
        {/* Prev button */}
        {filtered.length > 1 && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous printing"
            onClick={handlePrev}
            className="shrink-0 min-h-11 min-w-11"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Button>
        )}

        {/* Card image */}
        <div
          className={cn(
            "relative rounded-[17px] overflow-hidden min-w-0 flex-1",
            // The .card class in globals.css applies the hover 3D tilt
            activeFoil && "card",
          )}
          style={{
            maxWidth: CARD_WIDTH,
            aspectRatio: `${CARD_WIDTH} / ${CARD_HEIGHT}`,
          }}
        >
          <Image
            src={current.imageUri}
            alt={`${current.setName} #${current.collectorNumber}`}
            width={CARD_WIDTH}
            height={CARD_HEIGHT}
            className="w-full h-full object-cover"
            priority
          />
          {activeFoil && (
            <>
              <div className="foil-effect" aria-hidden />
              <div className="foil-overlay-1" aria-hidden />
              <div className="foil-overlay-2" aria-hidden />
            </>
          )}
        </div>

        {/* Next button */}
        {filtered.length > 1 && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next printing"
            onClick={handleNext}
            className="shrink-0 min-h-11 min-w-11"
          >
            <ChevronRight className="size-5" aria-hidden />
          </Button>
        )}
      </div>

      {/* Pagination indicator */}
      {filtered.length > 1 && (
        <p className="text-xs text-muted-foreground tabular-nums">
          {currentIndex + 1} / {filtered.length}
          {query && (
            <span className="ml-1">(of {printings.length})</span>
          )}
        </p>
      )}

      {/* Set info */}
      <div className="text-center text-sm">
        <p className="font-medium">{current.setName}</p>
        <p className="text-xs text-muted-foreground">
          #{current.collectorNumber}
          {current.isSerialized && (
            <span className="ml-1 text-amber-600 dark:text-amber-400">Serialized</span>
          )}
        </p>
      </div>

      {/* Foil toggle + prices */}
      <div className="flex items-center gap-3 w-full justify-between px-1">
        <Button
          variant={activeFoil ? "default" : "outline"}
          size="sm"
          disabled={!canFoil}
          onClick={handleFoilToggle}
          aria-pressed={activeFoil}
          className={cn(
            "gap-1.5",
            !canFoil && "cursor-not-allowed opacity-40",
          )}
        >
          <Sparkles className="size-3.5" aria-hidden />
          Foil
        </Button>

        <div className="text-sm text-right">
          {displayUsd != null ? (
            <span className="font-medium">${displayUsd.toFixed(2)}</span>
          ) : (
            <span className="text-muted-foreground text-xs">No USD price</span>
          )}
          {displayEur != null && (
            <span className="text-muted-foreground ml-2 text-xs">
              €{displayEur.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* Select button */}
      {onSelect && (
        <Button
          onClick={handleSelectPrinting}
          className="w-full"
          disabled={isCurrentlySelected}
        >
          {isCurrentlySelected ? "Currently selected" : "Select this printing"}
        </Button>
      )}
    </div>
  );
}
