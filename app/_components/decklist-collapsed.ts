type CollapsedMap = Record<string, boolean>;
const EMPTY_COLLAPSED: CollapsedMap = {};
const collapsedSnapshotCache = new Map<
  string,
  { raw: string | null; parsed: CollapsedMap }
>();
const collapsedListeners = new Map<string, Set<() => void>>();

export function readCollapsed(key: string): CollapsedMap {
  if (typeof window === "undefined") return EMPTY_COLLAPSED;
  const raw = window.localStorage.getItem(key);
  const cached = collapsedSnapshotCache.get(key);
  if (cached && cached.raw === raw) return cached.parsed;
  let parsed: CollapsedMap = EMPTY_COLLAPSED;
  if (raw) {
    try {
      const candidate = JSON.parse(raw) as unknown;
      if (candidate && typeof candidate === "object") {
        parsed = candidate as CollapsedMap;
      }
    } catch {
      parsed = EMPTY_COLLAPSED;
    }
  }
  collapsedSnapshotCache.set(key, { raw, parsed });
  return parsed;
}

export function writeCollapsed(key: string, next: CollapsedMap): void {
  try {
    if (Object.keys(next).length === 0) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(next));
    }
  } catch {
    // ignore quota errors
  }
  collapsedSnapshotCache.set(key, {
    raw: window.localStorage.getItem(key),
    parsed: next,
  });
  collapsedListeners.get(key)?.forEach((cb) => cb());
}

export function subscribeCollapsed(key: string, callback: () => void): () => void {
  let set = collapsedListeners.get(key);
  if (!set) {
    set = new Set();
    collapsedListeners.set(key, set);
  }
  set.add(callback);
  function onStorage(e: StorageEvent) {
    if (e.key === key) callback();
  }
  window.addEventListener("storage", onStorage);
  return () => {
    set!.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}
