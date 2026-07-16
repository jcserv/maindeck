import { describe, expect, it } from "vitest";
import {
  filterLiveCategories,
  orderZoneOptions,
} from "@/app/_components/builder/move-card-menu";

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

describe("filterLiveCategories (issue #88)", () => {
  it("drops a stale membership no longer in the live registry", () => {
    // "ghost" was deleted while the menu was open; toggling "draw" must not
    // resend it.
    expect(
      filterLiveCategories(["ramp", "ghost", "draw"], ["ramp", "draw"]),
    ).toEqual(["ramp", "draw"]);
  });

  it("preserves order of the surviving memberships", () => {
    expect(
      filterLiveCategories(["draw", "ramp"], ["ramp", "draw", "removal"]),
    ).toEqual(["draw", "ramp"]);
  });

  it("returns an empty list when every name is stale", () => {
    expect(filterLiveCategories(["ghost"], ["ramp"])).toEqual([]);
    expect(filterLiveCategories([], ["ramp"])).toEqual([]);
  });
});
