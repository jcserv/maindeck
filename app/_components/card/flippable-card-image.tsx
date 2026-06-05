"use client";

import { useState } from "react";
import Image, { type ImageProps } from "next/image";
import { FlipHorizontal2 } from "lucide-react";
import { cn } from "@/lib/utils";

type SharedImageProps = {
  alt: string;
  sizes?: string;
  quality?: number;
  priority?: boolean;
  className?: string;
  fill?: boolean;
  width?: number;
  height?: number;
  /** Skip the Next image optimizer — for already-sized CDN images swapped often (e.g. the deck preview). */
  unoptimized?: boolean;
};

interface FlippableCardImageProps extends SharedImageProps {
  frontUrl: string;
  backUrl?: string | null | undefined;
  /** Extra classes for the outer aspect-ratio wrapper. */
  containerClassName?: string;
  /** Children rendered above the front face (e.g. foil overlays). */
  frontOverlay?: React.ReactNode;
}

function buildImageProps(
  shared: SharedImageProps,
  src: string,
  alt: string,
): ImageProps {
  const dims: { fill: true } | { width: number; height: number } = shared.fill
    ? { fill: true }
    : { width: shared.width!, height: shared.height! };
  return {
    src,
    alt,
    ...dims,
    ...(shared.sizes !== undefined && { sizes: shared.sizes }),
    ...(shared.quality !== undefined && { quality: shared.quality }),
    ...(shared.priority !== undefined && { priority: shared.priority }),
    ...(shared.className !== undefined && { className: shared.className }),
    ...(shared.unoptimized !== undefined && { unoptimized: shared.unoptimized }),
  } as ImageProps;
}

export function FlippableCardImage({
  frontUrl,
  backUrl,
  containerClassName,
  frontOverlay,
  ...shared
}: FlippableCardImageProps) {
  const [flipped, setFlipped] = useState(false);

  // Reset flip state when the image source changes (e.g. switching printings).
  // Use the "derived state from props" pattern instead of useEffect to avoid
  // a render-then-correct cycle.
  const [prevKey, setPrevKey] = useState(`${frontUrl}|${backUrl ?? ""}`);
  const nextKey = `${frontUrl}|${backUrl ?? ""}`;
  if (nextKey !== prevKey) {
    setPrevKey(nextKey);
    setFlipped(false);
  }

  if (!backUrl) {
    const imgProps = buildImageProps(shared, frontUrl, shared.alt);
    return (
      <div className={cn("relative", containerClassName)}>
        <Image {...imgProps} alt={shared.alt} />
        {frontOverlay}
      </div>
    );
  }

  const frontProps = buildImageProps(shared, frontUrl, shared.alt);
  const backAlt = `${shared.alt} (back face)`;
  const backProps = buildImageProps(shared, backUrl, backAlt);

  return (
    <div
      className={cn("relative", containerClassName)}
      style={{ perspective: "1200px" }}
    >
      <div
        className="absolute inset-0 transition-transform duration-500"
        style={{
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* Front face */}
        <div
          className="absolute inset-0"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
          }}
        >
          <Image {...frontProps} alt={shared.alt} />
          {frontOverlay}
        </div>

        {/* Back face */}
        <div
          className="absolute inset-0"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <Image {...backProps} alt={backAlt} />
        </div>
      </div>

      <button
        type="button"
        aria-label={flipped ? "Show front face" : "Show back face"}
        aria-pressed={flipped}
        onClick={(e) => {
          e.stopPropagation();
          setFlipped((f) => !f);
        }}
        className="absolute top-2 right-2 z-10 inline-flex items-center justify-center size-8 rounded-full bg-black/70 text-white hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shadow-md"
      >
        <FlipHorizontal2 className="size-4" aria-hidden />
      </button>
    </div>
  );
}
