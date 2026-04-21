"use client";

import { useState, type ReactElement } from "react";
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
import { cn } from "@/lib/utils";

type Format = "text" | "arena" | "json";

interface ExportDialogProps {
  deckName: string;
  exports: {
    text: string;
    arena: string;
    json: string;
  };
  trigger: ReactElement;
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

export function ExportDialog({ deckName, exports, trigger }: ExportDialogProps) {
  const [format, setFormat] = useState<Format>("text");
  const [copied, setCopied] = useState(false);

  const content = exports[format];

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
    const slug = deckName
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

  return (
    <Dialog>
      <DialogTrigger render={trigger} />
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
                "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors min-h-9",
                format === f
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {FORMAT_LABELS[f]}
            </button>
          ))}
        </div>

        <pre
          className="font-mono text-xs bg-muted/40 border rounded-lg p-3 max-h-[360px] overflow-auto whitespace-pre-wrap break-words"
          aria-label="Export preview"
        >
          {content || (
            <span className="text-muted-foreground italic">Empty deck</span>
          )}
        </pre>

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={!content}
          >
            <Download className="h-4 w-4" aria-hidden />
            Download
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleCopy}
            disabled={!content}
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
