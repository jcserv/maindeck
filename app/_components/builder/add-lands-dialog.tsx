"use client";

import { useMemo, useState, useTransition, type ReactElement } from "react";
import { AlertCircle, ChevronDown, Minus, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getActionErrorMessage } from "@/lib/telemetry";
import { formatTargets } from "@/lib/stats/compute";
import {
  allocateBasics,
  basicsSlotTarget,
  type PipSkew,
} from "@/lib/deck/manabase/allocate";
import { LAND_CYCLES, type LandCycleId } from "@/lib/deck/manabase/cycles";
import {
  addLandsToDeck,
  getLandCandidatesAction,
} from "@/app/_actions/deck/manabase";
import type { LandCandidate } from "@/lib/deck/manabase/candidates";
import { CardHoverPreview } from "@/app/_components/card/card-hover-preview";
import type { Format } from "@/lib/generated/prisma/enums";

interface AddLandsDialogProps {
  deckId: string;
  format: Format;
  colorIdentity: string[];
  pips: PipSkew;
  currentLandCount: number;
  trigger: ReactElement;
}

const BASIC_COLORS = ["W", "U", "B", "R", "G", "C"] as const;
type BasicColor = (typeof BASIC_COLORS)[number];

const BASIC_LABEL: Record<BasicColor, string> = {
  W: "Plains",
  U: "Island",
  B: "Swamp",
  R: "Mountain",
  G: "Forest",
  C: "Wastes",
};

const EMPTY_BASICS: PipSkew = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

function sumBasics(b: PipSkew): number {
  return b.W + b.U + b.B + b.R + b.G + b.C;
}

function QtyStepper({
  value,
  onChange,
  disabled,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div className="inline-flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-6"
        disabled={disabled || value <= 0}
        aria-label={`Remove one ${label}`}
        onClick={() => onChange(Math.max(0, value - 1))}
      >
        <Minus className="size-3" aria-hidden />
      </Button>
      <span className="w-6 text-center text-sm tabular-nums" aria-live="polite">
        {value}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-6"
        disabled={disabled}
        aria-label={`Add one ${label}`}
        onClick={() => onChange(value + 1)}
      >
        <Plus className="size-3" aria-hidden />
      </Button>
    </div>
  );
}

function LandPickerList({
  error,
  isLoading,
  showBasicsGroup,
  collapsed,
  toggleGroup,
  basicColorsToShow,
  matches,
  basicImages,
  effectiveBasics,
  setBasic,
  isSaving,
  candidates,
  picks,
  setPick,
}: {
  error: string | null;
  isLoading: boolean;
  showBasicsGroup: boolean;
  collapsed: Set<string>;
  toggleGroup: (id: string) => void;
  basicColorsToShow: BasicColor[];
  matches: (name: string) => boolean;
  basicImages: Record<BasicColor, string> | null;
  effectiveBasics: PipSkew;
  setBasic: (color: BasicColor, quantity: number) => void;
  isSaving: boolean;
  candidates: Record<LandCycleId, LandCandidate[]> | null;
  picks: Record<number, number>;
  setPick: (cardId: number, quantity: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1 max-h-[50vh] overflow-y-auto pr-3">
      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {isLoading && (
        <div className="h-[20px] text-xs text-muted-foreground">Loading lands…</div>
      )}
      {showBasicsGroup && (
        <Group
          id="basics"
          label="Basics"
          collapsed={collapsed.has("basics")}
          onToggle={() => toggleGroup("basics")}
        >
          {basicColorsToShow
            .filter((c) => matches(BASIC_LABEL[c]))
            .map((color) => (
              <Row key={color} name={BASIC_LABEL[color]} imageUri={basicImages?.[color] ?? null}>
                <QtyStepper
                  value={effectiveBasics[color]}
                  onChange={(q) => setBasic(color, q)}
                  label={BASIC_LABEL[color]}
                  disabled={isSaving}
                />
              </Row>
            ))}
        </Group>
      )}
      {candidates &&
        [...LAND_CYCLES]
          .sort((a, b) => a.order - b.order)
          .map((cycle) => {
            const cards = (candidates[cycle.id] ?? []).filter((c) => matches(c.name));
            if (cards.length === 0) return null;
            return (
              <Group
                key={cycle.id}
                id={cycle.id}
                label={`${cycle.label} (${cards.length})`}
                collapsed={collapsed.has(cycle.id)}
                onToggle={() => toggleGroup(cycle.id)}
              >
                {cards.map((card) => (
                  <Row key={card.id} name={card.name} imageUri={card.imageUri}>
                    <QtyStepper
                      value={picks[card.id] ?? 0}
                      onChange={(q) => setPick(card.id, q)}
                      label={card.name}
                      disabled={isSaving}
                    />
                  </Row>
                ))}
              </Group>
            );
          })}
    </div>
  );
}

export function AddLandsDialog({
  deckId,
  format,
  colorIdentity,
  pips,
  currentLandCount,
  trigger,
}: AddLandsDialogProps) {
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<Record<
    LandCycleId,
    LandCandidate[]
  > | null>(null);
  // Identity resolved server-side from the deck (authoritative); falls back to
  // the prop for the brief window before candidates load.
  const [resolvedIdentity, setResolvedIdentity] = useState<string[] | null>(
    null,
  );
  const [basicImages, setBasicImages] = useState<Record<
    BasicColor,
    string
  > | null>(null);
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [basics, setBasics] = useState<PipSkew>(EMPTY_BASICS);
  const [basicsDirty, setBasicsDirty] = useState(false);
  const [search, setSearch] = useState("");
  // Cycle groups start collapsed so opening the dialog doesn't render hundreds
  // of "Other lands" rows up front. Basics stays expanded.
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(LAND_CYCLES.map((c) => c.id)),
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, startLoad] = useTransition();
  const [isSaving, startSave] = useTransition();

  const identity = resolvedIdentity ?? colorIdentity;
  const targetLands = formatTargets(format).targetLands;

  const sumPicks = useMemo(
    () => Object.values(picks).reduce((sum, q) => sum + q, 0),
    [picks],
  );

  // Suggested basics top the deck up toward the format's land target, skewed by
  // the deck's color pips and scoped to its identity. Null target (no land
  // guidance) means manual entry only.
  const suggestedBasics = useMemo(() => {
    if (targetLands === null) return EMPTY_BASICS;
    const slots = basicsSlotTarget(targetLands, currentLandCount, sumPicks);
    return allocateBasics(pips, slots, { colorIdentity: identity });
  }, [targetLands, currentLandCount, sumPicks, pips, identity]);

  // Effective basics: the user's overrides once they touch a stepper,
  // otherwise the live suggestion. Derived (not effect-synced) so it tracks
  // picks/identity changes without a setState-in-effect.
  const effectiveBasics = basicsDirty ? basics : suggestedBasics;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setPicks({});
    setBasics(EMPTY_BASICS);
    setBasicsDirty(false);
    setSearch("");
    setError(null);
    setCollapsed(new Set(LAND_CYCLES.map((c) => c.id)));
    if (candidates === null) {
      startLoad(async () => {
        try {
          const result = await getLandCandidatesAction(deckId);
          setResolvedIdentity(result.colorIdentity);
          setCandidates(result.candidates);
          setBasicImages(result.basicImages);
        } catch (err) {
          setError(getActionErrorMessage(err, "Could not load lands."));
        }
      });
    }
  }

  function setPick(cardId: number, quantity: number) {
    setPicks((prev) => {
      const next = { ...prev };
      if (quantity <= 0) delete next[cardId];
      else next[cardId] = quantity;
      return next;
    });
  }

  function setBasic(color: BasicColor, quantity: number) {
    setBasics((prev) => {
      const base = basicsDirty ? prev : suggestedBasics;
      return { ...base, [color]: Math.max(0, quantity) };
    });
    setBasicsDirty(true);
  }

  function toggleGroup(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSave() {
    setError(null);
    startSave(async () => {
      try {
        await addLandsToDeck(deckId, {
          picks: Object.entries(picks).map(([cardId, quantity]) => ({
            cardId: Number(cardId),
            quantity,
          })),
          basics: effectiveBasics,
        });
        setOpen(false);
      } catch (err) {
        setError(getActionErrorMessage(err, "Could not add lands."));
      }
    });
  }

  const plannedTotal = sumPicks + sumBasics(effectiveBasics);
  const filter = search.trim().toLowerCase();
  const matches = (name: string) =>
    filter === "" || name.toLowerCase().includes(filter);

  // Basics colors to surface: the identity (or just Wastes for a colorless deck).
  const basicColorsToShow: BasicColor[] =
    identity.length > 0
      ? BASIC_COLORS.filter((c) => c !== "C" && identity.includes(c))
      : ["C"];
  const showBasicsGroup = basicColorsToShow.some((c) => matches(BASIC_LABEL[c]));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-lg sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add lands</DialogTitle>
          <DialogDescription>
            Add basics and nonbasic land cycles for this deck&apos;s colors.
            Lands go to Mainboard, uncategorized.
          </DialogDescription>
        </DialogHeader>

        <Input
          type="search"
          placeholder="Filter lands by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Filter lands by name"
        />

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {plannedTotal} land{plannedTotal !== 1 ? "s" : ""} to add
            {targetLands !== null && (
              <>
                {" · "}
                {currentLandCount + plannedTotal}/{targetLands} after
              </>
            )}
          </span>
          {basicsDirty && targetLands !== null && (
            <button
              type="button"
              className="text-xs underline hover:text-foreground"
              onClick={() => setBasicsDirty(false)}
            >
              Reset to suggested
            </button>
          )}
        </div>

        <LandPickerList
          error={error}
          isLoading={isLoading}
          showBasicsGroup={showBasicsGroup}
          collapsed={collapsed}
          toggleGroup={toggleGroup}
          basicColorsToShow={basicColorsToShow}
          matches={matches}
          basicImages={basicImages}
          effectiveBasics={effectiveBasics}
          setBasic={setBasic}
          isSaving={isSaving}
          candidates={candidates}
          picks={picks}
          setPick={setPick}
        />

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isSaving || plannedTotal === 0}
          >
            {isSaving ? "Adding…" : `Add ${plannedTotal} land${plannedTotal !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Group({
  id,
  label,
  collapsed,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-controls={`group-${id}`}
        className="flex w-full items-center justify-between py-2 text-sm font-medium hover:text-foreground"
      >
        {label}
        <ChevronDown
          className={`size-4 transition-transform ${collapsed ? "-rotate-90" : ""}`}
          aria-hidden
        />
      </button>
      {!collapsed && (
        <div id={`group-${id}`} className="flex flex-col gap-1 pb-2">
          {children}
        </div>
      )}
    </div>
  );
}

function Row({
  name,
  imageUri,
  children,
}: {
  name: string;
  imageUri?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 pl-1 pr-0.5">
      <CardHoverPreview
        name={name}
        imageUri={imageUri ?? null}
        className="truncate text-sm underline decoration-dotted underline-offset-2"
      >
        {name}
      </CardHoverPreview>
      {children}
    </div>
  );
}
