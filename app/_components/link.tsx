"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ComponentProps } from "react";
import { fetchImageManifest, imageCache, prefetchImage } from "./prefetch-image";

type LinkProps = ComponentProps<typeof NextLink>;

function isPlainLeftClick(e: React.MouseEvent) {
  return (
    e.button === 0 &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.shiftKey &&
    !e.altKey
  );
}

function isSameOrigin(href: string) {
  if (typeof window === "undefined") return true;
  if (href.startsWith("/")) return true;
  try {
    return new URL(href, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

export default function Link(props: LinkProps) {
  const router = useRouter();
  const ref = useRef<HTMLAnchorElement | null>(null);
  const hrefStr = String(props.href);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let prefetchTimeout: ReturnType<typeof setTimeout> | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          prefetchTimeout = setTimeout(async () => {
            router.prefetch(hrefStr);
            const images = await fetchImageManifest(hrefStr);
            imageCache.set(hrefStr, images);
          }, 300);
        } else if (prefetchTimeout) {
          clearTimeout(prefetchTimeout);
          prefetchTimeout = null;
        }
      },
      { rootMargin: "0px", threshold: 0.1 },
    );

    observer.observe(node);
    return () => {
      if (prefetchTimeout) clearTimeout(prefetchTimeout);
      observer.disconnect();
    };
  }, [hrefStr, router]);

  return (
    <NextLink
      {...props}
      ref={ref}
      prefetch={false}
      onMouseEnter={(e) => {
        props.onMouseEnter?.(e);
        router.prefetch(hrefStr);
        const images = imageCache.get(hrefStr) ?? [];
        for (const image of images) prefetchImage(image);
      }}
      onMouseDown={(e) => {
        props.onMouseDown?.(e);
        if (e.defaultPrevented) return;
        if (isSameOrigin(hrefStr) && isPlainLeftClick(e)) {
          e.preventDefault();
          router.push(hrefStr);
        }
      }}
    />
  );
}
