import { Globe, Lock, Link2 } from "lucide-react";
import Image from "next/image";
import Link from "@/app/_components/link";
import { type PrefetchImage } from "@/app/_components/prefetch-image";
import { type Format, type Visibility } from "@/lib/generated/prisma/enums";

interface DeckCardPreviewProps {
  id: string;
  name: string;
  format: Format;
  visibility: Visibility;
  cardCount: number;
  updatedAt: Date | string;
  /** Up to 3 printing image URIs for the card fan in grid mode. */
  previewImages?: string[];
}

function formatLabel(format: Format): string {
  return format.charAt(0) + format.slice(1).toLowerCase();
}

function VisibilityIcon({ visibility }: { visibility: Visibility }) {
  if (visibility === "PRIVATE") {
    return <Lock className="h-3.5 w-3.5" aria-label="Private" />;
  }
  if (visibility === "UNLISTED") {
    return <Link2 className="h-3.5 w-3.5" aria-label="Unlisted" />;
  }
  return <Globe className="h-3.5 w-3.5" aria-label="Public" />;
}

function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

/**
 * Build a PrefetchImage manifest from raw Scryfall image URIs so the Link
 * wrapper can warm its in-memory cache without hitting /api/prefetch-images.
 * The entries carry only `src`; srcset is intentionally empty because we
 * don't know the exact Next.js optimised sizes the destination page uses.
 * prefetchImage() deduplicates on src when srcset is absent.
 */
function buildManifest(images: string[]): PrefetchImage[] {
  return images.map((src) => ({
    src,
    srcset: "",
    sizes: "",
    alt: "",
    loading: "eager",
  }));
}

/**
 * 3-card fan: the hero image (index 0 — commander or most-copied card) sits in
 * the front/middle; secondary images fan out behind to the left and right.
 */
function CardFan({ images }: { images: string[] }) {
  // Map fan positions (left, middle, right) to the images array. The hero
  // image is always the middle card. Placeholders fill unused slots so the
  // fan keeps its shape even for 1- or 2-card decks.
  const positions = [
    { src: images[1], rotate: -8, translateY: 4, zIndex: 1, marginLeft: -28 },
    { src: images[0], rotate: 0, translateY: 0, zIndex: 3, marginLeft: 0 },
    { src: images[2], rotate: 8, translateY: 4, zIndex: 1, marginLeft: 28 },
  ];

  return (
    <div
      className="relative flex items-center justify-center min-h-[100px] py-2"
      aria-hidden
    >
      {positions.map((p, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            transform: `rotate(${p.rotate}deg) translateY(${p.translateY}px)`,
            zIndex: p.zIndex,
            marginLeft: p.marginLeft,
          }}
        >
          {p.src ? (
            <Image
              src={p.src}
              alt=""
              width={70}
              height={98}
              className="rounded shadow-sm object-cover"
              sizes="70px"
            />
          ) : (
            <div className="w-[70px] h-[98px] rounded bg-muted border border-border" />
          )}
        </div>
      ))}
    </div>
  );
}

export function DeckCardPreview({
  id,
  name,
  format,
  visibility,
  cardCount,
  updatedAt,
  previewImages,
}: DeckCardPreviewProps) {
  const showFan = previewImages !== undefined;

  const manifest = previewImages && previewImages.length > 0
    ? buildManifest(previewImages)
    : undefined;

  return (
    <Link
      href={`/deck/${id}`}
      prefetchManifest={manifest}
      className="group flex flex-col gap-2 rounded-xl border bg-card p-4 transition-colors hover:bg-accent min-h-[120px]"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium leading-tight line-clamp-2 group-hover:text-foreground">
          {name}
        </h3>
        <span className="text-muted-foreground mt-0.5 shrink-0">
          <VisibilityIcon visibility={visibility} />
        </span>
      </div>

      {showFan && <CardFan images={previewImages ?? []} />}

      <div className="flex items-center gap-2 flex-wrap mt-auto">
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {formatLabel(format)}
        </span>
        <span className="text-xs text-muted-foreground">
          {cardCount} card{cardCount !== 1 ? "s" : ""}
        </span>
        <span className="text-xs text-muted-foreground ml-auto">
          {timeAgo(updatedAt)}
        </span>
      </div>
    </Link>
  );
}
