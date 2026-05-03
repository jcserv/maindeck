import { describe, expect, it, vi } from "vitest";
import {
  fireDeckAction,
  registerDeckAction,
} from "../deck-actions-bus";

describe("deckActionsBus", () => {
  it("registers a handler and fireDeckAction invokes it", () => {
    const cb = vi.fn();
    const unregister = registerDeckAction("export", cb);

    expect(fireDeckAction("export")).toBe(true);
    expect(cb).toHaveBeenCalledTimes(1);

    unregister();
  });

  it("returns false when no handler is registered for an action", () => {
    expect(fireDeckAction("toggle-view")).toBe(false);
  });

  it("returning unregister removes only that callback (no-op if already replaced)", () => {
    const first = vi.fn();
    const second = vi.fn();

    const unregisterFirst = registerDeckAction("bulk-edit", first);
    // Second registration replaces the first.
    const unregisterSecond = registerDeckAction("bulk-edit", second);

    fireDeckAction("bulk-edit");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    // Calling the first's unregister now is a no-op (the active cb is `second`).
    unregisterFirst();
    fireDeckAction("bulk-edit");
    expect(second).toHaveBeenCalledTimes(2);

    unregisterSecond();
    expect(fireDeckAction("bulk-edit")).toBe(false);
  });

  it("a single register/unregister cycle clears the action", () => {
    const cb = vi.fn();
    const unregister = registerDeckAction("toggle-view", cb);
    unregister();
    expect(fireDeckAction("toggle-view")).toBe(false);
    expect(cb).not.toHaveBeenCalled();
  });
});
