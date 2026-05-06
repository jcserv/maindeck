"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { GitFork } from "lucide-react";
import { Button } from "@/components/ui/button";
import { duplicateDeck } from "@/app/_actions/deck/duplicate";

interface DuplicateDeckButtonProps {
  deckId: string;
}

export function DuplicateDeckButton({ deckId }: DuplicateDeckButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDuplicate() {
    startTransition(async () => {
      const { id } = await duplicateDeck(deckId);
      router.push(`/deck/${id}`);
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={handleDuplicate}
    >
      <GitFork className="h-3.5 w-3.5" aria-hidden />
      {isPending ? "Forking..." : "Fork"}
    </Button>
  );
}
