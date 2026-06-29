"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { isExternalDeckUrl } from "@/lib/deck/external-deck-url";

const SELECT_CLASS =
  "flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export interface PickerDeck {
  id: string;
  name: string;
}

/**
 * Pull a deck id out of either a raw id or a pasted deck URL like
 * `https://…/decks/<id>`, `https://…/deck/<id>`, or `/deck/<id>`.
 */
export function parseDeckRef(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\/decks?\/([^/?#]+)/);
  if (match) return match[1] ?? null;
  // Bare token (no slashes/spaces) — treat as an id.
  if (!/[\s/]/.test(trimmed)) return trimmed;
  return null;
}

export function DeckComparePicker({
  decks,
  initialA = "",
  initialB = "",
}: {
  decks: PickerDeck[];
  initialA?: string;
  initialB?: string;
}) {
  const router = useRouter();
  const aId = useId();
  const bId = useId();
  const refId = useId();
  const textId = useId();

  // An initial "compare against" that isn't one of the viewer's own decks (e.g.
  // arriving from a public deck page) belongs in the paste-link field, since the
  // select only lists the viewer's decks.
  const initialIsOwn = decks.some((d) => d.id === initialB);

  const [a, setA] = useState(initialA);
  const [b, setB] = useState(initialIsOwn ? initialB : "");
  const [ref, setRef] = useState(initialB && !initialIsOwn ? initialB : "");
  const [textInput, setTextInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const clearOtherB = (source: "select" | "ref" | "text") => {
    if (source !== "select") setB("");
    if (source !== "ref") setRef("");
    if (source !== "text") setTextInput("");
  };

  const handleCompare = () => {
    setError(null);
    const left = a;
    if (!left) {
      setError("Pick a deck to compare from.");
      return;
    }

    const trimmedText = textInput.trim();
    if (trimmedText) {
      router.push(
        `/decks/compare?a=${encodeURIComponent(left)}&bText=${encodeURIComponent(trimmedText)}`,
      );
      return;
    }

    const trimmedRef = ref.trim();
    if (isExternalDeckUrl(trimmedRef)) {
      router.push(
        `/decks/compare?a=${encodeURIComponent(left)}&bUrl=${encodeURIComponent(trimmedRef)}`,
      );
      return;
    }

    const right = parseDeckRef(trimmedRef) ?? b;
    if (!right) {
      setError("Pick or paste a deck to compare against.");
      return;
    }
    if (left === right) {
      setError("Pick two different decks.");
      return;
    }
    router.push(
      `/decks/compare?a=${encodeURIComponent(left)}&b=${encodeURIComponent(right)}`,
    );
  };

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <div className="flex flex-col gap-2">
        <label htmlFor={aId} className="text-sm font-medium">
          Your deck
        </label>
        <select
          id={aId}
          className={SELECT_CLASS}
          value={a}
          onChange={(e) => setA(e.target.value)}
        >
          <option value="">Select a deck…</option>
          {decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={bId} className="text-sm font-medium">
          Compare against
        </label>
        <select
          id={bId}
          className={SELECT_CLASS}
          value={b}
          onChange={(e) => {
            setB(e.target.value);
            if (e.target.value) clearOtherB("select");
          }}
        >
          <option value="">Select one of your decks…</option>
          {decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or paste a public deck link
          <span className="h-px flex-1 bg-border" />
        </div>
        <input
          id={refId}
          type="text"
          className={SELECT_CLASS}
          placeholder="https://…/deck/abc123"
          value={ref}
          onChange={(e) => {
            setRef(e.target.value);
            if (e.target.value) clearOtherB("ref");
          }}
        />
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or paste a decklist
          <span className="h-px flex-1 bg-border" />
        </div>
        <textarea
          id={textId}
          className={`${SELECT_CLASS} h-32 resize-y font-mono text-xs`}
          placeholder={"1 Sol Ring\n1 Arcane Signet\n\n// Commander\n1 Atraxa, Praetors' Voice"}
          value={textInput}
          onChange={(e) => {
            setTextInput(e.target.value);
            if (e.target.value) clearOtherB("text");
          }}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div>
        <Button type="button" onClick={handleCompare}>
          Compare
        </Button>
      </div>
    </div>
  );
}
