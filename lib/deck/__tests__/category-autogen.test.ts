import { describe, expect, it } from "vitest";
import { classifyCard, type ClassifiableCard } from "../category-autogen";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function card(
  mainType: string,
  oracleText: string | null = null,
  keywords: string[] = [],
): ClassifiableCard {
  return { mainType, oracleText, keywords };
}

// ---------------------------------------------------------------------------
// byType preset
// ---------------------------------------------------------------------------

describe("classifyCard — byType", () => {
  it("maps Creature → Creatures", () => {
    expect(classifyCard(card("Creature"), "byType")).toBe("Creatures");
  });

  it("maps Instant → Instants", () => {
    expect(classifyCard(card("Instant"), "byType")).toBe("Instants");
  });

  it("maps Sorcery → Sorceries", () => {
    expect(classifyCard(card("Sorcery"), "byType")).toBe("Sorceries");
  });

  it("maps Artifact → Artifacts", () => {
    expect(classifyCard(card("Artifact"), "byType")).toBe("Artifacts");
  });

  it("maps Enchantment → Enchantments", () => {
    expect(classifyCard(card("Enchantment"), "byType")).toBe("Enchantments");
  });

  it("maps Planeswalker → Planeswalkers", () => {
    expect(classifyCard(card("Planeswalker"), "byType")).toBe("Planeswalkers");
  });

  it("maps Battle → Battles", () => {
    expect(classifyCard(card("Battle"), "byType")).toBe("Battles");
  });

  it("maps Land → Lands", () => {
    expect(classifyCard(card("Land"), "byType")).toBe("Lands");
  });

  it("returns null for exotic types (Conspiracy)", () => {
    expect(classifyCard(card("Conspiracy"), "byType")).toBeNull();
  });

  it("returns null for Unknown mainType", () => {
    expect(classifyCard(card("Unknown"), "byType")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// commanderTemplate preset — Lands bucket
// ---------------------------------------------------------------------------

describe("classifyCard — commanderTemplate: Lands", () => {
  it("puts a Land in Lands", () => {
    expect(
      classifyCard(card("Land", "{T}: Add {G}."), "commanderTemplate"),
    ).toBe("Lands");
  });
});

// ---------------------------------------------------------------------------
// commanderTemplate preset — Ramp bucket
// ---------------------------------------------------------------------------

describe("classifyCard — commanderTemplate: Ramp", () => {
  it("matches mana-production oracle text", () => {
    // Sol Ring: "Add {C}{C}."
    expect(
      classifyCard(card("Artifact", "Add {C}{C}."), "commanderTemplate"),
    ).toBe("Ramp");
  });

  it("matches lower-case add with multiple symbols", () => {
    expect(
      classifyCard(card("Artifact", "add {G}{W}."), "commanderTemplate"),
    ).toBe("Ramp");
  });

  it("matches basic-land-fetch oracle text", () => {
    expect(
      classifyCard(
        card("Sorcery", "Search your library for a basic land card, put it onto the battlefield tapped."),
        "commanderTemplate",
      ),
    ).toBe("Ramp");
  });

  it("matches 'up to N basic land' fetch pattern", () => {
    expect(
      classifyCard(
        card("Sorcery", "Search your library for up to two basic land cards."),
        "commanderTemplate",
      ),
    ).toBe("Ramp");
  });

  it("matches Treasure keyword", () => {
    expect(
      classifyCard(card("Instant", null, ["Treasure"]), "commanderTemplate"),
    ).toBe("Ramp");
  });

  // Precedence: Sol Ring produces mana (Ramp) and does NOT fall through to
  // Removal or any later bucket even if those patterns were present.
  it("Sol Ring is Ramp not Removal (precedence test)", () => {
    const solRing: ClassifiableCard = {
      mainType: "Artifact",
      oracleText: "Add {C}{C}.",
      keywords: [],
    };
    expect(classifyCard(solRing, "commanderTemplate")).toBe("Ramp");
  });
});

// ---------------------------------------------------------------------------
// commanderTemplate preset — Boardwipes bucket
// ---------------------------------------------------------------------------

describe("classifyCard — commanderTemplate: Boardwipes", () => {
  it("matches 'destroy all' pattern", () => {
    expect(
      classifyCard(card("Sorcery", "Destroy all creatures."), "commanderTemplate"),
    ).toBe("Boardwipes");
  });

  it("matches 'exile all' pattern", () => {
    expect(
      classifyCard(
        card("Sorcery", "Exile all nonland permanents."),
        "commanderTemplate",
      ),
    ).toBe("Boardwipes");
  });

  it("matches 'each player sacrifices' pattern", () => {
    expect(
      classifyCard(
        card("Sorcery", "Each player sacrifices three creatures."),
        "commanderTemplate",
      ),
    ).toBe("Boardwipes");
  });

  it("matches 'each creature sacrifices' pattern", () => {
    expect(
      classifyCard(
        card("Sorcery", "Each creature sacrifices itself if it has power 4 or greater."),
        "commanderTemplate",
      ),
    ).toBe("Boardwipes");
  });
});

// ---------------------------------------------------------------------------
// commanderTemplate preset — Removal bucket
// ---------------------------------------------------------------------------

describe("classifyCard — commanderTemplate: Removal", () => {
  it("matches 'destroy target creature'", () => {
    expect(
      classifyCard(
        card("Instant", "Destroy target creature."),
        "commanderTemplate",
      ),
    ).toBe("Removal");
  });

  it("matches 'exile target permanent'", () => {
    expect(
      classifyCard(
        card("Instant", "Exile target permanent."),
        "commanderTemplate",
      ),
    ).toBe("Removal");
  });

  it("matches 'exile target nonland'", () => {
    expect(
      classifyCard(
        card("Instant", "Exile target nonland permanent."),
        "commanderTemplate",
      ),
    ).toBe("Removal");
  });

  it("matches 'destroy target artifact'", () => {
    expect(
      classifyCard(
        card("Instant", "Destroy target artifact."),
        "commanderTemplate",
      ),
    ).toBe("Removal");
  });
});

// ---------------------------------------------------------------------------
// commanderTemplate preset — Card advantage bucket
// ---------------------------------------------------------------------------

describe("classifyCard — commanderTemplate: Card advantage", () => {
  it("matches 'draw a card'", () => {
    expect(
      classifyCard(card("Instant", "Draw a card."), "commanderTemplate"),
    ).toBe("Card advantage");
  });

  it("matches 'draw two cards'", () => {
    expect(
      classifyCard(card("Sorcery", "Draw two cards."), "commanderTemplate"),
    ).toBe("Card advantage");
  });

  it("matches 'draw three cards'", () => {
    expect(
      classifyCard(
        card("Sorcery", "You draw three cards."),
        "commanderTemplate",
      ),
    ).toBe("Card advantage");
  });

  it("matches 'draw X cards'", () => {
    expect(
      classifyCard(card("Sorcery", "Draw X cards."), "commanderTemplate"),
    ).toBe("Card advantage");
  });

  it("matches 'draw that many cards'", () => {
    expect(
      classifyCard(
        card("Sorcery", "Draw that many cards."),
        "commanderTemplate",
      ),
    ).toBe("Card advantage");
  });
});

// ---------------------------------------------------------------------------
// commanderTemplate preset — Gameplan (fallback) bucket
// ---------------------------------------------------------------------------

describe("classifyCard — commanderTemplate: Gameplan (fallback)", () => {
  it("puts an unclassified card in Gameplan", () => {
    expect(
      classifyCard(
        card("Creature", "Flying. Other Knights you control get +1/+1."),
        "commanderTemplate",
      ),
    ).toBe("Gameplan");
  });

  it("puts a card with no oracle text in Gameplan", () => {
    expect(
      classifyCard(card("Creature", null), "commanderTemplate"),
    ).toBe("Gameplan");
  });
});

// ---------------------------------------------------------------------------
// Priority ordering: Ramp before Removal
// ---------------------------------------------------------------------------

describe("classifyCard — commanderTemplate: priority ordering", () => {
  it("a card matching both Ramp and Removal patterns is Ramp (first match wins)", () => {
    // Contrived oracle text that would match both patterns.
    const ambiguous: ClassifiableCard = {
      mainType: "Instant",
      oracleText: "Add {G}. Destroy target creature.",
      keywords: [],
    };
    expect(classifyCard(ambiguous, "commanderTemplate")).toBe("Ramp");
  });

  it("a card matching Boardwipe and Removal patterns is Boardwipe (Boardwipe comes first)", () => {
    const ambiguous: ClassifiableCard = {
      mainType: "Sorcery",
      oracleText: "Destroy all creatures. Exile target artifact.",
      keywords: [],
    };
    expect(classifyCard(ambiguous, "commanderTemplate")).toBe("Boardwipes");
  });
});
