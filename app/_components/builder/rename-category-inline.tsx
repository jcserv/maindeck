"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { renameCategory } from "@/app/_actions/deck/categories";
import { getActionErrorMessage } from "@/lib/telemetry";

interface RenameCategoryInlineProps {
  deckId: string;
  dbName: string;
  initialName: string;
  onRename: (fromDb: string, toDisplay: string) => void;
  onDone: () => void;
  onCancel: () => void;
}

export function RenameCategoryInline({
  deckId,
  dbName,
  initialName,
  onRename,
  onDone,
  onCancel,
}: RenameCategoryInlineProps) {
  const [name, setName] = useState(initialName);
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
      } catch (err) {
        setError(getActionErrorMessage(err, "Rename failed. Please try again."));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex-1 flex flex-col gap-1">
      <div className="flex items-center gap-1">
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
          className="min-w-0 flex-1 min-h-7 rounded-md border border-input bg-background px-2 py-0.5 text-xs font-semibold uppercase tracking-wide outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        />
        <button
          type="submit"
          aria-label="Confirm rename"
          disabled={isPending}
          onMouseDown={(e) => e.preventDefault()}
          className="shrink-0 inline-flex size-7 items-center justify-center rounded-md border border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50 sm:hidden"
        >
          <Check className="size-3.5" aria-hidden />
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive normal-case font-normal tracking-normal">
          {error}
        </p>
      )}
    </form>
  );
}
