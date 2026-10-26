"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getActionErrorMessage } from "@/lib/telemetry";
import { DECK_NAME_MAX } from "@/lib/deck/constants";
import { createPackage } from "@/app/_actions/deck/packages";

export function NewPackageForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      try {
        const id = await createPackage(trimmed);
        router.push(`/packages/${id}`);
      } catch (err) {
        setError(getActionErrorMessage(err, "Could not create package."));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New package, e.g. Staples"
          aria-label="Package name"
          maxLength={DECK_NAME_MAX}
          className="h-8 w-56"
          disabled={pending}
        />
        <Button type="submit" size="sm" disabled={pending || !name.trim()}>
          <Plus className="h-4 w-4" aria-hidden />
          {pending ? "Creating…" : "Create"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
