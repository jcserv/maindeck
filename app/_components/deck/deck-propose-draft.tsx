"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { submitDeckProposal } from "@/app/_actions/deck/collaboration";
import { useCardBrowser } from "@/app/_components/builder/card-browser/use-card-browser";
import { deltaKey, type RevisionDelta } from "@/lib/deck/revision";

interface ExistingMainboardCard {
  cardId: number;
  cardName: string;
  /** Ordered category memberships; `[0]` is the primary. */
  categories: string[];
  quantity: number;
}

interface DeckProposeDraftProps {
  deckId: string;
  existingCards: ExistingMainboardCard[];
}

function mainboardKey(c: Pick<ExistingMainboardCard, "cardId">) {
  return deltaKey({ cardId: c.cardId, zone: "MAINBOARD" });
}

export function DeckProposeDraft({
  deckId,
  existingCards,
}: DeckProposeDraftProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { results, loading } = useCardBrowser(query);

  const [quantities, setQuantities] = useState<Map<string, number>>(
    () => new Map(existingCards.map((c) => [mainboardKey(c), c.quantity])),
  );
  const [added, setAdded] = useState<
    Map<number, { cardName: string; quantity: number }>
  >(new Map());
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const existingByCardId = useMemo(
    () => new Map(existingCards.map((c) => [c.cardId, c])),
    [existingCards],
  );

  function setQuantity(key: string, next: number) {
    setQuantities((prev) => {
      const map = new Map(prev);
      map.set(key, Math.max(0, next));
      return map;
    });
  }

  function addCard(cardId: number, cardName: string) {
    if (existingByCardId.has(cardId)) return;
    setAdded((prev) => {
      const map = new Map(prev);
      const current = map.get(cardId);
      map.set(cardId, { cardName, quantity: (current?.quantity ?? 0) + 1 });
      return map;
    });
  }

  function setAddedQuantity(cardId: number, next: number) {
    setAdded((prev) => {
      const map = new Map(prev);
      const current = map.get(cardId);
      if (!current) return prev;
      if (next <= 0) {
        map.delete(cardId);
      } else {
        map.set(cardId, { ...current, quantity: next });
      }
      return map;
    });
  }

  const deltas: RevisionDelta[] = useMemo(() => {
    const out: RevisionDelta[] = [];
    for (const c of existingCards) {
      const key = mainboardKey(c);
      const next = quantities.get(key) ?? c.quantity;
      const delta = next - c.quantity;
      if (delta !== 0) {
        out.push({
          cardId: c.cardId,
          cardName: c.cardName,
          zone: "MAINBOARD",
          categories: c.categories,
          delta,
        });
      }
    }
    for (const [cardId, entry] of added) {
      out.push({
        cardId,
        cardName: entry.cardName,
        zone: "MAINBOARD",
        categories: [],
        delta: entry.quantity,
      });
    }
    return out;
  }, [existingCards, quantities, added]);

  function handleSubmit() {
    if (deltas.length === 0) return;
    setError(null);
    startTransition(async () => {
      try {
        await submitDeckProposal(deckId, deltas, message.trim() || undefined);
        router.push(`/deck/${deckId}/collaborate`);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not submit proposal.",
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Mainboard
        </h2>
        {existingCards.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No mainboard cards yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {existingCards.map((c) => {
              const key = mainboardKey(c);
              return (
                <li key={key} className="flex items-center gap-3">
                  <QuantityStepper
                    value={quantities.get(key) ?? c.quantity}
                    onChange={(n) => setQuantity(key, n)}
                  />
                  <span className="text-sm">{c.cardName}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Add cards
        </h2>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cards to add…"
        />
        {loading && (
          <p className="text-xs text-muted-foreground">Searching…</p>
        )}
        {results.length > 0 && (
          <ul className="flex flex-col gap-1 max-h-64 overflow-y-auto rounded-md border p-2">
            {results.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3"
              >
                <span className="text-sm">{r.name}</span>
                {existingByCardId.has(r.id) ? (
                  <span className="text-xs text-muted-foreground">
                    Already in deck
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addCard(r.id, r.name)}
                  >
                    <Plus className="size-3.5" aria-hidden />
                    Add
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {added.size > 0 && (
          <ul className="flex flex-col gap-1">
            {[...added.entries()].map(([cardId, entry]) => (
              <li key={cardId} className="flex items-center gap-3">
                <QuantityStepper
                  value={entry.quantity}
                  onChange={(n) => setAddedQuantity(cardId, n)}
                />
                <span className="text-sm">{entry.cardName}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <label htmlFor="proposal-message" className="text-sm font-medium">
          Message (optional)
        </label>
        <Textarea
          id="proposal-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Why these changes?"
          rows={3}
        />
      </section>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          disabled={deltas.length === 0 || pending}
          onClick={handleSubmit}
        >
          {pending
            ? "Submitting…"
            : `Submit proposal (${deltas.length} change${deltas.length === 1 ? "" : "s"})`}
        </Button>
      </div>
    </div>
  );
}

function QuantityStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={() => onChange(value - 1)}
        aria-label="Decrease quantity"
      >
        <Minus className="size-3.5" aria-hidden />
      </Button>
      <span className="w-6 text-center text-sm tabular-nums">{value}</span>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={() => onChange(value + 1)}
        aria-label="Increase quantity"
      >
        <Plus className="size-3.5" aria-hidden />
      </Button>
    </div>
  );
}
