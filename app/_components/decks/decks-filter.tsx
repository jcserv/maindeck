"use client";

import { useState } from "react";
import { Search, Globe, Lock, Link2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DeckCardPreview } from "@/app/_components/decks/deck-card-preview";
import Link from "@/app/_components/link";
import { type Format, type Visibility } from "@/lib/generated/prisma/enums";

interface DeckRow {
  id: string;
  name: string;
  format: Format;
  visibility: Visibility;
  cardCount: number;
  updatedAt: Date | string;
  releasedAt?: Date | string | null;
  previewImages: string[];
}

interface DecksFilterProps {
  decks: DeckRow[];
  view: "grid" | "list";
}

function formatLabel(format: Format): string {
  return format.charAt(0) + format.slice(1).toLowerCase();
}

function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

function VisibilityIcon({ visibility }: { visibility: Visibility }) {
  if (visibility === "PRIVATE")
    return <Lock className="h-3 w-3 text-muted-foreground shrink-0" aria-label="Private" />;
  if (visibility === "UNLISTED")
    return <Link2 className="h-3 w-3 text-muted-foreground shrink-0" aria-label="Unlisted" />;
  return <Globe className="h-3 w-3 text-muted-foreground shrink-0" aria-label="Public" />;
}

export function DecksFilter({ decks, view }: DecksFilterProps) {
  const [q, setQ] = useState("");

  const filtered = q
    ? decks.filter((d) => d.name.toLowerCase().includes(q.toLowerCase()))
    : decks;

  return (
    <div>
      {/* Filter input */}
      <div className="flex items-center gap-2 mb-6">
        <div className="relative w-60">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Filter decks…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
            aria-label="Filter decks by name"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-2 h-[200px]">
          <p className="text-muted-foreground text-sm">
            No decks match &ldquo;{q}&rdquo;.
          </p>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {filtered.map((deck) => (
            <DeckCardPreview
              key={deck.id}
              id={deck.id}
              name={deck.name}
              format={deck.format}
              visibility={deck.visibility}
              cardCount={deck.cardCount}
              updatedAt={deck.updatedAt}
              releasedAt={deck.releasedAt ?? null}
              previewImages={deck.previewImages}
            />
          ))}
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          {/* List header */}
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr] border-b border-border bg-muted/30">
            {["Name", "Format", "Cards", "Updated"].map((col) => (
              <div
                key={col}
                className="px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground font-mono"
              >
                {col}
              </div>
            ))}
          </div>

          {/* List rows */}
          {filtered.map((deck) => (
            <Link
              key={deck.id}
              href={`/deck/${deck.id}`}
              className="grid grid-cols-[2fr_1fr_1fr_1fr] border-b border-border last:border-b-0 hover:bg-accent transition-colors"
            >
              <div className="px-4 py-3.5 flex items-center gap-2 text-sm font-medium text-foreground">
                <VisibilityIcon visibility={deck.visibility} />
                <span className="line-clamp-1">{deck.name}</span>
              </div>
              <div className="px-4 py-3.5 flex items-center text-xs text-muted-foreground font-mono">
                {formatLabel(deck.format)}
              </div>
              <div className="px-4 py-3.5 flex items-center text-xs text-muted-foreground font-mono tabular-nums">
                {deck.cardCount}
              </div>
              <div className="px-4 py-3.5 flex items-center text-xs text-muted-foreground font-mono">
                {deck.releasedAt
                  ? `Released ${new Date(deck.releasedAt).getUTCFullYear()}`
                  : timeAgo(deck.updatedAt)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
