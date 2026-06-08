import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

import { useMediaQuery } from "./use-media-query";

interface FakeMql {
  matches: boolean;
  listeners: Set<() => void>;
}

function stubMatchMedia(matches: boolean) {
  const mql: FakeMql = { matches, listeners: new Set() };
  const matchMedia = vi.fn((query: string) => ({
    matches: mql.matches,
    media: query,
    addEventListener: (_: string, cb: () => void) => mql.listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => mql.listeners.delete(cb),
  }));
  vi.stubGlobal("matchMedia", matchMedia);
  return {
    matchMedia,
    set(next: boolean) {
      mql.matches = next;
      for (const cb of mql.listeners) cb();
    },
    get listenerCount() {
      return mql.listeners.size;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useMediaQuery", () => {
  it("reports the current match state for the query", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));
    expect(result.current).toBe(true);
  });

  it("re-renders when the media query toggles", () => {
    const mm = stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));
    expect(result.current).toBe(false);

    act(() => mm.set(true));
    expect(result.current).toBe(true);
  });

  it("falls back to false on the server snapshot", () => {
    function Probe() {
      return <>{String(useMediaQuery("(min-width: 768px)"))}</>;
    }
    // Server render takes the getServerSnapshot path, never touching matchMedia.
    expect(renderToStaticMarkup(<Probe />)).toBe("false");
  });

  it("unsubscribes the listener on unmount", () => {
    const mm = stubMatchMedia(false);
    const { unmount } = renderHook(() => useMediaQuery("(min-width: 768px)"));
    expect(mm.listenerCount).toBe(1);

    unmount();
    expect(mm.listenerCount).toBe(0);
  });
});
