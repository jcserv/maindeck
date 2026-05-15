"use client";

import { useState, useTransition } from "react";
import { useDndContext, useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  ArrowDown,
  ArrowUp,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
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
import { CardRowSortable } from "@/app/_components/builder/card-row-sortable";
import { CardStackSortable } from "@/app/_components/builder/card-stack-sortable";
import {
  CategorySectionView,
  resolveOwnership,
  useDecklistState,
  useDecklistPreviewSync,
  useDeckViewOptions,
  UNCATEGORIZED_KEY,
  DEFAULT_DECK_VIEW_OPTIONS,
  type DecklistProps,
  type CategorySectionViewProps,
} from "@/app/_components/builder/decklist";
import { reorderCategories, deleteCategory } from "@/app/_actions/deck/categories";
import { sortCards } from "@/lib/deck/group-sort";
import { Zone } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";
import type { DeckCard, ZoneAction } from "@/lib/deck/zone-view";
import type { Format } from "@/lib/generated/prisma/enums";
import type { CategoryDeleteMode } from "@/lib/deck/constants";

interface DroppableCategorySectionProps
  extends Omit<CategorySectionViewProps, "setNodeRef" | "isOver" | "renderCards"> {
  dropCategory: string | null;
  view: "text" | "stack";
  deckId: string;
  format: Format;
  subcategories: string[];
  dispatch: (a: ZoneAction) => void;
}

function DroppableCategorySection(props: DroppableCategorySectionProps) {
  const { setNodeRef } = useDroppable({
    id: props.droppableId,
    data: { kind: "section", zone: props.zone, category: props.dropCategory },
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

  function renderCards(cards: DeckCard[], bodyId: string) {
    if (props.view === "stack") {
      return (
        <SortableContext
          items={cards.map((dc) => dc.id)}
          strategy={verticalListSortingStrategy}
        >
          <CardStackSortable
            id={bodyId}
            cards={cards}
            deckId={props.deckId}
            format={props.format}
            dispatch={props.dispatch}
          />
        </SortableContext>
      );
    }
    return (
      <SortableContext
        items={cards.map((dc) => dc.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul id={bodyId} className="flex flex-col gap-0.5">
          {cards.map((dc) => {
            const ownership = props.viewerHoldings
              ? resolveOwnership(dc, props.viewerHoldings)
              : undefined;
            return (
              <CardRowSortable
                key={dc.id}
                dc={dc}
                deckId={props.deckId}
                format={props.format}
                subcategories={props.subcategories}
                dispatch={props.dispatch}
                viewerId={props.viewerId}
                ownership={ownership}
                viewOptions={props.viewOptions ?? DEFAULT_DECK_VIEW_OPTIONS}
              />
            );
          })}
        </ul>
      </SortableContext>
    );
  }

  return (
    <CategorySectionView
      {...props}
      setNodeRef={setNodeRef}
      isOver={isOver}
      renderCards={renderCards}
    />
  );
}

export function DecklistDnd({
  deck,
  cards,
  dispatch,
  isOwner,
  viewerId,
  viewerHoldings,
}: DecklistProps) {
  const {
    group,
    view,
    sortKey,
    sortDir,
    subcategoryNames,
    displaySubcategoryNames,
    justMoved,
    collapsed,
    commanderCards,
    hasAnyCards,
    hasMainboardSections,
    sortableSections,
    otherSections,
    handleToggleCollapse,
    handleReorder,
    handleRename,
  } = useDecklistState(deck, cards);

  useDecklistPreviewSync(deck, commanderCards, sortableSections, otherSections, sortKey, sortDir);

  const { options: viewOptions } = useDeckViewOptions(deck.id);

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
          No cards yet — press ⌘K or use the action bar to add one.
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
                  isEmpty={section.cards.length === 0}
                  onReorder={handleReorder}
                />
              }
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
              viewerId={viewerId}
              viewerHoldings={viewerHoldings}
              viewOptions={viewOptions}
            />
          );
        })}
    </div>
  );
}

interface CategoryActionsMenuProps {
  deckId: string;
  dbName: string;
  displayName: string;
  index: number;
  total: number;
  categoryNames: readonly string[];
  isEmpty: boolean;
  onReorder: (movedName: string, nextOrder: string[]) => void;
}

function swap<T>(arr: readonly T[], i: number, j: number): T[] {
  const next = arr.slice();
  const tmp = next[i] as T;
  next[i] = next[j] as T;
  next[j] = tmp;
  return next;
}

function CategoryActionsMenu({
  deckId,
  dbName,
  displayName,
  index,
  total,
  categoryNames,
  isEmpty,
  onReorder,
}: CategoryActionsMenuProps) {
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const isFirst = index === 0;
  const isLast = index === total - 1;

  function move(toIndex: number) {
    if (toIndex < 0 || toIndex >= total) return;
    const next = swap(categoryNames, index, toIndex);
    startTransition(async () => {
      onReorder(dbName, next);
      await reorderCategories(deckId, next);
    });
  }

  function handleDeleteClick() {
    if (isEmpty) {
      startTransition(async () => {
        await deleteCategory(deckId, dbName, "uncategorize");
      });
      return;
    }
    setDeleteOpen(true);
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
            disabled={isPending}
            onClick={handleDeleteClick}
          >
            <Trash2 aria-hidden /> {isEmpty ? "Delete" : "Delete..."}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteCategoryDialog
        deckId={deckId}
        categoryName={dbName}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => {}}
      />
    </>
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
