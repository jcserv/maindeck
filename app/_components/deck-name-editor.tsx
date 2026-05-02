"use client";

import { useRef, useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { updateDeckName } from "@/app/_actions/deck/crud";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DECK_NAME_MAX } from "@/lib/validation/deck-constants";

interface DeckNameEditorProps {
  deckId: string;
  name: string;
  isOwner: boolean;
}

const HEADING_CLASSES =
  "font-heading text-3xl md:text-4xl font-semibold leading-tight tracking-tight truncate min-w-0";

export function DeckNameEditor({ deckId, name, isOwner }: DeckNameEditorProps) {
  const [committedName, setCommittedName] = useState(name);
  const [value, setValue] = useState(name);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  if (!isOwner) {
    return <h1 className={HEADING_CLASSES}>{name}</h1>;
  }

  function startEditing() {
    setValue(committedName);
    setEditing(true);
  }

  function cancel() {
    setValue(committedName);
    setEditing(false);
  }

  function commit() {
    const next = value.trim();
    if (!next || next === committedName) {
      setValue(committedName);
      setEditing(false);
      return;
    }
    const previous = committedName;
    setCommittedName(next);
    setEditing(false);
    startTransition(async () => {
      try {
        await updateDeckName(deckId, next);
      } catch {
        setCommittedName(previous);
        setValue(previous);
      }
    });
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        maxLength={DECK_NAME_MAX}
        disabled={pending}
        aria-label="Deck name"
        className="h-auto py-1 font-heading text-3xl md:text-4xl font-semibold leading-tight tracking-tight"
      />
    );
  }

  return (
    <div className="flex items-center gap-2">
      <h1 className={HEADING_CLASSES}>{committedName}</h1>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={startEditing}
        disabled={pending}
        aria-label="Edit deck name"
      >
        <Pencil />
      </Button>
    </div>
  );
}
