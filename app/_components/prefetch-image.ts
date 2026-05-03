export type PrefetchImage = {
  srcset: string;
  sizes: string;
  src: string;
  alt: string;
  loading: string;
};

const LRU_CAP = 100;

function lruSet<K, V>(map: Map<K, V>, key: K, value: V): void {
  if (map.has(key)) map.delete(key);
  else if (map.size >= LRU_CAP) map.delete(map.keys().next().value as K);
  map.set(key, value);
}

function lruSetStr(set: Map<string, true>, key: string): void {
  // Caller (`prefetchImage`) already filters duplicates, so this guard is
  // defensive only.
  /* c8 ignore next */
  if (set.has(key)) return;
  if (set.size >= LRU_CAP) set.delete(set.keys().next().value as string);
  set.set(key, true);
}

const seen = new Map<string, true>();
export const imageCache = new Map<string, PrefetchImage[]>();

export function setImageCache(href: string, images: PrefetchImage[]): void {
  lruSet(imageCache, href, images);
}

export function prefetchImage(image: PrefetchImage) {
  if (image.loading === "lazy") return;
  // Deduplicate: prefer srcset as the key, fall back to src for manifest
  // entries that carry only a raw URL (no Next.js-generated srcset).
  const dedupeKey = image.srcset || image.src;
  if (!dedupeKey || seen.has(dedupeKey)) return;
  lruSetStr(seen, dedupeKey);
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
    lruSet(imageCache, href, data.images);
    return data.images;
  } catch {
    return [];
  }
}
