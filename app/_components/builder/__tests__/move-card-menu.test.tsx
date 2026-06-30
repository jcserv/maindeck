import { describe, expect, it } from "vitest";
import { orderZoneOptions } from "@/app/_components/builder/move-card-menu";

describe("orderZoneOptions", () => {
  it("keeps Commander first when no commander is set", () => {
    const order = orderZoneOptions(false).map((o) => o.value);
    expect(order).toEqual([
      "COMMANDER",
      "COMPANION",
      "MAINBOARD",
      "SIDEBOARD",
      "CONSIDERING",
    ]);
  });

  it("moves Commander to the bottom when a commander is already set", () => {
    const order = orderZoneOptions(true).map((o) => o.value);
    expect(order).toEqual([
      "COMPANION",
      "MAINBOARD",
      "SIDEBOARD",
      "CONSIDERING",
      "COMMANDER",
    ]);
  });

  it("preserves the non-commander zones' relative order", () => {
    const set = orderZoneOptions(true).map((o) => o.value);
    const unset = orderZoneOptions(false)
      .map((o) => o.value)
      .filter((v) => v !== "COMMANDER");
    expect(set.slice(0, -1)).toEqual(unset);
  });
});
