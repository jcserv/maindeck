import { describe, expect, it } from "vitest";
import { toMoxfield } from "../export";
import { parseDeckList } from "@/lib/deck-io/line-parser";

describe("toMoxfield", () => {
  it("formats a single non-foil card", () => {
    expect(
      toMoxfield([
        {
          quantity: 1,
          name: "Sol Ring",
          setCode: "C21",
          collectorNumber: "263",
        },
      ]),
    ).toBe("1 Sol Ring (C21) 263");
  });

  it("appends *f* for foil cards", () => {
    expect(
      toMoxfield([
        {
          quantity: 1,
          name: "Sol Ring",
          setCode: "C21",
          collectorNumber: "263",
          isFoil: true,
        },
      ]),
    ).toBe("1 Sol Ring (C21) 263 *f*");
  });

  it("uppercases set codes", () => {
    const out = toMoxfield([
      { quantity: 2, name: "Brainstorm", setCode: "ice", collectorNumber: "61" },
    ]);
    expect(out).toBe("2 Brainstorm (ICE) 61");
  });

  it("joins multiple cards with newlines", () => {
    const out = toMoxfield([
      { quantity: 1, name: "Sol Ring", setCode: "C21", collectorNumber: "263" },
      {
        quantity: 1,
        name: "Counterspell",
        setCode: "MH2",
        collectorNumber: "267",
      },
    ]);
    expect(out).toBe("1 Sol Ring (C21) 263\n1 Counterspell (MH2) 267");
  });

  it("returns an empty string for an empty deck", () => {
    expect(toMoxfield([])).toBe("");
  });

  it("round-trips through parseDeckList", () => {
    const exported = toMoxfield([
      { quantity: 1, name: "Sol Ring", setCode: "C21", collectorNumber: "263" },
      {
        quantity: 4,
        name: "Lightning Bolt",
        setCode: "M11",
        collectorNumber: "149",
      },
    ]);
    const parsed = parseDeckList(exported);
    expect(parsed).toEqual([
      {
        name: "Sol Ring",
        quantity: 1,
        set: "C21",
        collectorNumber: "263",
        isFoil: false,
      },
      {
        name: "Lightning Bolt",
        quantity: 4,
        set: "M11",
        collectorNumber: "149",
        isFoil: false,
      },
    ]);
  });
});
