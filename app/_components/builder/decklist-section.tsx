"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardRow } from "@/app/_components/builder/card-row";
import { CardStack } from "@/app/_components/builder/card-stack";
import { RenameCategoryInline } from "./rename-category-inline";
import { Format, Zone } from "@/lib/generated/prisma/enums";
import { DEFAULT_DECK_VIEW_OPTIONS, type DeckViewOptions } from "./decklist-view-options";
import { computeOwnershipState, type ViewerHolding } from "@/lib/inventory/state";
import { commanderTemplateTarget } from "@/lib/deck/category-autogen";
import type { DeckCard, ZoneAction } from "@/lib/deck/zone-view";
import { cn } from "@/lib/utils";
import { useHeaderSearch } from "@/app/_components/header-search/header-search-context";

export type ViewMode = "text" | "stack";
export const UNCATEGORIZED_KEY = "__uncategorized__";
type CategoryKind = "commander" | "uncategorized" | "category";

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
          ? computeOwnershipState(
              { cardId: dc.card.id, printingId: dc.printingId ?? null, isFoil: dc.isFoil },
              args.viewerHoldings,
            )
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
          {...(canManage && {
            tabIndex: 0,
            role: "button",
            onDoubleClick: () => setEditing(true),
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setEditing(true);
              }
            },
            title: "Double-click to rename",
          })}
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

export function StaticCategorySection(props: Omit<CategorySectionViewProps, "setNodeRef" | "isOver">) {
  return (
    <CategorySectionView
      {...props}
      setNodeRef={() => undefined}
      isOver={false}
    />
  );
}
