import { describe, expect, it } from "vitest";
import { parseSyntax } from "../syntax-parser";

describe("parseSyntax — color operator", () => {
  it("parses c:WUBRG into uppercase split colors", () => {
    expect(parseSyntax("c:wubrg").colors).toEqual(["W", "U", "B", "R", "G"]);
  });

  it("accepts the `=` form (c=ub)", () => {
    expect(parseSyntax("c=ub").colors).toEqual(["U", "B"]);
  });

  it("treats c: with non-WUBRG letters as not-a-color (falls through to name)", () => {
    const out = parseSyntax("c:xyz");
    expect(out.colors).toEqual([]);
    expect(out.nameFragments).toEqual(["c:xyz"]);
  });
});

describe("parseSyntax — type operator", () => {
  it("captures t:creature", () => {
    expect(parseSyntax("t:creature").typeFragments).toEqual(["creature"]);
  });

  it("preserves the original case of the type fragment", () => {
    expect(parseSyntax("t:Goblin").typeFragments).toEqual(["Goblin"]);
  });
});

describe("parseSyntax — cmc operator", () => {
  it.each([
    ["cmc<=3", "<=", 3],
    ["cmc>=4", ">=", 4],
    ["cmc<2", "<", 2],
    ["cmc>5", ">", 5],
    ["cmc=1", "=", 1],
    ["cmc:0", "=", 0],
  ] as const)("parses %s into op=%s value=%i", (input, op, value) => {
    expect(parseSyntax(input).cmcFilters).toEqual([{ op, value }]);
  });

  it("ignores cmc with no number (falls through to name fragment)", () => {
    const out = parseSyntax("cmc:abc");
    expect(out.cmcFilters).toEqual([]);
    expect(out.nameFragments).toEqual(["cmc:abc"]);
  });
});

describe("parseSyntax — oracle operator", () => {
  it("parses o:word as a single fragment", () => {
    expect(parseSyntax("o:flying").oracleFragments).toEqual(["flying"]);
  });

  it("parses o:\"two words\" as a phrase fragment", () => {
    expect(parseSyntax('o:"enters the battlefield"').oracleFragments).toEqual([
      "enters the battlefield",
    ]);
  });

  it("treats o:\"\" (empty quoted phrase) as no fragment", () => {
    expect(parseSyntax('o:""').oracleFragments).toEqual([]);
  });
});

describe("parseSyntax — name fragments", () => {
  it("treats bare words as name fragments", () => {
    expect(parseSyntax("lightning bolt").nameFragments).toEqual([
      "lightning",
      "bolt",
    ]);
  });

  it("captures quoted phrases as a single name fragment", () => {
    expect(parseSyntax('"sol ring"').nameFragments).toEqual(["sol ring"]);
  });

  it("ignores tokens prefixed with `-` (negation not supported)", () => {
    expect(parseSyntax("-foo bar").nameFragments).toEqual(["bar"]);
  });
});

describe("parseSyntax — combined", () => {
  it("mixes name + type + cmc + color in one query", () => {
    const out = parseSyntax("c:r t:creature cmc<=3 goblin");
    expect(out.colors).toEqual(["R"]);
    expect(out.typeFragments).toEqual(["creature"]);
    expect(out.cmcFilters).toEqual([{ op: "<=", value: 3 }]);
    expect(out.nameFragments).toEqual(["goblin"]);
  });

  it("returns empty result for empty input", () => {
    expect(parseSyntax("")).toEqual({
      nameFragments: [],
      colors: [],
      typeFragments: [],
      cmcFilters: [],
      oracleFragments: [],
    });
  });

  it("strips leading/trailing whitespace before tokenizing", () => {
    expect(parseSyntax("   bolt   ").nameFragments).toEqual(["bolt"]);
  });
});
