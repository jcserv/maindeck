"use client";

import Image, { getImageProps } from "next/image";
import { useEffect } from "react";
import Link from "./link";
import { Chip } from "@/components/ui/chip";

type CardTileProps = {
  id: string;
  name: string;
  thumbnailUrl: string;
  heroUrl: string;
  href: string;
  gameChanger?: boolean;
};

const THUMB_W = 244;
const THUMB_H = 340;
const HERO_W = 488;
const HERO_H = 680;

export default function CardTile({
  name,
  thumbnailUrl,
  heroUrl,
  href,
  gameChanger,
}: CardTileProps) {
  const heroProps = getImageProps({
    width: HERO_W,
    height: HERO_H,
    quality: 80,
    src: heroUrl,
    alt: name,
  });

  useEffect(() => {
    const { sizes, srcSet, src } = heroProps.props;
    const img = new window.Image();
    img.fetchPriority = "low";
    img.decoding = "async";
    if (sizes) img.sizes = sizes;
    if (srcSet) img.srcset = srcSet;
    if (src) img.src = src;
  }, [heroProps]);

  return (
    <Link href={href} className="relative block">
      <Image
        src={thumbnailUrl}
        alt={name}
        width={THUMB_W}
        height={THUMB_H}
        quality={65}
        className="rounded-md"
      />
      {gameChanger && (
        <Chip
          tone="accent"
          size="sm"
          className="absolute top-1.5 left-1.5 shadow-sm"
          title="Game Changer"
        >
          GC
        </Chip>
      )}
    </Link>
  );
}
