"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PlaytestState } from "../playtest-reducer";

interface FabProps {
  phase: PlaytestState["phase"];
  onClick: () => void;
  className?: string;
}

const PHASE_LABELS: Record<PlaytestState["phase"], string> = {
  untap: "Untap All",
  upkeep: "Upkeep",
  draw: "Draw",
  main: "Next Phase",
  end: "Next Turn",
};

export function Fab({ phase, onClick, className }: FabProps) {
  return (
    <Button
      onClick={onClick}
      className={cn(
        "h-14 px-6 rounded-full shadow-lg text-sm font-semibold",
        className,
      )}
    >
      {PHASE_LABELS[phase]}
    </Button>
  );
}
