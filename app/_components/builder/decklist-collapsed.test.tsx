import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readCollapsed,
  subscribeCollapsed,
  writeCollapsed,
} from "./decklist-collapsed";

describe("decklist-collapsed", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  describe("readCollapsed", () => {
    it("returns the empty map when nothing is stored", () => {
      expect(readCollapsed("k")).toEqual({});
    });

    it("round-trips a value written via writeCollapsed", () => {
      writeCollapsed("k", { ramp: true });
      expect(readCollapsed("k")).toEqual({ ramp: true });
    });

    it("re-uses the cached parse when the raw string is unchanged", () => {
      writeCollapsed("k", { ramp: true });
      const first = readCollapsed("k");
      const second = readCollapsed("k");
      expect(second).toBe(first);
    });

    it("returns empty for invalid JSON", () => {
      window.localStorage.setItem("k", "not-json");
      expect(readCollapsed("k")).toEqual({});
    });

    it("returns empty when the parsed value is not an object", () => {
      window.localStorage.setItem("k", JSON.stringify("a string"));
      expect(readCollapsed("k")).toEqual({});
    });

    it("parses raw JSON when the snapshot cache misses", () => {
      // Use a fresh key so the module-private snapshot cache is empty and
      // we exercise the JSON.parse + assign branch.
      window.localStorage.setItem("fresh-key", JSON.stringify({ ramp: true }));
      expect(readCollapsed("fresh-key")).toEqual({ ramp: true });
    });
  });

  describe("writeCollapsed", () => {
    it("removes the localStorage entry when given an empty object", () => {
      window.localStorage.setItem("k", "{\"ramp\":true}");
      writeCollapsed("k", {});
      expect(window.localStorage.getItem("k")).toBeNull();
    });

    it("swallows quota errors thrown by setItem", () => {
      const orig = window.localStorage.setItem.bind(window.localStorage);
      window.localStorage.setItem = vi.fn(() => {
        throw new Error("quota exceeded");
      });
      try {
        expect(() => writeCollapsed("k", { ramp: true })).not.toThrow();
      } finally {
        window.localStorage.setItem = orig;
      }
    });

    it("notifies subscribed listeners", () => {
      const cb = vi.fn();
      const unsub = subscribeCollapsed("k", cb);
      writeCollapsed("k", { ramp: true });
      expect(cb).toHaveBeenCalledTimes(1);
      unsub();
    });
  });

  describe("subscribeCollapsed", () => {
    it("invokes the callback on a matching StorageEvent", () => {
      const cb = vi.fn();
      const unsub = subscribeCollapsed("k", cb);
      window.dispatchEvent(new StorageEvent("storage", { key: "k" }));
      expect(cb).toHaveBeenCalledTimes(1);
      unsub();
    });

    it("ignores StorageEvents for other keys", () => {
      const cb = vi.fn();
      const unsub = subscribeCollapsed("k", cb);
      window.dispatchEvent(new StorageEvent("storage", { key: "other" }));
      expect(cb).not.toHaveBeenCalled();
      unsub();
    });

    it("the returned unsubscribe stops further notifications", () => {
      const cb = vi.fn();
      const unsub = subscribeCollapsed("k", cb);
      unsub();
      writeCollapsed("k", { ramp: true });
      window.dispatchEvent(new StorageEvent("storage", { key: "k" }));
      expect(cb).not.toHaveBeenCalled();
    });

    it("supports multiple listeners on the same key", () => {
      const a = vi.fn();
      const b = vi.fn();
      const unsubA = subscribeCollapsed("k", a);
      const unsubB = subscribeCollapsed("k", b);
      writeCollapsed("k", { ramp: true });
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
      unsubA();
      unsubB();
    });
  });
});
