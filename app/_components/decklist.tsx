"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { useDndContext, useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CardRow } from "@/app/_components/card-row";
import { CardStack } from "@/app/_components/card-stack";
import {
  useDeckPreview,
  type PreviewCard,
} from "@/app/_components/deck-preview-pane";
import { useHeaderSearch } from "@/app/_components/header-search-context";
import { Format, Zone } from "@/lib/generated/prisma/enums";
import {
  deleteCategory,
  renameCategory,
  reorderCategories,
} from "@/lib/deck/category-actions";
import {
  groupCards,
  parseSortDir,
  parseSortKey,
  sortCards,
  type GroupBy,
} from "@/lib/deck/group-sort";
import {
  resolveCardImage,
  type Deck,
  type DeckCard,
  type ZoneAction,
} from "@/lib/deck/zone-view";
import type { CategoryDeleteMode } from "@/lib/validation/deck";
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

interface DecklistProps {
  deck: Deck;
  cards: DeckCard[];
  dispatch: (action: ZoneAction) => void;
  isOwner: boolean;
}

const UNCATEGORIZED_KEY = "__uncategorized__";

type CollapsedMap = Record<string, boolean>;
const EMPTY_COLLAPSED: CollapsedMap = {};
const collapsedSnapshotCache = new Map<string, { raw: string | null; parsed: CollapsedMap }>();
const collapsedListeners = new Map<string, Set<() => void>>();

function readCollapsed(key: string): CollapsedMap {
  if (typeof window === "undefined") return EMPTY_COLLAPSED;
  const raw = window.localStorage.getItem(key);
  const cached = collapsedSnapshotCache.get(key);
  if (cached && cached.raw === raw) return cached.parsed;
  let parsed: CollapsedMap = EMPTY_COLLAPSED;
  if (raw) {
    try {
      const candidate = JSON.parse(raw) as unknown;
      if (candidate && typeof candidate === "object") {
        parsed = candidate as CollapsedMap;
      }
    } catch {
      parsed = EMPTY_COLLAPSED;
    }
  }
  collapsedSnapshotCache.set(key, { raw, parsed });
  return parsed;
}

function writeCollapsed(key: string, next: CollapsedMap) {
  try {
    if (Object.keys(next).length === 0) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(next));
    }
  } catch {
    // ignore quota errors
  }
  collapsedSnapshotCache.set(key, {
    raw: window.localStorage.getItem(key),
    parsed: next,
  });
  collapsedListeners.get(key)?.forEach((cb) => cb());
}

function subscribeCollapsed(key: string, callback: () => void) {
  let set = collapsedListeners.get(key);
  if (!set) {
    set = new Set();
    collapsedListeners.set(key, set);
  }
  set.add(callback);
  function onStorage(e: StorageEvent) {
    if (e.key === key) callback();
  }
  window.addEventListener("storage", onStorage);
  return () => {
    set!.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

type CategoryKind = "commander" | "uncategorized" | "category";

interface CategorySectionViewProps {
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
}

function CategorySectionView({
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
}: CategorySectionViewProps) {
  const { focus } = useHeaderSearch();
  const [editing, setEditing] = useState(false);
  const total = cards.reduce((sum, dc) => sum + dc.quantity, 0);
  const canManage = isOwner && kind === "category" && !!dbName && !!onRename;
  const bodyId = `section-body-${droppableId}`;

  return (
    <section
      aria-label={`${label} (${total})`}
      ref={setNodeRef}
      className={cn(
        "rounded-md -mx-2 px-2 pb-2 transition-[background-color,box-shadow] duration-500 ease-out",
        view === "text" ? "mb-6" : "min-w-[210px]",
        isOver && "bg-accent/30 ring-1 ring-accent",
        isJustMoved && !isOver && "bg-accent/10 ring-2 ring-accent/60",
      )}
    >
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
        {editing && canManage ? (
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
              "text-xs font-semibold text-muted-foreground uppercase tracking-wide flex-1 select-none",
              canManage && "cursor-text",
            )}
            onDoubleClick={canManage ? () => setEditing(true) : undefined}
            title={canManage ? "Double-click to rename" : undefined}
          >
            {label} <span className="tabular-nums">({total})</span>
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
      {!isCollapsed &&
        (cards.length === 0 ? (
          <p id={bodyId} className="text-xs text-muted-foreground italic min-h-6">
            {isOver ? "Drop to move here." : "No cards yet."}
          </p>
        ) : (
          <SortableContext
            items={cards.map((dc) => dc.id)}
            strategy={verticalListSortingStrategy}
          >
            {view === "stack" ? (
              <CardStack
                id={bodyId}
                cards={cards}
                deckId={deckId}
                format={format}
                isOwner={isOwner}
                dispatch={dispatch}
              />
            ) : (
              <ul id={bodyId} className="flex flex-col gap-0.5">
                {cards.map((dc) => (
                  <CardRow
                    key={dc.id}
                    dc={dc}
                    deckId={deckId}
                    format={format}
                    subcategories={subcategories}
                    isOwner={isOwner}
                    dispatch={dispatch}
                  />
                ))}
              </ul>
            )}
          </SortableContext>
        ))}
    </section>
  );
}

interface DroppableCategorySectionProps {
  label: string;
  dbName?: string;
  cards: DeckCard[];
  deckId: string;
  format: Format;
  zone: Zone;
  dropCategory: string | null;
  droppableId: string;
  subcategories: string[];
  isOwner: boolean;
  categoryForAdd: string | null;
  kind: CategoryKind;
  isJustMoved?: boolean;
  actions?: ReactNode;
  dispatch: (action: ZoneAction) => void;
  onRename?: (fromDb: string, toDisplay: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: (id: string) => void;
  view: ViewMode;
}

function DroppableCategorySection(props: DroppableCategorySectionProps) {
  const { setNodeRef } = useDroppable({
    id: props.droppableId,
    data: { kind: "section", zone: props.zone, category: props.dropCategory },
    disabled: !props.isOwner,
  });
  const { active, over } = useDndContext();
  const overTarget = over?.data.current as
    | { zone?: Zone; category?: string | null }
    | undefined;
  const source = active?.data.current as
    | { zone?: Zone; category?: string | null; kind?: string }
    | undefined;
  const isCardDrag = !source?.kind || source.kind === "card";
  const isOver =
    !!active &&
    isCardDrag &&
    overTarget?.zone === props.zone &&
    (overTarget?.category ?? null) === props.dropCategory &&
    !(source?.zone === props.zone && (source?.category ?? null) === props.dropCategory);

  return (
    <CategorySectionView
      label={props.label}
      dbName={props.dbName}
      cards={props.cards}
      deckId={props.deckId}
      format={props.format}
      zone={props.zone}
      subcategories={props.subcategories}
      isOwner={props.isOwner}
      categoryForAdd={props.categoryForAdd}
      kind={props.kind}
      setNodeRef={setNodeRef}
      isOver={isOver}
      isJustMoved={props.isJustMoved}
      actions={props.actions}
      dispatch={props.dispatch}
      onRename={props.onRename}
      droppableId={props.droppableId}
      isCollapsed={props.isCollapsed}
      onToggleCollapse={props.onToggleCollapse}
      view={props.view}
    />
  );
}

function swap<T>(arr: readonly T[], i: number, j: number): T[] {
  const next = arr.slice();
  const tmp = next[i] as T;
  next[i] = next[j] as T;
  next[j] = tmp;
  return next;
}

interface CategoryActionsMenuProps {
  deckId: string;
  dbName: string;
  displayName: string;
  index: number;
  total: number;
  categoryNames: readonly string[];
  onReorder: (movedName: string, nextOrder: string[]) => void;
}

function CategoryActionsMenu({
  deckId,
  dbName,
  displayName,
  index,
  total,
  categoryNames,
  onReorder,
}: CategoryActionsMenuProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const isFirst = index === 0;
  const isLast = index === total - 1;

  function move(toIndex: number) {
    if (toIndex < 0 || toIndex >= total) return;
    const next = swap(categoryNames, index, toIndex);
    startTransition(async () => {
      onReorder(dbName, next);
      try {
        await reorderCategories(deckId, next);
      } finally {
        router.refresh();
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${displayName}`}
              className="h-7 w-7 shrink-0 text-muted-foreground"
            />
          }
        >
          <MoreHorizontal className="size-3.5" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={isFirst || isPending}
            onClick={() => move(index - 1)}
          >
            <ArrowUp aria-hidden /> Move up
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isLast || isPending}
            onClick={() => move(index + 1)}
          >
            <ArrowDown aria-hidden /> Move down
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 aria-hidden /> Delete...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteCategoryDialog
        deckId={deckId}
        categoryName={dbName}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => router.refresh()}
      />
    </>
  );
}

interface RenameCategoryInlineProps {
  deckId: string;
  dbName: string;
  initialName: string;
  onRename: (fromDb: string, toDisplay: string) => void;
  onDone: () => void;
  onCancel: () => void;
}

function RenameCategoryInline({
  deckId,
  dbName,
  initialName,
  onRename,
  onDone,
  onCancel,
}: RenameCategoryInlineProps) {
  const [name, setName] = useState(initialName);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === initialName) {
      onCancel();
      return;
    }
    setError(null);
    startTransition(async () => {
      onRename(dbName, trimmed);
      try {
        await renameCategory(deckId, dbName, trimmed);
        onDone();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Rename failed");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex-1 flex flex-col gap-1">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label={`Rename ${initialName}`}
        disabled={isPending}
        autoFocus
        onBlur={() => {
          if (error) return;
          if (name.trim() === initialName || !name.trim()) onCancel();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        className="min-h-7 rounded-md border border-input bg-background px-2 py-0.5 text-xs font-semibold uppercase tracking-wide outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
      />
      {error && (
        <p role="alert" className="text-xs text-destructive normal-case font-normal tracking-normal">
          {error}
        </p>
      )}
    </form>
  );
}

interface DeleteCategoryDialogProps {
  deckId: string;
  categoryName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

function DeleteCategoryDialog({
  deckId,
  categoryName,
  open,
  onOpenChange,
  onDeleted,
}: DeleteCategoryDialogProps) {
  const [mode, setMode] = useState<CategoryDeleteMode>("uncategorize");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteCategory(deckId, categoryName, mode);
        onOpenChange(false);
        setMode("uncategorize");
        onDeleted();
      } catch {
        setError("Failed to delete category. Please try again.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete &quot;{categoryName}&quot;?</DialogTitle>
          <DialogDescription>
            Choose what happens to the cards in this category.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="flex flex-col gap-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="delete-mode"
              value="uncategorize"
              checked={mode === "uncategorize"}
              onChange={() => setMode("uncategorize")}
              className="mt-1"
            />
            <span className="text-sm">
              <span className="block font-medium">Move cards to Uncategorized</span>
              <span className="text-xs text-muted-foreground">
                Cards stay in Mainboard with no category.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="delete-mode"
              value="deleteCards"
              checked={mode === "deleteCards"}
              onChange={() => setMode("deleteCards")}
              className="mt-1"
            />
            <span className="text-sm">
              <span className="block font-medium">Delete cards in this category</span>
              <span className="text-xs text-muted-foreground">
                Removes the cards from Mainboard. Copies in other zones stay.
              </span>
            </span>
          </label>
        </fieldset>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <div className="flex gap-2 justify-end w-full">
            <DialogClose
              render={<Button type="button" variant="outline" size="sm" />}
            >
              Cancel
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isPending}
              onClick={handleDelete}
            >
              {isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Decklist({ deck, cards, dispatch, isOwner }: DecklistProps) {
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
  const getServerSnapshot = useCallback(() => EMPTY_COLLAPSED, []);
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
        <DroppableCategorySection
          label="Commander"
          cards={sortCards(commanderCards, sortKey, sortDir)}
          deckId={deck.id}
          format={deck.format}
          zone={Zone.COMMANDER}
          dropCategory={null}
          droppableId="zone:COMMANDER"
          subcategories={displaySubcategoryNames}
          isOwner={isOwner}
          categoryForAdd={null}
          kind="commander"
          dispatch={dispatch}
          isCollapsed={!!collapsed["zone:COMMANDER"]}
          onToggleCollapse={handleToggleCollapse}
          view={view}
        />
      )}

      {hasMainboardSections &&
        sortableSections.map((section) => {
          const index = displaySubcategoryNames.indexOf(section.label);
          const dbName = subcategoryNames[index]!;
          const droppableId = `zone:MAINBOARD:cat:${section.label}`;
          return (
            <DroppableCategorySection
              key={dbName}
              label={section.label}
              dbName={dbName}
              cards={section.cards}
              deckId={deck.id}
              format={deck.format}
              zone={Zone.MAINBOARD}
              dropCategory={section.label}
              droppableId={droppableId}
              subcategories={displaySubcategoryNames}
              isOwner={isOwner}
              categoryForAdd={section.label}
              kind="category"
              isJustMoved={justMoved === dbName}
              actions={
                <CategoryActionsMenu
                  deckId={deck.id}
                  dbName={dbName}
                  displayName={section.label}
                  index={index}
                  total={subcategoryNames.length}
                  categoryNames={subcategoryNames}
                  onReorder={handleReorder}
                />
              }
              dispatch={dispatch}
              onRename={handleRename}
              isCollapsed={!!collapsed[droppableId]}
              onToggleCollapse={handleToggleCollapse}
              view={view}
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
            <DroppableCategorySection
              key={section.key}
              label={section.label}
              cards={section.cards}
              deckId={deck.id}
              format={deck.format}
              zone={Zone.MAINBOARD}
              dropCategory={dropCategory}
              droppableId={droppableId}
              subcategories={displaySubcategoryNames}
              isOwner={isOwner}
              categoryForAdd={dropCategory}
              kind="uncategorized"
              dispatch={dispatch}
              isCollapsed={!!collapsed[droppableId]}
              onToggleCollapse={handleToggleCollapse}
              view={view}
            />
          );
        })}
    </div>
  );
}
