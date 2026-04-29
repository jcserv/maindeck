"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ComponentProps } from "react";
import { fetchImageManifest, imageCache, prefetchImage, setImageCache, type PrefetchImage } from "./prefetch-image";

type LinkProps = ComponentProps<typeof NextLink> & {
  /**
   * Optional image manifest for the link destination. When provided the Link
   * wrapper populates its in-memory cache immediately — no round-trip to
   * /api/prefetch-images is needed. Pass this from server components that
   * already know which images the destination page will render.
   */
  prefetchManifest?: PrefetchImage[];
};

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

type IntersectionCallback = (isIntersecting: boolean) => void;
const observerCallbacks = new Map<Element, IntersectionCallback>();
let sharedObserver: IntersectionObserver | null = null;

function getSharedObserver(): IntersectionObserver {
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          observerCallbacks.get(entry.target)?.(entry.isIntersecting);
        }
      },
      { rootMargin: "0px", threshold: 0.1 },
    );
  }
  return sharedObserver;
}

export default function Link({ prefetchManifest, ...props }: LinkProps) {
  const router = useRouter();
  const ref = useRef<HTMLAnchorElement | null>(null);
  const hrefStr = String(props.href);

  useEffect(() => {
    if (prefetchManifest && prefetchManifest.length > 0) {
      setImageCache(hrefStr, prefetchManifest);
    }
  }, [hrefStr, prefetchManifest]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let prefetchTimeout: ReturnType<typeof setTimeout> | null = null;

    observerCallbacks.set(node, (isIntersecting) => {
      if (isIntersecting) {
        prefetchTimeout = setTimeout(async () => {
          router.prefetch(hrefStr);
          const images = await fetchImageManifest(hrefStr);
          setImageCache(hrefStr, images);
        }, 300);
      } else if (prefetchTimeout) {
        clearTimeout(prefetchTimeout);
        prefetchTimeout = null;
      }
    });

    getSharedObserver().observe(node);

    return () => {
      if (prefetchTimeout) clearTimeout(prefetchTimeout);
      getSharedObserver().unobserve(node);
      observerCallbacks.delete(node);
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
