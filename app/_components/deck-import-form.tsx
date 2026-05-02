"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { TypeaheadTextarea } from "@/app/_components/typeahead-textarea";
import { importDeck, type ImportResult } from "@/app/_actions/deck/import";
import { getActionErrorMessage } from "@/lib/telemetry";
import { Button } from "@/components/ui/button";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { CardSearchResult } from "@/lib/search/card-search";

interface DeckImportFormProps {
  deckId: string;
}

async function fetchSuggestions(q: string): Promise<string[]> {
  if (!q.trim()) return [];
  const res = await fetch(`/api/cards/search?q=${encodeURIComponent(q.trim())}`);
  if (!res.ok) return [];
  const data = (await res.json()) as CardSearchResult[];
  return Array.isArray(data) ? data.map((c) => c.name) : [];
}

function detectFormatHint(input: string): string {
  const trimmed = input.trimStart();
  if (!trimmed) return "Paste a decklist to begin";
  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<")) return "DEK (XML)";
  if (/^deck\s*$/im.test(trimmed)) return "Arena format";
  return "Plain text";
}

export function DeckImportForm({ deckId }: DeckImportFormProps) {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const formatHint = detectFormatHint(value);
  const lineCount = value ? value.split("\n").filter((l) => l.trim()).length : 0;

  function handleImport() {
    if (!value.trim()) return;
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const res = await importDeck(deckId, value);
        setResult(res);
        if (res.added > 0 && res.unmatchedCount === 0 && res.warnings.length === 0) {
          // Clear input on clean success so the user can paste another list
          setValue("");
        }
      } catch (err) {
        setError(getActionErrorMessage(err, "Import failed. Please try again."));
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="import-input" className="text-sm font-medium">
          Decklist
        </label>
        <TypeaheadTextarea
          id="import-input"
          suggest={fetchSuggestions}
          value={value}
          onChange={setValue}
          placeholder={`4 Lightning Bolt\n2 Counterspell\n\n// Sideboard\n1 Force of Will`}
          disabled={isPending}
          rows={12}
          className="font-mono text-sm min-h-[280px]"
          aria-label="Paste decklist"
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatHint}</span>
          <span>
            {lineCount} line{lineCount !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setValue("");
            setResult(null);
            setError(null);
          }}
          disabled={isPending || !value}
        >
          Clear
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleImport}
          disabled={isPending || !value.trim()}
        >
          {isPending ? "Importing…" : "Import"}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Import failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && (
        <Alert variant={result.unmatchedCount > 0 ? "default" : "default"}>
          {result.unmatchedCount === 0 && result.warnings.length === 0 ? (
            <CheckCircle2 />
          ) : (
            <AlertCircle />
          )}
          <AlertTitle>
            {result.added > 0
              ? `Imported ${result.added} card${result.added !== 1 ? "s" : ""}`
              : "No cards imported"}
          </AlertTitle>
          <AlertDescription>
            <div className="flex flex-col gap-2">
              {result.warnings.length > 0 && (
                <ul className="list-disc pl-4">
                  {result.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              {result.unmatchedCount > 0 && (
                <Accordion>
                  <AccordionItem value="unmatched">
                    <AccordionTrigger>
                      {result.unmatchedCount} card name
                      {result.unmatchedCount !== 1 ? "s" : ""} couldn&apos;t be matched
                    </AccordionTrigger>
                    <AccordionContent>
                      <ul className="font-mono text-xs flex flex-col gap-0.5">
                        {result.unmatchedNames.map((name) => (
                          <li key={name}>{name}</li>
                        ))}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
              {result.added > 0 && (
                <p>
                  <a href={`/deck/${deckId}`} className="underline">
                    View deck →
                  </a>
                </p>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
