"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FabProps {
  onClick: () => void;
  className?: string;
}

export function Fab({ onClick, className }: FabProps) {
  return (
    <Button
      onClick={onClick}
      className={cn(
        "h-14 px-6 rounded-full shadow-lg text-sm font-semibold",
        className,
      )}
    >
      Next Turn
    </Button>
  );
}
