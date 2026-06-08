import { describe, expect, it } from "vitest";
import {
  parseSyntax,
  serializeWhere,
  type ParsedWhere,
} from "../syntax-parser";

const empty: ParsedWhere = {
  nameFragments: [],
  colors: [],
  typeFragments: [],
  cmcFilters: [],
  oracleFragments: [],
};

describe("serializeWhere — filter → syntax mapping", () => {
  it("serializes nothing for an empty filter", () => {
    expect(serializeWhere(empty)).toBe("");
  });

  it("maps colors to a single c: token in WUBRG order", () => {
    expect(serializeWhere({ ...empty, colors: ["G", "W", "U"] })).toBe("c:WUG");
  });

  it("emits one t: token per type fragment", () => {
    expect(
      serializeWhere({ ...empty, typeFragments: ["creature", "artifact"] }),
    ).toBe("t:creature t:artifact");
  });

  it("maps cmc bounds to cmc>= / cmc<=", () => {
    expect(
      serializeWhere({
        ...empty,
        cmcFilters: [
          { op: ">=", value: 2 },
          { op: "<=", value: 5 },
        ],
      }),
    ).toBe("cmc>=2 cmc<=5");
  });

  it("maps oracle words to o: and quotes phrases", () => {
    expect(
      serializeWhere({ ...empty, oracleFragments: ["flying", "draw a card"] }),
    ).toBe('o:flying o:"draw a card"');
  });

  it("quotes multi-word name fragments", () => {
    expect(serializeWhere({ ...empty, nameFragments: ["sol", "ring of"] })).toBe(
      'sol "ring of"',
    );
  });
});

describe("serializeWhere ↔ parseSyntax round-trip", () => {
  const cases: ParsedWhere[] = [
    { ...empty, colors: ["W", "U", "B", "R", "G"] },
    { ...empty, typeFragments: ["creature"] },
    {
      ...empty,
      colors: ["U"],
      typeFragments: ["instant"],
      cmcFilters: [{ op: "<=", value: 3 }],
      oracleFragments: ["flying"],
    },
    {
      ...empty,
      nameFragments: ["bolt"],
      cmcFilters: [
        { op: ">=", value: 1 },
        { op: "<=", value: 4 },
      ],
    },
    { ...empty, oracleFragments: ["draw a card"] },
  ];

  it.each(cases)("parseSyntax(serializeWhere(p)) === p for %o", (p) => {
    expect(parseSyntax(serializeWhere(p))).toEqual(p);
  });

  it("is stable under a second round-trip", () => {
    for (const p of cases) {
      const once = serializeWhere(p);
      expect(serializeWhere(parseSyntax(once))).toBe(once);
    }
  });
});
