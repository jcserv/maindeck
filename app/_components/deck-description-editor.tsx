"use client";

import { useRef, useState, useTransition } from "react";
import { updateDeckDescription } from "@/lib/deck/actions";
import { Textarea } from "@/components/ui/textarea";

interface DeckDescriptionEditorProps {
  deckId: string;
  description: string | null;
  isOwner: boolean;
}

export function DeckDescriptionEditor({
  deckId,
  description,
  isOwner,
}: DeckDescriptionEditorProps) {
  const [value, setValue] = useState(description ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function startEditing() {
    setValue(description ?? "");
    setIsEditing(true);
  }

  if (!isOwner) {
    if (!description) return null;
    return (
      <p className="mt-2 text-sm text-muted-foreground max-w-prose leading-relaxed whitespace-pre-wrap">
        {description}
      </p>
    );
  }

  function commit() {
    const next = value.trim();
    const current = (description ?? "").trim();
    setIsEditing(false);
    if (next === current) return;
    startTransition(async () => {
      try {
        await updateDeckDescription(deckId, next);
      } catch {
        setValue(description ?? "");
      }
    });
  }

  function cancel() {
    setValue(description ?? "");
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <Textarea
        ref={textareaRef}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            commit();
          }
        }}
        placeholder="Describe your deck strategy..."
        rows={3}
        maxLength={2000}
        disabled={isPending}
        className="mt-2 max-w-prose text-sm resize-none"
      />
    );
  }

  if (description) {
    return (
      <button
        type="button"
        onClick={startEditing}
        className="mt-2 block text-left text-sm text-muted-foreground max-w-prose leading-relaxed whitespace-pre-wrap hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        aria-label="Edit description"
      >
        {description}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      className="mt-2 block text-left text-sm text-muted-foreground/70 italic hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
    >
      Add description…
    </button>
  );
}
