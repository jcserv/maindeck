"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardRow } from "@/app/_components/builder/card-row";
import { CardStack } from "@/app/_components/builder/card-stack";
import {
  useDeckPreview,
  type PreviewCard,
} from "@/app/_components/deck/deck-preview-pane";
import { useHeaderSearch } from "@/app/_components/header-search/header-search-context";
import { Format, Zone } from "@/lib/generated/prisma/enums";
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
import { RenameCategoryInline } from "./rename-category-inline";
import {
  groupCards,
  parseSortDir,
  parseSortKey,
  sortCards,
  type GroupBy,
} from "@/lib/deck/group-sort";
import { commanderTemplateTarget } from "@/lib/deck/category-autogen";
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
import { cn } from "@/lib/utils";

const GROUP_VALUES: readonly GroupBy[] = [
  "category",
  "type",
  "color",
  "mv",
  "set",
  "rarity",
];

function parseGroup(raw: string | null): GroupBy {
  return GROUP_VALUES.includes(raw as GroupBy) ? (raw as GroupBy) : "category";
}

type ViewMode = "text" | "stack";

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

export const UNCATEGORIZED_KEY = "__uncategorized__";

type CategoryKind = "commander" | "uncategorized" | "category";

const EMPTY_COLLAPSED_MAP: Record<string, boolean> = {};

export interface CategorySectionViewProps {
  label: string;
  dbName?: string;
  cards: DeckCard[];
  deckId: string;
  format: Format;
  zone: Zone;
  subcategories: string[];
  isOwner: boolean;
  categoryForAdd: string | null;
  kind: CategoryKind;
  setNodeRef: (node: HTMLElement | null) => void;
  isOver: boolean;
  isJustMoved?: boolean;
  actions?: ReactNode;
  dispatch: (action: ZoneAction) => void;
  onRename?: (fromDb: string, toDisplay: string) => void;
  droppableId: string;
  isCollapsed: boolean;
  onToggleCollapse: (id: string) => void;
  view: ViewMode;
  viewerId?: string | undefined;
  viewerHoldings?: ViewerHolding[] | undefined;
  viewOptions?: DeckViewOptions | undefined;
  /** Overrides card list rendering — used by the dnd variant to inject SortableContext + sortable rows */
  renderCards?: (cards: DeckCard[], bodyId: string) => ReactNode;
}

function renderCategoryCards(args: {
  cards: DeckCard[];
  bodyId: string;
  view: ViewMode;
  deckId: string;
  format: Format;
  isOwner: boolean;
  subcategories: string[];
  dispatch: CategorySectionViewProps["dispatch"];
  renderCards?: CategorySectionViewProps["renderCards"];
  viewerId?: string | undefined;
  viewerHoldings?: ViewerHolding[] | undefined;
  viewOptions?: DeckViewOptions | undefined;
}): ReactNode {
  if (args.renderCards) return args.renderCards(args.cards, args.bodyId);
  if (args.view === "stack") {
    return (
      <CardStack
        id={args.bodyId}
        cards={args.cards}
        deckId={args.deckId}
        format={args.format}
        isOwner={args.isOwner}
        dispatch={args.dispatch}
      />
    );
  }
  return (
    <ul id={args.bodyId} className="flex flex-col gap-0.5">
      {args.cards.map((dc) => {
        const resolved = args.viewerHoldings
          ? resolveOwnership(dc, args.viewerHoldings)
          : { state: "NOT_OWNED" as const };
        return (
          <CardRow
            key={dc.id}
            dc={dc}
            deckId={args.deckId}
            format={args.format}
            subcategories={args.subcategories}
            isOwner={args.isOwner}
            dispatch={args.dispatch}
            viewerId={args.viewerId}
            ownership={resolved}
            viewOptions={args.viewOptions ?? DEFAULT_DECK_VIEW_OPTIONS}
          />
        );
      })}
    </ul>
  );
}

interface CategoryHeaderProps {
  label: string;
  total: number;
  /** Command Zone template target for this category, or null when none applies. */
  target: number | null;
  bodyId: string;
  isCollapsed: boolean;
  onToggleCollapse: (id: string) => void;
  droppableId: string;
  editing: boolean;
  setEditing: (v: boolean) => void;
  canManage: boolean;
  isOwner: boolean;
  dbName: string | undefined;
  deckId: string;
  zone: Zone;
  categoryForAdd: string | null;
  onRename: CategorySectionViewProps["onRename"];
  actions: ReactNode;
}

function CategoryHeader({
  label,
  total,
  target,
  bodyId,
  isCollapsed,
  onToggleCollapse,
  droppableId,
  editing,
  setEditing,
  canManage,
  isOwner,
  dbName,
  deckId,
  zone,
  categoryForAdd,
  onRename,
  actions,
}: CategoryHeaderProps) {
  const { focus } = useHeaderSearch();
  return (
    <div className="flex items-center gap-2 mb-1.5 break-after-avoid">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => onToggleCollapse(droppableId)}
        aria-expanded={!isCollapsed}
        aria-controls={bodyId}
        aria-label={isCollapsed ? `Expand ${label}` : `Collapse ${label}`}
        className="h-7 w-7 shrink-0 text-muted-foreground"
      >
        {isCollapsed ? (
          <ChevronRight className="size-3.5" aria-hidden />
        ) : (
          <ChevronDown className="size-3.5" aria-hidden />
        )}
      </Button>
      {editing && canManage && dbName && onRename ? (
        <RenameCategoryInline
          deckId={deckId}
          dbName={dbName}
          initialName={label}
          onRename={onRename}
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <h2
          className={cn(
            "text-xs font-semibold text-muted-foreground uppercase tracking-wide shrink-0 select-none",
            canManage && "cursor-text",
          )}
          onDoubleClick={canManage ? () => setEditing(true) : undefined}
          title={canManage ? "Double-click to rename" : undefined}
        >
          {label}{" "}
          {target !== null ? (
            <span
              className={cn(
                "tabular-nums",
                total >= target && "text-emerald-600 dark:text-emerald-400",
              )}
              title={`${total} of ${target} (Command Zone template)`}
            >
              ({total}/{target})
            </span>
          ) : (
            <span className="tabular-nums">({total})</span>
          )}
        </h2>
      )}
      {!editing && isOwner && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => focus({ zone, category: categoryForAdd })}
          className="h-7 px-2 text-xs text-muted-foreground"
          aria-label={`Add card to ${label}`}
        >
          <Plus className="size-3.5" aria-hidden />
          Add
        </Button>
      )}
      {!editing && canManage && actions}
    </div>
  );
}

export function CategorySectionView({
  label,
  dbName,
  cards,
  deckId,
  format,
  zone,
  subcategories,
  isOwner,
  categoryForAdd,
  kind,
  setNodeRef,
  isOver,
  isJustMoved,
  actions,
  dispatch,
  onRename,
  droppableId,
  isCollapsed,
  onToggleCollapse,
  view,
  viewerId,
  viewerHoldings,
  viewOptions,
  renderCards,
}: CategorySectionViewProps) {
  const [editing, setEditing] = useState(false);
  const total = cards.reduce((sum, dc) => sum + dc.quantity, 0);
  const canManage = isOwner && kind === "category" && !!dbName && !!onRename;
  const bodyId = `section-body-${droppableId}`;
  // Command Zone template targets apply only to mainboard categories in Commander.
  const target =
    kind === "category" && format === Format.COMMANDER
      ? commanderTemplateTarget(label)
      : null;
  const count = target !== null ? `${total}/${target}` : `${total}`;

  const cardList = renderCategoryCards({
    cards,
    bodyId,
    view,
    deckId,
    format,
    isOwner,
    subcategories,
    dispatch,
    renderCards,
    viewerId,
    viewerHoldings,
    viewOptions,
  });

  return (
    <section
      aria-label={`${label} (${count})`}
      ref={setNodeRef}
      className={cn(
        "rounded-md -mx-2 px-2 pb-2 transition-[background-color,box-shadow] duration-500 ease-out break-inside-avoid",
        view === "text" ? "mb-6" : "min-w-[210px]",
        isOver && "bg-accent/30 ring-1 ring-accent",
        isJustMoved && !isOver && "bg-accent/10 ring-2 ring-accent/60",
      )}
    >
      <CategoryHeader
        label={label}
        total={total}
        target={target}
        bodyId={bodyId}
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
        droppableId={droppableId}
        editing={editing}
        setEditing={setEditing}
        canManage={canManage}
        isOwner={isOwner}
        dbName={dbName}
        deckId={deckId}
        zone={zone}
        categoryForAdd={categoryForAdd}
        onRename={onRename}
        actions={actions}
      />
      {!isCollapsed &&
        (cards.length === 0 ? (
          <p id={bodyId} className="text-xs text-muted-foreground italic min-h-6">
            {isOver ? "Drop to move here." : "No cards yet."}
          </p>
        ) : (
          cardList
        ))}
    </section>
  );
}

function StaticCategorySection(props: Omit<CategorySectionViewProps, "setNodeRef" | "isOver">) {
  return (
    <CategorySectionView
      {...props}
      setNodeRef={() => undefined}
      isOver={false}
    />
  );
}


export function useDecklistState(deck: Deck, cards: DeckCard[]) {
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

  const sections = groupCards(mainboardCards, group, displaySubcategoryNames).map(
    (section) => ({
      ...section,
      cards: sortCards(section.cards, sortKey, sortDir),
    }),
  );

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
) {
  const preview = useDeckPreview();
  const setOrderedCards = preview?.setOrderedCards;

  const orderedPreviewFlat: DeckCard[] = [
    ...sortCards(commanderCards, sortKey, sortDir),
    ...sortableSections.flatMap((s) => s.cards),
    ...otherSections.flatMap((s) => s.cards),
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
    hasAnyCards,
    hasMainboardSections,
    sortableSections,
    otherSections,
    handleToggleCollapse,
    handleReorder: _handleReorder,
    handleRename,
  } = useDecklistState(deck, cards);

  useDecklistPreviewSync(deck, commanderCards, sortableSections, otherSections, sortKey, sortDir);

  return (
    <div
      className={cn(
        "min-w-0",
        view === "stack"
          ? "flex flex-wrap gap-6 items-start"
          : "columns-1 md:columns-2 xl:columns-3 gap-x-6",
      )}
    >
      {!hasAnyCards && (
        <p className="text-muted-foreground text-sm break-inside-avoid mb-6">
          {isOwner
            ? "No cards yet — press ⌘K or use the action bar to add one."
            : "This deck is empty."}
        </p>
      )}

      {(commanderCards.length > 0 || deck.format === "COMMANDER") && (
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
      )}

      {hasMainboardSections &&
        sortableSections.map((section) => {
          const index = displaySubcategoryNames.indexOf(section.label);
          const dbName = subcategoryNames[index]!;
          const droppableId = `zone:MAINBOARD:cat:${section.label}`;
          return (
            <StaticCategorySection
              key={dbName}
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
          );
        })}

      {hasMainboardSections &&
        otherSections.map((section) => {
          const isUncategorized = section.key === UNCATEGORIZED_KEY;
          const dropCategory =
            group === "category" && !isUncategorized ? section.label : null;
          const droppableId =
            group === "category"
              ? `zone:MAINBOARD:cat:${isUncategorized ? "__" : section.label}`
              : `zone:MAINBOARD:${section.key}`;
          return (
            <StaticCategorySection
              key={section.key}
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
          );
        })}
    </div>
  );
}
