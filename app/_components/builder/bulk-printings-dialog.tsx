"use client";

import { useState, useTransition, type ReactElement } from "react";
import { AlertCircle, CheckCircle2, Coins, Gem, Globe } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  bulkReselectPrintings,
  type BulkReselectPrintingsResult,
} from "@/app/_actions/deck/bulk-printings";
import type { PrintingHeuristic } from "@/lib/card/printing-heuristics";
import { getActionErrorMessage } from "@/lib/telemetry";

interface BulkPrintingsDialogProps {
  deckId: string;
  trigger: ReactElement;
}

const OPTIONS: {
  heuristic: PrintingHeuristic;
  label: string;
  description: string;
  Icon: typeof Coins;
}[] = [
  {
    heuristic: "cheapest",
    label: "Cheapest printings",
    description: "Pin the lowest-priced printing of each card.",
    Icon: Coins,
  },
  {
    heuristic: "most-expensive",
    label: "Most expensive printings",
    description: "Pin the highest-priced printing of each card.",
    Icon: Gem,
  },
  {
    heuristic: "no-universes-beyond",
    label: "No Universes Beyond",
    description: "Swap Universes Beyond printings for in-universe ones.",
    Icon: Globe,
  },
];

export function BulkPrintingsDialog({
  deckId,
  trigger,
}: BulkPrintingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<BulkReselectPrintingsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PrintingHeuristic | null>(null);
  const [, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setResult(null);
      setError(null);
      setPending(null);
    }
  }

  function handleApply(heuristic: PrintingHeuristic) {
    setError(null);
    setResult(null);
    setPending(heuristic);
    startTransition(async () => {
      try {
        const res = await bulkReselectPrintings(deckId, heuristic);
        setResult(res);
      } catch (err) {
        setError(getActionErrorMessage(err, "Couldn't update printings. Please try again."));
      } finally {
        setPending(null);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk edit printings</DialogTitle>
          <DialogDescription>
            Reselect every card&apos;s printing by a heuristic. Cards with no
            matching alternative are left as-is.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {OPTIONS.map(({ heuristic, label, description, Icon }) => (
            <Button
              key={heuristic}
              type="button"
              variant="outline"
              className="h-auto justify-start gap-3 px-3 py-2.5 text-left"
              disabled={pending !== null}
              onClick={() => handleApply(heuristic)}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{label}</span>
                <span className="text-xs text-muted-foreground">
                  {pending === heuristic ? "Applying…" : description}
                </span>
              </span>
            </Button>
          ))}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Update failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <Alert>
            <CheckCircle2 />
            <AlertTitle>
              {result.changed === 0
                ? "No printings changed"
                : `Updated ${result.changed} of ${result.total} card${result.total !== 1 ? "s" : ""}`}
            </AlertTitle>
            <AlertDescription>
              {result.changed === 0
                ? "No card had an alternative printing matching that heuristic."
                : "The remaining cards had no matching alternative and were left unchanged."}
            </AlertDescription>
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}
