"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { createDeck } from "@/app/_actions/deck/crud";
import { createDeckWithImport } from "@/app/_actions/deck/import";
import { detectFormat, parseDecklist } from "@/lib/deck/io/parse";
import { Format, Visibility } from "@/lib/generated/prisma/enums";
import { getActionErrorMessage } from "@/lib/telemetry";
import { AdvancedOptions } from "./deck-create/advanced-options";
import type { Source } from "./deck-create/constants";
import { FilePanel } from "./deck-create/file-panel";
import { MetadataFields } from "./deck-create/metadata-fields";
import { PastePanel } from "./deck-create/paste-panel";
import { SourceTabs } from "./deck-create/source-tabs";
import { UrlPanel } from "./deck-create/url-panel";

interface DeckCreateFormProps {
  /** Pre-select a source tab (e.g. from ?source=paste redirect). */
  defaultSource?: Source;
}

export function DeckCreateForm({ defaultSource = "blank" }: DeckCreateFormProps) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [format, setFormat] = useState<Format>(Format.COMMANDER);
  const [visibility, setVisibility] = useState<Visibility>(Visibility.PRIVATE);
  const [description, setDescription] = useState("");
  const [source, setSource] = useState<Source>(defaultSource);
  const [pasteText, setPasteText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const parseResult = useMemo(
    () =>
      pasteText.trim()
        ? parseDecklist(pasteText, detectFormat(pasteText))
        : null,
    [pasteText],
  );

  const matchedCount = parseResult?.cards.length ?? 0;
  const unresolvedCount = parseResult?.unmatchedLines.length ?? 0;
  const totalQty = parseResult?.cards.reduce((s, c) => s + c.quantity, 0) ?? 0;

  const hasImport =
    source !== "blank" && source !== "url" && pasteText.trim().length > 0;

  const ctaLabel = isPending
    ? "Creating…"
    : hasImport && totalQty > 0
      ? `Create & import ${totalQty} card${totalQty !== 1 ? "s" : ""}`
      : "Create deck";

  const isNameBlank = name.trim().length === 0;
  const canSubmit = !isNameBlank && !isPending;

  const statusText = isNameBlank
    ? "Add a deck name to continue"
    : hasImport && totalQty > 0
      ? `${matchedCount} matched · ${unresolvedCount} unresolved`
      : "You can edit everything later";

  function handleSubmit() {
    if (!canSubmit) return;
    setError(null);

    startTransition(async () => {
      try {
        let deckId: string;

        if (hasImport) {
          deckId = await createDeckWithImport({
            name: name.trim(),
            format,
            visibility,
            description: description.trim() || undefined,
            importText: pasteText,
          });
        } else {
          const fd = new FormData();
          fd.set("name", name.trim());
          fd.set("format", format);
          fd.set("visibility", visibility);
          if (description.trim()) fd.set("description", description.trim());
          deckId = await createDeck(fd);
        }

        router.push(`/deck/${deckId}`);
      } catch (err) {
        setError(
          getActionErrorMessage(err, "Failed to create deck. Please try again."),
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-7">
      {error && <FormError>{error}</FormError>}

      <MetadataFields
        name={name}
        onNameChange={setName}
        format={format}
        onFormatChange={setFormat}
      />

      <SourceTabs source={source} onSourceChange={setSource} />

      {source === "paste" && (
        <PastePanel
          text={pasteText}
          onTextChange={setPasteText}
          parseResult={parseResult}
        />
      )}
      {source === "file" && <FilePanel onText={setPasteText} />}
      {source === "url" && <UrlPanel />}

      <AdvancedOptions
        visibility={visibility}
        onVisibilityChange={setVisibility}
        description={description}
        onDescriptionChange={setDescription}
      />

      <div className="flex items-center gap-3 pt-4 border-t border-border">
        <span
          id="deck-create-status"
          aria-live={isNameBlank ? "polite" : undefined}
          className={`font-mono text-[10.5px] tracking-wide ${
            isNameBlank ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {statusText}
        </span>
        <span className="flex-1" />
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!canSubmit}
          aria-describedby="deck-create-status"
          onClick={handleSubmit}
          className="min-w-[140px]"
        >
          {ctaLabel}
        </Button>
      </div>
    </div>
  );
}
