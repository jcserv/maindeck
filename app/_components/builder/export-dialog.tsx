"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { Check, Copy, Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { stripCommentHeaders } from "@/lib/deck/io/serialize";
import { getDeckExports, type DeckExports } from "@/app/_actions/deck/export";
import { registerDeckAction } from "@/app/_components/hotkeys/deck-actions-bus";
import { ZONE_ORDER, ZONE_LABEL } from "@/lib/deck/io/adapters/_shared";
import type { Zone } from "@/lib/generated/prisma/enums";

type Format = "text" | "arena" | "json";

interface ExportDialogProps {
  deckId: string;
  deckName: string;
  trigger?: ReactElement;
}

const FORMAT_LABELS: Record<Format, string> = {
  text: "Plain Text",
  arena: "Arena",
  json: "JSON",
};

const FORMAT_EXTENSIONS: Record<Format, string> = {
  text: "txt",
  arena: "txt",
  json: "json",
};

const FORMAT_MIME: Record<Format, string> = {
  text: "text/plain",
  arena: "text/plain",
  json: "application/json",
};

export function ExportDialog({ deckId, deckName, trigger }: ExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<Format>("text");
  const [copied, setCopied] = useState(false);
  const [exports, setExports] = useState<DeckExports | null>(null);
  const [loading, setLoading] = useState(false);
  const [stripHeaders, setStripHeaders] = useState(false);
  const [selectedZones, setSelectedZones] = useState<Zone[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const refreshCounterRef = useRef(0);

  async function refreshExports(zones: Zone[], categories: string[]) {
    const id = ++refreshCounterRef.current;
    setLoading(true);
    try {
      const result = await getDeckExports(deckId, { zones, categories });
      if (id !== refreshCounterRef.current) return;
      setExports((prev) =>
        prev
          ? {
              ...prev,
              text: result.text,
              arena: result.arena,
              json: result.json,
            }
          : result,
      );
    } finally {
      if (id === refreshCounterRef.current) setLoading(false);
    }
  }

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setStripHeaders(false);
    if (!next || exports !== null) return;
    setLoading(true);
    try {
      const result = await getDeckExports(deckId);
      setExports(result);
      setSelectedZones(result.availableZones);
      setSelectedCategories(result.availableCategories);
    } finally {
      setLoading(false);
    }
  }

  function handleZoneToggle(zone: Zone, checked: boolean) {
    const next = checked
      ? [...selectedZones, zone]
      : selectedZones.filter((z) => z !== zone);
    setSelectedZones(next);
    refreshExports(next, selectedCategories).catch(console.error);
  }

  function handleCategoryToggle(cat: string, checked: boolean) {
    const next = checked
      ? [...selectedCategories, cat]
      : selectedCategories.filter((c) => c !== cat);
    setSelectedCategories(next);
    refreshExports(selectedZones, next).catch(console.error);
  }

  const raw = exports?.[format] ?? "";
  const content =
    format === "text" && stripHeaders ? stripCommentHeaders(raw) : raw;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be blocked; ignore
    }
  }

  function handleDownload() {
    const slug =
      deckName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "deck";
    const blob = new Blob([content], { type: FORMAT_MIME[format] });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}.${FORMAT_EXTENSIONS[format]}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    return registerDeckAction("export", () => {
      void handleOpenChange(true);
    });
    // handleOpenChange depends on `exports` state — re-registering each render
    // keeps the closure fresh.
  });

  const availableZones = exports?.availableZones ?? [];
  const availableCategories = exports?.availableCategories ?? [];
  const mainboardSelected = selectedZones.includes("MAINBOARD");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent className="max-w-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export deck</DialogTitle>
          <DialogDescription>
            Copy or download the decklist in your preferred format.
          </DialogDescription>
        </DialogHeader>

        <div
          role="tablist"
          aria-label="Export format"
          className="flex gap-1 rounded-lg bg-muted p-1"
        >
          {(Object.keys(FORMAT_LABELS) as Format[]).map((f) => (
            <button
              key={f}
              role="tab"
              type="button"
              aria-selected={format === f}
              onClick={() => setFormat(f)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors min-h-9 inline-flex items-center justify-center gap-1.5",
                format === f
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {FORMAT_LABELS[f]}
            </button>
          ))}
        </div>

        {availableZones.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-sm text-muted-foreground">Zones:</span>
              {ZONE_ORDER.filter((z) => availableZones.includes(z)).map(
                (zone) => (
                  <label key={zone} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selectedZones.includes(zone)}
                      onCheckedChange={(c) =>
                        handleZoneToggle(zone, c === true)
                      }
                    />
                    {ZONE_LABEL[zone]}
                  </label>
                ),
              )}
            </div>

            {mainboardSelected && availableCategories.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-sm text-muted-foreground">
                  Categories:
                </span>
                {availableCategories.map((cat) => (
                  <label key={cat} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selectedCategories.includes(cat)}
                      onCheckedChange={(c) =>
                        handleCategoryToggle(cat, c === true)
                      }
                    />
                    {cat}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {format === "text" && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={stripHeaders}
              onCheckedChange={(c) => setStripHeaders(c === true)}
            />
            Exclude comment headers
          </label>
        )}

        <pre
          className="font-mono text-xs bg-muted/40 border rounded-lg p-3 max-h-[360px] overflow-auto whitespace-pre-wrap break-words"
          aria-label="Export preview"
        >
          {loading ? (
            <span className="text-muted-foreground italic">Loading…</span>
          ) : content ? (
            content
          ) : (
            <span className="text-muted-foreground italic">Empty deck</span>
          )}
        </pre>

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={!content || loading}
          >
            <Download className="h-4 w-4" aria-hidden />
            Download
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleCopy}
            disabled={!content || loading}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" aria-hidden />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" aria-hidden />
                Copy
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
