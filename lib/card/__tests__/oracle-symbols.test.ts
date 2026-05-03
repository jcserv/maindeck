import { describe, expect, it } from "vitest";
import { parseOracle } from "../oracle-symbols";

describe("parseOracle", () => {
  it("returns empty for empty string", () => {
    expect(parseOracle("")).toEqual([]);
  });

  it("splits plain text and a tap-to-add ability", () => {
    expect(parseOracle("{T}: Add {B} or {G}.")).toEqual([
      { kind: "symbol", value: "tap" },
      { kind: "text", value: ": Add " },
      { kind: "symbol", value: "b" },
      { kind: "text", value: " or " },
      { kind: "symbol", value: "g" },
      { kind: "text", value: "." },
    ]);
  });

  it("maps untap to ms-untap", () => {
    expect(parseOracle("{Q}: Do a thing.")[0]).toEqual({
      kind: "symbol",
      value: "untap",
    });
  });

  it("handles phyrexian symbols", () => {
    expect(parseOracle("Pay {W/P}.")).toEqual([
      { kind: "text", value: "Pay " },
      { kind: "symbol", value: "wp" },
      { kind: "text", value: "." },
    ]);
  });

  it("handles hybrid and 2/color symbols", () => {
    expect(parseOracle("{W/U}{2/W}")).toEqual([
      { kind: "symbol", value: "wu" },
      { kind: "symbol", value: "2w" },
    ]);
  });

  it("handles loyalty abilities", () => {
    expect(parseOracle("{+1}: Draw.")).toEqual([
      { kind: "symbol", value: "loyalty-up-1" },
      { kind: "text", value: ": Draw." },
    ]);
    expect(parseOracle("{-2}: Draw.")[0]).toEqual({
      kind: "symbol",
      value: "loyalty-down-2",
    });
  });

  it("preserves newlines in text runs (MDFC separator)", () => {
    const parsed = parseOracle("Flying\n//\n{U}: Draw.");
    expect(parsed[0]).toEqual({ kind: "text", value: "Flying\n//\n" });
    expect(parsed[1]).toEqual({ kind: "symbol", value: "u" });
  });

  it("returns plain text when no symbols are present", () => {
    expect(parseOracle("Flying")).toEqual([{ kind: "text", value: "Flying" }]);
  });

  it("preserves bare-digit generic mana symbols", () => {
    expect(parseOracle("{2}{0}")).toEqual([
      { kind: "symbol", value: "2" },
      { kind: "symbol", value: "0" },
    ]);
  });
});
