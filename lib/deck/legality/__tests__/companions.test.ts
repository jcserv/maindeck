import { describe, expect, it } from "vitest";
import { Format, Zone } from "@/lib/generated/prisma/enums";
import { snapshotFromCards } from "@/lib/deck/mutation/snapshot";
import { fullLegality } from "@/lib/deck/legality";
import {
  COMPANION_NAMES,
  companionRestrictions,
  companionRule,
} from "../companions";
import { formatLegalityIssue } from "../shared";
import type { SnapshotCard } from "@/lib/deck/mutation/types";

let nextId = 0;

function card(
  name: string,
  opts: Partial<SnapshotCard> = {},
): SnapshotCard {
  nextId += 1;
  return {
    id: `dc-${nextId}`,
    cardId: nextId,
    cardName: name,
    quantity: 1,
    zone: Zone.MAINBOARD,
    categories: [],
    typeLine: "Creature — Human",
    colorIdentity: [],
    legalities: {},
    printingId: null,
    isFoil: false,
    cmc: 0,
    manaCost: null,
    oracleText: null,
    ...opts,
  };
}

function companion(name: string): SnapshotCard {
  return card(name, { zone: Zone.COMPANION, typeLine: "Legendary Creature" });
}

function run(cards: SnapshotCard[], format: Format = Format.MODERN) {
  return companionRule(snapshotFromCards({ format, cards }));
}

describe("companion zone gating", () => {
  it("returns no issues when the companion zone is empty", () => {
    expect(run([card("Llanowar Elves", { cmc: 1 })])).toEqual([]);
  });

  it("flags a card in the companion zone that is not a known companion", () => {
    const issues = run([companion("Llanowar Elves")]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      kind: "companion_violation",
      cardName: "Llanowar Elves",
      reason: "not a companion",
    });
  });

  it("flags having more than one companion while still checking each", () => {
    const issues = run([
      companion("Lurrus of the Dream-Den"),
      companion("Jegantha, the Wellspring"),
      card("Cheap Creature", { cmc: 2, typeLine: "Creature — Cat" }),
    ]);
    const tooMany = issues.filter(
      (i) =>
        i.kind === "companion_violation" &&
        i.reason === "a deck may have only one companion",
    );
    expect(tooMany).toHaveLength(1);
  });

  it("does not flag too-many when only one companion is present", () => {
    const issues = run([
      companion("Lurrus of the Dream-Den"),
      card("Cheap Creature", { cmc: 2, typeLine: "Creature — Cat" }),
    ]);
    expect(
      issues.some(
        (i) =>
          i.kind === "companion_violation" &&
          i.reason === "a deck may have only one companion",
      ),
    ).toBe(false);
  });
});

describe("Gyruda, Doom of Depths — even mana value", () => {
  it("is legal when every card has an even mana value", () => {
    const issues = run([
      companion("Gyruda, Doom of Depths"),
      card("Even One", { cmc: 2 }),
      card("Even Four", { cmc: 4 }),
    ]);
    expect(issues).toEqual([]);
  });

  it("is illegal when a card has an odd mana value", () => {
    const issues = run([
      companion("Gyruda, Doom of Depths"),
      card("Odd Card", { cmc: 3 }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.kind).toBe("companion_violation");
  });

  it("treats null cmc as 0 (even — legal)", () => {
    expect(
      run([
        companion("Gyruda, Doom of Depths"),
        card("Unknown Cost", { cmc: null }),
      ]),
    ).toEqual([]);
  });
});

describe("Obosh, the Preypiercer — odd mana value", () => {
  it("ignores lands but flags even-cost nonland cards", () => {
    const issues = run([
      companion("Obosh, the Preypiercer"),
      card("Mountain", { cmc: 0, typeLine: "Basic Land — Mountain" }),
      card("Odd Spell", { cmc: 1, typeLine: "Instant" }),
    ]);
    expect(issues).toEqual([]);

    const bad = run([
      companion("Obosh, the Preypiercer"),
      card("Even Spell", { cmc: 2, typeLine: "Instant" }),
    ]);
    expect(bad).toHaveLength(1);
  });
});

describe("Keruga, the Macrosage — nonland mana value 3+", () => {
  it("allows lands of any cost but requires nonlands at 3+", () => {
    expect(
      run([
        companion("Keruga, the Macrosage"),
        card("Forest", { cmc: 0, typeLine: "Basic Land — Forest" }),
        card("Big", { cmc: 3, typeLine: "Sorcery" }),
      ]),
    ).toEqual([]);
    expect(
      run([
        companion("Keruga, the Macrosage"),
        card("Small", { cmc: 2, typeLine: "Instant" }),
      ]),
    ).toHaveLength(1);
  });
});

describe("Lurrus of the Dream-Den — permanents mana value 2 or less", () => {
  it("ignores instants/sorceries but flags expensive permanents", () => {
    expect(
      run([
        companion("Lurrus of the Dream-Den"),
        card("Cheap Creature", { cmc: 2, typeLine: "Creature — Cat" }),
        card("Expensive Spell", { cmc: 6, typeLine: "Sorcery" }),
      ]),
    ).toEqual([]);
    expect(
      run([
        companion("Lurrus of the Dream-Den"),
        card("Big Creature", { cmc: 5, typeLine: "Creature — Beast" }),
      ]),
    ).toHaveLength(1);
  });
});

describe("Lutri, the Spellchaser — singleton", () => {
  it("flags a duplicated nonbasic but allows duplicate basics", () => {
    expect(
      run([
        companion("Lutri, the Spellchaser"),
        card("Island", { quantity: 10, typeLine: "Basic Land — Island" }),
        card("Opt", { quantity: 1, typeLine: "Instant" }),
      ]),
    ).toEqual([]);
    expect(
      run([
        companion("Lutri, the Spellchaser"),
        card("Opt", { quantity: 2, typeLine: "Instant" }),
      ]),
    ).toHaveLength(1);
  });
});

describe("Jegantha, the Wellspring — no repeated mana symbol", () => {
  it("allows distinct symbols but flags a repeated colored symbol", () => {
    expect(
      run([
        companion("Jegantha, the Wellspring"),
        card("Multi", { manaCost: "{1}{W}{U}", typeLine: "Instant" }),
      ]),
    ).toEqual([]);
    expect(
      run([
        companion("Jegantha, the Wellspring"),
        card("Double Green", { manaCost: "{G}{G}", typeLine: "Creature — Elf" }),
      ]),
    ).toHaveLength(1);
  });
});

describe("Kaheera, the Orphanguard — creature types", () => {
  it("allows the listed types and noncreatures, flags others", () => {
    expect(
      run([
        companion("Kaheera, the Orphanguard"),
        card("Savannah Lions", { typeLine: "Creature — Cat" }),
        card("Disenchant", { typeLine: "Instant" }),
      ]),
    ).toEqual([]);
    expect(
      run([
        companion("Kaheera, the Orphanguard"),
        card("Goblin Guide", { typeLine: "Creature — Goblin" }),
      ]),
    ).toHaveLength(1);
  });

  it("flags a creature with no subtype (no — in type line)", () => {
    expect(
      run([
        companion("Kaheera, the Orphanguard"),
        card("Shapeless", { typeLine: "Creature" }),
      ]),
    ).toHaveLength(1);
  });
});

describe("Umori, the Collector — shared card type", () => {
  it("is legal when all nonland cards share a type, illegal otherwise", () => {
    expect(
      run([
        companion("Umori, the Collector"),
        card("Bolt", { typeLine: "Instant" }),
        card("Opt", { typeLine: "Instant" }),
      ]),
    ).toEqual([]);
    expect(
      run([
        companion("Umori, the Collector"),
        card("Bolt", { typeLine: "Instant" }),
        card("Bear", { typeLine: "Creature — Bear" }),
      ]),
    ).toHaveLength(1);
  });

  it("is legal when only lands are present (nonland list empty)", () => {
    expect(
      run([
        companion("Umori, the Collector"),
        card("Forest", { typeLine: "Basic Land — Forest" }),
        card("Mountain", { typeLine: "Basic Land — Mountain" }),
      ]),
    ).toEqual([]);
  });

  it("treats a card with null typeLine as having no shared type", () => {
    expect(
      run([
        companion("Umori, the Collector"),
        card("Unknown", { typeLine: null }),
      ]),
    ).toHaveLength(1);
  });
});

describe("Yorion, Sky Nomad — oversized deck", () => {
  it("requires 20 cards above the format minimum", () => {
    const big = run([
      companion("Yorion, Sky Nomad"),
      card("Filler", { quantity: 80, typeLine: "Creature — Bird" }),
    ]);
    expect(big).toEqual([]);
    const small = run([
      companion("Yorion, Sky Nomad"),
      card("Filler", { quantity: 60, typeLine: "Creature — Bird" }),
    ]);
    expect(small).toHaveLength(1);
  });

  it("uses commander deck size (100) as the minimum for commander format", () => {
    expect(
      run(
        [
          companion("Yorion, Sky Nomad"),
          card("Filler", { quantity: 120, typeLine: "Creature — Bird" }),
        ],
        Format.COMMANDER,
      ),
    ).toEqual([]);
    expect(
      run(
        [
          companion("Yorion, Sky Nomad"),
          card("Filler", { quantity: 100, typeLine: "Creature — Bird" }),
        ],
        Format.COMMANDER,
      ),
    ).toHaveLength(1);
  });
});

describe("Zirda, the Dawnwaker — permanents with activated abilities", () => {
  it("flags a permanent with no activated ability", () => {
    expect(
      run([
        companion("Zirda, the Dawnwaker"),
        card("Tapper", {
          typeLine: "Creature — Human",
          oracleText: "{T}: Tap target creature.",
        }),
        card("Mountain", { typeLine: "Basic Land — Mountain" }),
      ]),
    ).toEqual([]);
    expect(
      run([
        companion("Zirda, the Dawnwaker"),
        card("Vanilla", { typeLine: "Creature — Bear", oracleText: "" }),
      ]),
    ).toHaveLength(1);
  });

  it("flags a creature with null oracle text (no activated ability)", () => {
    expect(
      run([
        companion("Zirda, the Dawnwaker"),
        card("Blank", { typeLine: "Creature — Bear" }),
      ]),
    ).toHaveLength(1);
  });
});

describe("companion restriction only judges mainboard + commander", () => {
  it("ignores cards in the sideboard and considering zones", () => {
    const issues = run([
      companion("Gyruda, Doom of Depths"),
      card("Even", { cmc: 2 }),
      card("Odd Sideboard", { cmc: 3, zone: Zone.SIDEBOARD }),
      card("Odd Considering", { cmc: 1, zone: Zone.CONSIDERING }),
    ]);
    expect(issues).toEqual([]);
  });
});

describe("companion legality flows through fullLegality + formatting", () => {
  it("surfaces a companion_violation from validateDeck-style checks", () => {
    const snap = snapshotFromCards({
      format: Format.MODERN,
      cards: [
        companion("Gyruda, Doom of Depths"),
        card("Odd Card", { cmc: 1 }),
      ],
    });
    const issues = fullLegality(snap);
    const violation = issues.find((i) => i.kind === "companion_violation");
    expect(violation).toBeDefined();
    expect(formatLegalityIssue(violation!)).toContain(
      "Companion restriction not met",
    );
  });
});

describe("registry", () => {
  it("covers all ten companions", () => {
    expect(COMPANION_NAMES.size).toBe(10);
    expect(Object.keys(companionRestrictions)).toHaveLength(10);
  });
});
