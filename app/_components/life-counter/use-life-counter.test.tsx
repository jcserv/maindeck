import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { createGame } from "@/lib/life-counter/state";

const STORAGE_KEY = "maindeck:life-counter";

async function loadHook() {
  vi.resetModules();
  return (await import("./use-life-counter")).useLifeCounter;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useLifeCounter", () => {
  it("resumes the saved game", async () => {
    const saved = createGame({ playerCount: 2, startingLife: 20 });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    const useLifeCounter = await loadHook();

    const { result } = renderHook(() => useLifeCounter());

    expect(result.current[0]).toEqual(saved);
  });

  it("starts a default game when storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    const useLifeCounter = await loadHook();

    const { result } = renderHook(() => useLifeCounter());

    expect(result.current[0].players).toHaveLength(4);
    expect(result.current[0].startingLife).toBe(40);
  });

  it("server-renders the default game instead of reading storage", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(createGame({ playerCount: 2, startingLife: 20 })),
    );
    const useLifeCounter = await loadHook();
    function Probe() {
      const [game] = useLifeCounter();
      return <span>{game.startingLife}</span>;
    }

    expect(renderToString(<Probe />)).toContain("40");
  });

  it("picks up a game saved from another tab", async () => {
    const useLifeCounter = await loadHook();
    const { result } = renderHook(() => useLifeCounter());
    const fromOtherTab = createGame({ playerCount: 3, startingLife: 30 });

    act(() => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fromOtherTab));
      window.dispatchEvent(new StorageEvent("storage", { key: "unrelated" }));
    });
    expect(result.current[0].startingLife).toBe(40);

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    });
    expect(result.current[0]).toEqual(fromOtherTab);
  });
});
