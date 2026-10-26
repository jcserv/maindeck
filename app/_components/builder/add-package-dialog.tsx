"use client";

import { useState, useTransition, type ReactElement } from "react";
import { AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { getActionErrorMessage } from "@/lib/telemetry";
import { cn } from "@/lib/utils";
import Link from "@/app/_components/link";
import {
  applyPackageToDeck,
  listMyPackages,
} from "@/app/_actions/deck/packages";
import type { PackageSummary } from "@/lib/deck/package-queries";

interface AddPackageDialogProps {
  deckId: string;
  trigger: ReactElement;
}

type ApplyResult = { name: string; added: number; skipped: string[] };

export function AddPackageDialog({ deckId, trigger }: AddPackageDialogProps) {
  const [open, setOpen] = useState(false);
  const [packages, setPackages] = useState<PackageSummary[] | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [isLoading, startLoad] = useTransition();
  const [, startApply] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setResult(null);
    setError(null);
    startLoad(async () => {
      try {
        const all = await listMyPackages();
        setPackages(all.filter((p) => p.id !== deckId));
      } catch (err) {
        setError(getActionErrorMessage(err, "Could not load packages."));
      }
    });
  }

  function handleApply(pkg: PackageSummary) {
    setError(null);
    setResult(null);
    setApplyingId(pkg.id);
    startApply(async () => {
      try {
        const { added, skipped } = await applyPackageToDeck(deckId, pkg.id);
        setResult({ name: pkg.name, added, skipped });
      } catch (err) {
        setError(getActionErrorMessage(err, "Could not add package."));
      } finally {
        setApplyingId(null);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-md sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add package</DialogTitle>
          <DialogDescription>
            Copy a package&apos;s cards into this deck, keeping their
            categories. Cards already in the deck are skipped.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden />
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && <ApplyResultNotice result={result} />}

        <PackageList
          packages={packages}
          isLoading={isLoading}
          applyingId={applyingId}
          onApply={handleApply}
        />

        <DialogFooter>
          <Link
            href="/packages"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Manage packages
          </Link>
          <Button type="button" size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApplyResultNotice({ result }: { result: ApplyResult }) {
  return (
    <p role="status" className="text-sm text-muted-foreground">
      {result.added > 0
        ? `Added ${result.added} card${result.added !== 1 ? "s" : ""} from ${result.name}.`
        : `Nothing new to add from ${result.name}.`}
      {result.skipped.length > 0 &&
        ` Skipped ${result.skipped.length} already in the deck: ${result.skipped.join(", ")}.`}
    </p>
  );
}

function PackageList({
  packages,
  isLoading,
  applyingId,
  onApply,
}: {
  packages: PackageSummary[] | null;
  isLoading: boolean;
  applyingId: string | null;
  onApply: (pkg: PackageSummary) => void;
}) {
  if (isLoading || packages === null) {
    return (
      <div className="flex flex-col gap-2" aria-busy>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[44px] rounded-md bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (packages.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No packages yet. Build reusable card lists like staples or a ramp suite
        under{" "}
        <Link href="/packages" className="underline hover:text-foreground">
          Packages
        </Link>
        .
      </p>
    );
  }

  return (
    <ul className="flex max-h-[320px] flex-col divide-y overflow-y-auto rounded-md border">
      {packages.map((pkg) => (
        <li
          key={pkg.id}
          className="flex items-center justify-between gap-3 px-3 py-2"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{pkg.name}</p>
            <p className="text-xs text-muted-foreground">
              {pkg.cardCount} card{pkg.cardCount !== 1 ? "s" : ""}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={applyingId !== null || pkg.cardCount === 0}
            onClick={() => onApply(pkg)}
            aria-label={`Add ${pkg.name} to deck`}
          >
            {applyingId === pkg.id ? "Adding…" : "Add"}
          </Button>
        </li>
      ))}
    </ul>
  );
}
