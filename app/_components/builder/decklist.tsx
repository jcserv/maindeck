"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useState,
  useSyncExternalStore,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  useDeckPreview,
  type PreviewCard,
} from "@/app/_components/deck/deck-preview-pane";
import { Zone } from "@/lib/generated/prisma/enums";
import {
  readCollapsed,
  subscribeCollapsed,
  writeCollapsed,
} from "./decklist-collapsed";
import {
  DEFAULT_DECK_VIEW_OPTIONS,
  useDeckViewOptions,
  type DeckViewOptionKey,
  type DeckViewOptions,
} from "./decklist-view-options";
import {
  groupCards,
  parseSortDir,
  parseSortKey,
  sortCards,
  type GroupBy,
} from "@/lib/deck/group-sort";
import {
  resolveCardBackImage,
  resolveCardImage,
  type Deck,
  type DeckCard,
  type ZoneAction,
} from "@/lib/deck/zone-view";
import {
  computeOwnershipState,
  type OwnershipResolution,
  type ViewerHolding,
} from "@/lib/inventory/state";
import {
  BalancedColumns,
  type ColumnItem,
} from "./balanced-columns";
import {
  StaticCategorySection,
  UNCATEGORIZED_KEY,
  type ViewMode,
} from "./decklist-section";

/**
 * Relative height estimate for column balancing: one unit per card plus one for
 * the header. Collapsed sections are header-only.
 */
export function sectionWeight(cardCount: number, isCollapsed: boolean): number {
  return isCollapsed ? 1 : cardCount + 1;
}

const GROUP_VALUES: readonly GroupBy[] = [
  "category",
  "type",
  "color",
  "mv",
  "set",
  "rarity",
  "ownership",
];

function parseGroup(raw: string | null): GroupBy {
  return GROUP_VALUES.includes(raw as GroupBy) ? (raw as GroupBy) : "category";
}

function parseView(raw: string | null): ViewMode {
  return raw === "stack" ? "stack" : "text";
}

export interface DecklistProps {
  deck: Deck;
  cards: DeckCard[];
  dispatch: (action: ZoneAction) => void;
  isOwner: boolean;
  viewerId?: string | undefined;
  viewerHoldings?: ViewerHolding[] | undefined;
}

export function resolveOwnership(
  dc: DeckCard,
  holdings: readonly ViewerHolding[],
): OwnershipResolution {
  return computeOwnershipState(
    {
      cardId: dc.card.id,
      printingId: dc.printingId ?? null,
      isFoil: dc.isFoil,
    },
    holdings,
  );
}

const EMPTY_COLLAPSED_MAP: Record<string, boolean> = {};

export function useDecklistState(
  deck: Deck,
  cards: DeckCard[],
  viewerHoldings?: ViewerHolding[] | undefined,
) {
  const searchParams = useSearchParams();
  const group = parseGroup(searchParams.get("group"));
  const view = parseView(searchParams.get("view"));
  const sortKey = parseSortKey(searchParams.get("sort"));
  const sortDir = parseSortDir(searchParams.get("dir"));

  const baseCategoryNames = useMemo(
    () =>
      [...deck.categories]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((c) => c.name),
    [deck.categories],
  );

  const [subcategoryNames, setOptimisticOrder] = useOptimistic(
    baseCategoryNames,
    (_state, next: string[]) => next,
  );

  const [renames, applyRename] = useOptimistic<
    Record<string, string>,
    { from: string; to: string }
  >({}, (state, { from, to }) => ({ ...state, [from]: to }));

  const displaySubcategoryNames = useMemo(
    () => subcategoryNames.map((n) => renames[n] ?? n),
    [subcategoryNames, renames],
  );

  const displayCards = useMemo(
    () =>
      cards.map((c) =>
        c.category && renames[c.category]
          ? { ...c, category: renames[c.category]! }
          : c,
      ),
    [cards, renames],
  );

  const [justMoved, setJustMoved] = useState<string | null>(null);
  useEffect(() => {
    if (!justMoved) return;
    const t = window.setTimeout(() => setJustMoved(null), 700);
    return () => window.clearTimeout(t);
  }, [justMoved]);

  const collapsedStorageKey = `decklist:collapsed:${deck.id}`;
  const subscribe = useCallback(
    (cb: () => void) => subscribeCollapsed(collapsedStorageKey, cb),
    [collapsedStorageKey],
  );
  const getSnapshot = useCallback(
    () => readCollapsed(collapsedStorageKey),
    [collapsedStorageKey],
  );
  const getServerSnapshot = useCallback(() => EMPTY_COLLAPSED_MAP, []);
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const handleToggleCollapse = useCallback(
    (id: string) => {
      const current = readCollapsed(collapsedStorageKey);
      const next = { ...current };
      if (current[id]) delete next[id];
      else next[id] = true;
      writeCollapsed(collapsedStorageKey, next);
    },
    [collapsedStorageKey],
  );

  function handleReorder(movedName: string, nextOrder: string[]) {
    setOptimisticOrder(nextOrder);
    setJustMoved(movedName);
  }

  function handleRename(fromDb: string, toDisplay: string) {
    applyRename({ from: fromDb, to: toDisplay });
  }

  const commanderCards = displayCards.filter((dc) => dc.zone === "COMMANDER");
  const mainboardCards = displayCards.filter((dc) => dc.zone === "MAINBOARD");
  const sideboardCards = sortCards(
    displayCards.filter((dc) => dc.zone === "SIDEBOARD"),
    sortKey,
    sortDir,
  );
  const consideringCards = sortCards(
    displayCards.filter((dc) => dc.zone === "CONSIDERING"),
    sortKey,
    sortDir,
  );

  const ownershipOf = viewerHoldings
    ? (dc: DeckCard) => resolveOwnership(dc, viewerHoldings).state
    : undefined;

  const sections = groupCards(
    mainboardCards,
    group,
    displaySubcategoryNames,
    ownershipOf,
  ).map((section) => ({
    ...section,
    cards: sortCards(section.cards, sortKey, sortDir),
  }));

  const hasAnyCards = displayCards.length > 0;
  const hasMainboardSections =
    (group === "category" && displaySubcategoryNames.length > 0) ||
    mainboardCards.length > 0;

  const sortableSections =
    group === "category"
      ? sections.filter(
          (s) => s.key !== UNCATEGORIZED_KEY && displaySubcategoryNames.includes(s.key),
        )
      : [];
  const otherSections =
    group === "category"
      ? sections.filter(
          (s) => s.key === UNCATEGORIZED_KEY || !displaySubcategoryNames.includes(s.key),
        )
      : sections;

  return {
    group,
    view,
    sortKey,
    sortDir,
    subcategoryNames,
    displaySubcategoryNames,
    displayCards,
    justMoved,
    collapsed,
    commanderCards,
    sideboardCards,
    consideringCards,
    sections,
    hasAnyCards,
    hasMainboardSections,
    sortableSections,
    otherSections,
    handleToggleCollapse,
    handleReorder,
    handleRename,
  };
}

export function useDecklistPreviewSync(
  deck: Deck,
  commanderCards: DeckCard[],
  sortableSections: Array<{ label: string; key: string; cards: DeckCard[] }>,
  otherSections: Array<{ label: string; key: string; cards: DeckCard[] }>,
  sortKey: ReturnType<typeof parseSortKey>,
  sortDir: ReturnType<typeof parseSortDir>,
  sideboardCards: DeckCard[] = [],
  consideringCards: DeckCard[] = [],
) {
  const preview = useDeckPreview();
  const setOrderedCards = preview?.setOrderedCards;

  // Paging walks the whole deck: commander -> mainboard -> sideboard -> considering.
  // Sideboard/considering rows are clickable too, so they must be in the ordered list.
  const orderedPreviewFlat: DeckCard[] = [
    ...sortCards(commanderCards, sortKey, sortDir),
    ...sortableSections.flatMap((s) => s.cards),
    ...otherSections.flatMap((s) => s.cards),
    ...sideboardCards,
    ...consideringCards,
  ];
  const orderedPreviewCards: PreviewCard[] = [];
  const seenPreviewKeys = new Set<string>();
  for (const dc of orderedPreviewFlat) {
    const setCode = dc.printing?.setCode ?? null;
    const collectorNumber = dc.printing?.collectorNumber ?? null;
    const key = `${dc.card.name}|${setCode ?? ""}|${collectorNumber ?? ""}|${dc.isFoil ? "f" : ""}`;
    if (seenPreviewKeys.has(key)) continue;
    seenPreviewKeys.add(key);
    orderedPreviewCards.push({
      name: dc.card.name,
      imageUri: resolveCardImage(dc),
      backImageUri: resolveCardBackImage(dc),
      manaCost: dc.card.manaCost ?? null,
      typeLine: dc.card.typeLine ?? null,
      oracleText: dc.card.oracleText ?? null,
      setCode,
      collectorNumber,
      isFoil: dc.isFoil,
    });
  }

  useEffect(() => {
    setOrderedCards?.(orderedPreviewCards);
  });
}

export {
  DEFAULT_DECK_VIEW_OPTIONS,
  useDeckViewOptions,
  type DeckViewOptionKey,
  type DeckViewOptions,
};

export {
  CategorySectionView,
  UNCATEGORIZED_KEY,
  type CategorySectionViewProps,
} from "./decklist-section";

export function Decklist({
  deck,
  cards,
  dispatch,
  isOwner,
  viewerId,
  viewerHoldings,
}: DecklistProps) {
  const { options: viewOptions } = useDeckViewOptions(deck.id);
  const {
    group,
    view,
    sortKey,
    sortDir,
    subcategoryNames,
    displaySubcategoryNames,
    displayCards: _displayCards,
    justMoved,
    collapsed,
    commanderCards,
    sideboardCards,
    consideringCards,
    hasAnyCards,
    hasMainboardSections,
    sortableSections,
    otherSections,
    handleToggleCollapse,
    handleReorder: _handleReorder,
    handleRename,
  } = useDecklistState(deck, cards, viewerHoldings);

  useDecklistPreviewSync(
    deck,
    commanderCards,
    sortableSections,
    otherSections,
    sortKey,
    sortDir,
    sideboardCards,
    consideringCards,
  );

  const items: ColumnItem[] = [];

  if (commanderCards.length > 0 || deck.format === "COMMANDER") {
    items.push({
      key: "zone:COMMANDER",
      weight: sectionWeight(commanderCards.length, !!collapsed["zone:COMMANDER"]),
      node: (
        <StaticCategorySection
          label="Commander"
          cards={sortCards(commanderCards, sortKey, sortDir)}
          deckId={deck.id}
          format={deck.format}
          zone={Zone.COMMANDER}
          droppableId="zone:COMMANDER"
          subcategories={displaySubcategoryNames}
          isOwner={isOwner}
          categoryForAdd={null}
          kind="commander"
          dispatch={dispatch}
          isCollapsed={!!collapsed["zone:COMMANDER"]}
          onToggleCollapse={handleToggleCollapse}
          view={view}
          viewerId={viewerId}
          viewerHoldings={viewerHoldings}
          viewOptions={viewOptions}
        />
      ),
    });
  }

  if (hasMainboardSections) {
    for (const section of sortableSections) {
      const index = displaySubcategoryNames.indexOf(section.label);
      const dbName = subcategoryNames[index]!;
      const droppableId = `zone:MAINBOARD:cat:${section.label}`;
      items.push({
        key: dbName,
        weight: sectionWeight(section.cards.length, !!collapsed[droppableId]),
        node: (
          <StaticCategorySection
            label={section.label}
            dbName={dbName}
            cards={section.cards}
            deckId={deck.id}
            format={deck.format}
            zone={Zone.MAINBOARD}
            droppableId={droppableId}
            subcategories={displaySubcategoryNames}
            isOwner={isOwner}
            categoryForAdd={section.label}
            kind="category"
            isJustMoved={justMoved === dbName}
            dispatch={dispatch}
            onRename={handleRename}
            isCollapsed={!!collapsed[droppableId]}
            onToggleCollapse={handleToggleCollapse}
            view={view}
            viewerId={viewerId}
            viewerHoldings={viewerHoldings}
            viewOptions={viewOptions}
          />
        ),
      });
    }

    for (const section of otherSections) {
      const isUncategorized = section.key === UNCATEGORIZED_KEY;
      const dropCategory =
        group === "category" && !isUncategorized ? section.label : null;
      const droppableId =
        group === "category"
          ? `zone:MAINBOARD:cat:${isUncategorized ? "__" : section.label}`
          : `zone:MAINBOARD:${section.key}`;
      items.push({
        key: section.key,
        weight: sectionWeight(section.cards.length, !!collapsed[droppableId]),
        node: (
          <StaticCategorySection
            label={section.label}
            cards={section.cards}
            deckId={deck.id}
            format={deck.format}
            zone={Zone.MAINBOARD}
            droppableId={droppableId}
            subcategories={displaySubcategoryNames}
            isOwner={isOwner}
            categoryForAdd={dropCategory}
            kind="uncategorized"
            dispatch={dispatch}
            isCollapsed={!!collapsed[droppableId]}
            onToggleCollapse={handleToggleCollapse}
            view={view}
            viewerId={viewerId}
            viewerHoldings={viewerHoldings}
            viewOptions={viewOptions}
          />
        ),
      });
    }
  }

  return (
    <>
      {!hasAnyCards && (
        <p className="text-muted-foreground text-sm mb-6">
          {isOwner
            ? "No cards yet — press ⌘K or use the action bar to add one."
            : "This deck is empty."}
        </p>
      )}
      {items.length > 0 &&
        (view === "stack" ? (
          <div className="min-w-0 flex flex-wrap gap-6 items-start">
            {items.map((item) => (
              <div key={item.key}>{item.node}</div>
            ))}
          </div>
        ) : (
          <BalancedColumns items={items} className="min-w-0" />
        ))}
    </>
  );
}
