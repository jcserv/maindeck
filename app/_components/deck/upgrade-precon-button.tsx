"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import Link from "@/app/_components/link";
import { upgradePrecon } from "@/app/_actions/deck/upgrade-precon";

interface UpgradePreconButtonProps {
  deckId: string;
  /** Whether a session exists. Logged-out users get a sign-in redirect link. */
  isLoggedIn: boolean;
  /** When true, the button auto-runs the upgrade on mount (post sign-in). */
  autoRun?: boolean;
}

export function UpgradePreconButton({
  deckId,
  isLoggedIn,
  autoRun = false,
}: UpgradePreconButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const hasAutoRun = useRef(false);

  function handleUpgrade() {
    startTransition(async () => {
      const { id } = await upgradePrecon(deckId);
      router.push(`/deck/${id}`);
    });
  }

  useEffect(() => {
    if (autoRun && isLoggedIn && !hasAutoRun.current) {
      hasAutoRun.current = true;
      handleUpgrade();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, isLoggedIn]);

  if (!isLoggedIn) {
    const next = `/deck/${deckId}?upgrade=1`;
    return (
      <Link
        href={`/sign-in?next=${encodeURIComponent(next)}`}
        className={buttonVariants({ variant: "default", size: "sm" })}
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        Upgrade this precon
      </Link>
    );
  }

  return (
    <Button
      type="button"
      variant="default"
      size="sm"
      disabled={isPending}
      onClick={handleUpgrade}
    >
      <Sparkles className="h-3.5 w-3.5" aria-hidden />
      {isPending ? "Upgrading..." : "Upgrade this precon"}
    </Button>
  );
}
