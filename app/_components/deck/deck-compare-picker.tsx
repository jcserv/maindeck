"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Link2, Users2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

type CompareSource = "deck" | "link" | "paste";

const COMPARE_SOURCES: {
  v: CompareSource;
  icon: React.ReactNode;
  label: string;
  sub: string;
}[] = [
  {
    v: "deck",
    icon: <Users2 className="h-3.5 w-3.5" />,
    label: "My decks",
    sub: "From your collection",
  },
  {
    v: "link",
    icon: <Link2 className="h-3.5 w-3.5" />,
    label: "Public link",
    sub: "Any public deck URL",
  },
  {
    v: "paste",
    icon: <ClipboardList className="h-3.5 w-3.5" />,
    label: "Paste list",
    sub: "Raw decklist",
  },
];

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

  const initialIsOwn = decks.some((d) => d.id === initialB);

  const [source, setSource] = useState<CompareSource>(
    initialB && !initialIsOwn ? "link" : "deck",
  );
  const [a, setA] = useState(initialA);
  const [b, setB] = useState(initialIsOwn ? initialB : "");
  const [ref, setRef] = useState(initialB && !initialIsOwn ? initialB : "");
  const [textInput, setTextInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleCompare = () => {
    setError(null);
    const left = a;
    if (!left) {
      setError("Pick a deck to compare from.");
      return;
    }

    switch (source) {
      case "paste": {
        const trimmedText = textInput.trim();
        if (!trimmedText) {
          setError("Paste a decklist.");
          return;
        }
        router.push(
          `/decks/compare?a=${encodeURIComponent(left)}&bText=${encodeURIComponent(trimmedText)}`,
        );
        break;
      }
      case "link": {
        const trimmedRef = ref.trim();
        if (!trimmedRef) {
          setError("Paste a deck link.");
          return;
        }
        if (isExternalDeckUrl(trimmedRef)) {
          router.push(
            `/decks/compare?a=${encodeURIComponent(left)}&bUrl=${encodeURIComponent(trimmedRef)}`,
          );
          return;
        }
        const right = parseDeckRef(trimmedRef);
        if (!right) {
          setError("Paste a valid deck link.");
          return;
        }
        if (left === right) {
          setError("Pick two different decks.");
          return;
        }
        router.push(
          `/decks/compare?a=${encodeURIComponent(left)}&b=${encodeURIComponent(right)}`,
        );
        break;
      }
      case "deck": {
        if (!b) {
          setError("Pick a deck to compare against.");
          return;
        }
        if (left === b) {
          setError("Pick two different decks.");
          return;
        }
        router.push(
          `/decks/compare?a=${encodeURIComponent(left)}&b=${encodeURIComponent(b)}`,
        );
        break;
      }
    }
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
        <label className="text-sm font-medium">Compare against</label>
        <div
          className="grid grid-cols-3 border border-border divide-x divide-border rounded-md overflow-hidden"
          role="tablist"
          aria-label="Compare against"
        >
          {COMPARE_SOURCES.map(({ v, icon, label, sub }) => {
            const active = source === v;
            return (
              <button
                key={v}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => {
                  setSource(v);
                  setError(null);
                }}
                className={cn(
                  "flex flex-col gap-0.5 px-3 py-3 text-left transition-colors border-t-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  active
                    ? "border-t-primary bg-muted"
                    : "border-t-transparent bg-background hover:bg-muted/50",
                )}
              >
                <span
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-medium",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      active ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {icon}
                  </span>
                  {label}
                </span>
                <span className="text-[10.5px] text-muted-foreground/70">
                  {sub}
                </span>
              </button>
            );
          })}
        </div>

        {source === "deck" && (
          <select
            id={bId}
            className={SELECT_CLASS}
            value={b}
            onChange={(e) => setB(e.target.value)}
          >
            <option value="">Select one of your decks…</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}

        {source === "link" && (
          <input
            id={refId}
            type="text"
            className={SELECT_CLASS}
            placeholder="https://…/deck/abc123"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
          />
        )}

        {source === "paste" && (
          <textarea
            id={textId}
            className={`${SELECT_CLASS} h-32 resize-y font-mono text-xs`}
            placeholder={"1 Sol Ring\n1 Arcane Signet\n\n// Commander\n1 Atraxa, Praetors' Voice"}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
          />
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div>
        <Button type="button" onClick={handleCompare}>
          Go
        </Button>
      </div>
    </div>
  );
}
