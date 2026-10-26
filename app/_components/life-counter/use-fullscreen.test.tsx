import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useFullscreen } from "./use-fullscreen";

afterEach(() => {
  delete (document as { fullscreenElement?: unknown }).fullscreenElement;
  delete (document as { exitFullscreen?: unknown }).exitFullscreen;
  delete (document.documentElement as { requestFullscreen?: unknown }).requestFullscreen;
});

describe("useFullscreen", () => {
  it("stays fullscreen in-page when the browser refuses native fullscreen", async () => {
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: vi.fn().mockRejectedValue(new TypeError("Permissions check failed")),
    });
    const { result } = renderHook(() => useFullscreen());

    await act(async () => result.current[1]());

    expect(result.current[0]).toBe(true);
  });

  it("exits even when the browser rejects leaving native fullscreen", async () => {
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: document.documentElement });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: vi.fn().mockRejectedValue(new TypeError("Document not active")),
    });
    const { result } = renderHook(() => useFullscreen());

    await act(async () => result.current[1]());
    await act(async () => result.current[2]());

    expect(result.current[0]).toBe(false);
  });

  it("ignores an Escape another component already handled", () => {
    const { result } = renderHook(() => useFullscreen());
    act(() => result.current[1]());

    const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    event.preventDefault();
    act(() => {
      document.dispatchEvent(event);
    });

    expect(result.current[0]).toBe(true);
  });

  it("exits in-page fullscreen without touching the Fullscreen API", () => {
    const { result } = renderHook(() => useFullscreen());

    act(() => result.current[1]());
    act(() => result.current[2]());

    expect(result.current[0]).toBe(false);
  });
});
