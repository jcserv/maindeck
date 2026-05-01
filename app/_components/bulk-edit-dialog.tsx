"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactElement,
} from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Kbd } from "@/components/ui/kbd";
import { detectFormat, parseDecklist } from "@/lib/deck-io/parse";
import {
  bulkReplaceDeck,
  type BulkReplaceResult,
} from "@/lib/deck/bulk-edit-action";
import { getActionErrorMessage } from "@/lib/telemetry";
import { registerDeckAction } from "@/app/_components/hotkeys/deck-actions-bus";

interface BulkEditDialogProps {
  deckId: string;
  initialText: string;
  trigger: ReactElement;
}

export function BulkEditDialog({
  deckId,
  initialText,
  trigger,
}: BulkEditDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(initialText);
  const [result, setResult] = useState<BulkReplaceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const summary = useMemo(() => {
    const parsed = parseDecklist(text, detectFormat(text));
    const total = parsed.cards.reduce((acc, c) => acc + c.quantity, 0);
    return {
      total,
      unmatchedLines: parsed.unmatchedLines.length,
    };
  }, [text]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setText(initialText);
      setResult(null);
      setError(null);
    }
  }

  function handleSave() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const res = await bulkReplaceDeck(deckId, text);
        setResult(res);
        router.refresh();
        if (res.unmatchedNames.length === 0 && res.warnings.length === 0) {
          setOpen(false);
        }
      } catch (err) {
        setError(getActionErrorMessage(err, "Save failed. Please try again."));
      }
    });
  }

  useEffect(() => registerDeckAction("bulk-edit", () => setOpen(true)), []);

  useHotkeys(
    "mod+enter",
    (event) => {
      event.preventDefault();
      handleSave();
    },
    { enabled: open, enableOnFormTags: ["TEXTAREA", "INPUT"] },
    [text, deckId, open],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-3xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bulk edit decklist</DialogTitle>
          <DialogDescription>
            Edit the entire deck as text. Use{" "}
            <code className="font-mono text-xs">{"// Mainboard"}</code>,{" "}
            <code className="font-mono text-xs">{"// Sideboard"}</code>,{" "}
            <code className="font-mono text-xs">{"// Considering"}</code>, and{" "}
            <code className="font-mono text-xs">{"// Commander"}</code> to mark
            zones. Printings and subcategories are preserved for cards that
            stay in the deck.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          disabled={isPending}
          className="font-mono text-xs min-h-[480px] max-h-[60vh] overflow-auto"
          aria-label="Decklist text"
        />

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {summary.total} card{summary.total !== 1 ? "s" : ""} parsed
            {summary.unmatchedLines > 0
              ? ` · ${summary.unmatchedLines} unrecognized line${summary.unmatchedLines !== 1 ? "s" : ""}`
              : ""}
          </span>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Save failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <Alert>
            {result.unmatchedNames.length === 0 && result.warnings.length === 0 ? (
              <CheckCircle2 />
            ) : (
              <AlertCircle />
            )}
            <AlertTitle>
              Saved — added {result.added}, removed {result.removed}, updated{" "}
              {result.updated}
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
                {result.unmatchedNames.length > 0 && (
                  <div>
                    <p className="mb-1">
                      {result.unmatchedNames.length} unmatched card
                      {result.unmatchedNames.length !== 1 ? "s" : ""} skipped:
                    </p>
                    <ul className="font-mono text-xs flex flex-col gap-0.5 pl-2">
                      {result.unmatchedNames.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isPending}
          >
            {isPending ? "Saving…" : "Save"}
            {!isPending && (
              <span className="ml-1.5 inline-flex items-center gap-0.5">
                <Kbd>⌘</Kbd>
                <Kbd>⏎</Kbd>
              </span>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
