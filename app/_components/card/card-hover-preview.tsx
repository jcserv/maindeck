"use client";

import type { ReactNode } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FlippableCardImage } from "@/app/_components/card/flippable-card-image";

interface CardHoverPreviewProps {
  name: string;
  imageUri: string | null;
  backImageUri?: string | null;
  /** The trigger content — typically the card name text. */
  children: ReactNode;
  /** Classes applied to the inline trigger element. */
  className?: string;
}

// MTG card art is 488×680; keep that aspect at a compact preview width.
const PREVIEW_WIDTH = 244;
const PREVIEW_HEIGHT = 340;

/**
 * Wraps inline content (a card name) so hovering it pops up the card image.
 * Reusable anywhere a card name is shown; degrades to plain `children` when no
 * image is available. Uses the same `openOnHover` Popover pattern as
 * {@link "../card/legality-badge.tsx"}.
 */
export function CardHoverPreview({
  name,
  imageUri,
  backImageUri,
  children,
  className,
}: CardHoverPreviewProps) {
  if (!imageUri) {
    return <span className={className}>{children}</span>;
  }

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={120}
        render={<span />}
        nativeButton={false}
        className={className}
      >
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-[244px] overflow-hidden rounded-xl p-0">
        <FlippableCardImage
          frontUrl={imageUri}
          backUrl={backImageUri}
          alt={name}
          width={PREVIEW_WIDTH}
          height={PREVIEW_HEIGHT}
          className="h-auto w-full"
        />
      </PopoverContent>
    </Popover>
  );
}
