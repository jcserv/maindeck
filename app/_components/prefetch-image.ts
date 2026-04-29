export type PrefetchImage = {
  srcset: string;
  sizes: string;
  src: string;
  alt: string;
  loading: string;
};

export const seen = new Set<string>();
export const imageCache = new Map<string, PrefetchImage[]>();

export function prefetchImage(image: PrefetchImage) {
  if (image.loading === "lazy") return;
  // Deduplicate: prefer srcset as the key, fall back to src for manifest
  // entries that carry only a raw URL (no Next.js-generated srcset).
  const dedupeKey = image.srcset || image.src;
  if (!dedupeKey || seen.has(dedupeKey)) return;
  seen.add(dedupeKey);
  const img = new Image();
  img.decoding = "async";
  img.fetchPriority = "low";
  img.sizes = image.sizes;
  img.srcset = image.srcset;
  img.src = image.src;
  img.alt = image.alt;
}

export async function fetchImageManifest(href: string): Promise<PrefetchImage[]> {
  const cached = imageCache.get(href);
  if (cached) return cached;
  try {
    const res = await fetch(`/api/prefetch-images${href.startsWith("/") ? href : `/${href}`}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { images: PrefetchImage[] };
    imageCache.set(href, data.images);
    return data.images;
  } catch {
    return [];
  }
}
