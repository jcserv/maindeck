import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchImageManifest,
  imageCache,
  prefetchImage,
  setImageCache,
  type PrefetchImage,
} from "../prefetch-image";

function img(overrides: Partial<PrefetchImage> = {}): PrefetchImage {
  return {
    srcset: "",
    sizes: "",
    src: "",
    alt: "",
    loading: "eager",
    ...overrides,
  };
}

const realImage = window.Image;
const realFetch = window.fetch;

class StubImage {
  srcset = "";
  sizes = "";
  src = "";
  alt = "";
  decoding = "";
  fetchPriority = "";
}

beforeEach(() => {
  imageCache.clear();
  // Reset the internal `seen` LRU by re-importing — since prefetchImage's
  // dedupe set is module-private, we work around it by using unique srcsets
  // per test. (Tests below choose their srcsets defensively.)
  window.Image = StubImage as unknown as typeof Image;
});

afterEach(() => {
  window.Image = realImage;
  window.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("setImageCache", () => {
  it("stores entries by href", () => {
    setImageCache("/a", [img({ src: "x" })]);
    expect(imageCache.get("/a")).toEqual([img({ src: "x" })]);
  });

  it("evicts the oldest entry once the LRU cap is exceeded", () => {
    for (let i = 0; i < 100; i += 1) {
      setImageCache(`/k${i}`, [img({ src: `${i}` })]);
    }
    setImageCache("/overflow", [img({ src: "new" })]);
    expect(imageCache.has("/k0")).toBe(false);
    expect(imageCache.has("/overflow")).toBe(true);
  });

  it("re-inserting an existing key moves it to the most-recent position", () => {
    setImageCache("/a", [img({ src: "old" })]);
    for (let i = 0; i < 99; i += 1) {
      setImageCache(`/k${i}`, [img({ src: `${i}` })]);
    }
    // Re-insert /a, then add an overflow entry. /a should survive.
    setImageCache("/a", [img({ src: "fresh" })]);
    setImageCache("/overflow", [img({ src: "new" })]);
    expect(imageCache.has("/a")).toBe(true);
    expect(imageCache.get("/a")).toEqual([img({ src: "fresh" })]);
  });
});

describe("prefetchImage", () => {
  it("does nothing when loading is 'lazy'", () => {
    const ctor = vi.spyOn(window, "Image");
    prefetchImage(img({ loading: "lazy", src: "/lazy.webp" }));
    expect(ctor).not.toHaveBeenCalled();
  });

  it("does nothing when both src and srcset are empty", () => {
    const ctor = vi.spyOn(window, "Image");
    prefetchImage(img({ src: "", srcset: "" }));
    expect(ctor).not.toHaveBeenCalled();
  });

  it("constructs an Image with the provided fields", () => {
    const ctor = vi.spyOn(window, "Image");
    prefetchImage(
      img({
        srcset: "unique-srcset-1 1x",
        sizes: "100vw",
        src: "/x.webp",
        alt: "alt",
      }),
    );
    expect(ctor).toHaveBeenCalledTimes(1);
  });

  it("dedupes by srcset (same srcset → only constructs one Image)", () => {
    const ctor = vi.spyOn(window, "Image");
    const dup = img({ srcset: "unique-srcset-2 1x", src: "/a.webp" });
    prefetchImage(dup);
    prefetchImage(dup);
    expect(ctor).toHaveBeenCalledTimes(1);
  });

  it("falls back to src as the dedupe key when srcset is empty", () => {
    const ctor = vi.spyOn(window, "Image");
    prefetchImage(img({ srcset: "", src: "/unique-only-src.webp" }));
    prefetchImage(img({ srcset: "", src: "/unique-only-src.webp" }));
    expect(ctor).toHaveBeenCalledTimes(1);
  });

  it("evicts the oldest seen entry once the dedupe LRU cap is exceeded", () => {
    const ctor = vi.spyOn(window, "Image");
    // Use a unique prefix so we don't collide with srcsets from earlier tests.
    const prefix = "lru-eviction-";
    for (let i = 0; i < 101; i += 1) {
      prefetchImage(img({ srcset: `${prefix}${i} 1x`, src: `/${i}.webp` }));
    }
    expect(ctor).toHaveBeenCalledTimes(101);
  });
});

describe("fetchImageManifest", () => {
  it("returns the cached value without fetching", async () => {
    const cached = [img({ src: "/cached.webp" })];
    setImageCache("/deck/x", cached);
    const fetchSpy = vi.fn();
    window.fetch = fetchSpy as unknown as typeof fetch;
    const out = await fetchImageManifest("/deck/x");
    expect(out).toEqual(cached);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("caches the response on success", async () => {
    const images = [img({ src: "/fetched.webp" })];
    window.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ images }),
    }) as unknown as typeof fetch;
    const out = await fetchImageManifest("/deck/y");
    expect(out).toEqual(images);
    expect(imageCache.get("/deck/y")).toEqual(images);
  });

  it("prepends a slash when the href doesn't start with one", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ images: [] }),
    });
    window.fetch = fetchSpy as unknown as typeof fetch;
    await fetchImageManifest("deck/no-slash");
    expect(fetchSpy).toHaveBeenCalledWith("/api/prefetch-images/deck/no-slash");
  });

  it("returns [] when the response is not ok", async () => {
    window.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ images: [] }) }) as unknown as typeof fetch;
    expect(await fetchImageManifest("/deck/bad")).toEqual([]);
    expect(imageCache.has("/deck/bad")).toBe(false);
  });

  it("returns [] when fetch throws", async () => {
    window.fetch = vi.fn().mockRejectedValue(new Error("network")) as unknown as typeof fetch;
    expect(await fetchImageManifest("/deck/throws")).toEqual([]);
  });
});
