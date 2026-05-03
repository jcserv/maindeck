import { describe, expect, it } from "vitest";
import { Format } from "@/lib/generated/prisma/enums";
import {
  buildDecklistText,
  classifyPrecon,
  hashDeckContent,
  mapMtgjsonTypeToFormat,
} from "../map";
import type { MtgjsonDeckFile } from "../mtgjson";

function makeDeck(overrides: Partial<MtgjsonDeckFile> = {}): MtgjsonDeckFile {
  return {
    code: "TST",
    name: "Test Deck",
    type: "Commander Deck",
    releaseDate: "2026-01-01",
    commander: [],
    mainBoard: [],
    sideBoard: [],
    ...overrides,
  };
}

describe("mapMtgjsonTypeToFormat", () => {
  it.each([
    ["Commander Deck", Format.COMMANDER],
    ["Brawl Deck", Format.BRAWL],
    ["Standard Deck", Format.STANDARD],
    ["Challenger Deck", Format.STANDARD],
    ["Planeswalker Deck", Format.STANDARD],
    ["Modern Deck", Format.MODERN],
    ["Pioneer Deck", Format.PIONEER],
    ["Pauper Deck", Format.PAUPER],
    ["Oathbreaker Deck", Format.OATHBREAKER],
  ])("maps %s to %s", (input, expected) => {
    expect(mapMtgjsonTypeToFormat(input)).toBe(expected);
  });

  it("falls back to CASUAL for unknown types", () => {
    expect(mapMtgjsonTypeToFormat("Jumpstart")).toBe(Format.CASUAL);
    expect(mapMtgjsonTypeToFormat("Archenemy Deck")).toBe(Format.CASUAL);
    expect(mapMtgjsonTypeToFormat("")).toBe(Format.CASUAL);
  });
});

describe("buildDecklistText", () => {
  it("emits a // Commander section before mainboard when commander is present", () => {
    const text = buildDecklistText(
      makeDeck({
        commander: [{ name: "Atraxa, Praetors' Voice", count: 1 }],
        mainBoard: [
          { name: "Sol Ring", count: 1 },
          { name: "Swamp", count: 10 },
        ],
      }),
    );

    const commanderIdx = text.indexOf("// Commander");
    const mainboardIdx = text.indexOf("// Mainboard");
    expect(commanderIdx).toBeGreaterThanOrEqual(0);
    expect(mainboardIdx).toBeGreaterThan(commanderIdx);
    expect(text).toContain("1 Atraxa, Praetors' Voice");
    expect(text).toContain("1 Sol Ring");
    expect(text).toContain("10 Swamp");
  });

  it("omits the commander section when no commanders exist", () => {
    const text = buildDecklistText(
      makeDeck({
        type: "Standard Deck",
        commander: [],
        mainBoard: [{ name: "Lightning Bolt", count: 4 }],
      }),
    );
    expect(text).not.toContain("// Commander");
    expect(text).toContain("// Mainboard");
    expect(text).toContain("4 Lightning Bolt");
  });

  it("emits a // Sideboard section when sideboard cards exist", () => {
    const text = buildDecklistText(
      makeDeck({
        type: "Standard Deck",
        mainBoard: [{ name: "Lightning Bolt", count: 4 }],
        sideBoard: [{ name: "Dress Down", count: 2 }],
      }),
    );
    expect(text).toContain("// Sideboard");
    expect(text).toContain("2 Dress Down");
  });

  it("does not emit a sideboard header when sideboard is empty", () => {
    const text = buildDecklistText(
      makeDeck({
        commander: [{ name: "Atraxa, Praetors' Voice", count: 1 }],
        mainBoard: [{ name: "Sol Ring", count: 1 }],
      }),
    );
    expect(text).not.toContain("// Sideboard");
  });
});

describe("classifyPrecon", () => {
  function bigBoard(n: number) {
    return Array.from({ length: n }, (_, i) => ({ name: `Card ${i}`, count: 1 }));
  }

  it("accepts a 100-card Commander deck", () => {
    const v = classifyPrecon(
      makeDeck({
        type: "Commander Deck",
        commander: [{ name: "Atraxa", count: 1 }],
        mainBoard: bigBoard(99),
      }),
    );
    expect(v).toEqual({ ok: true });
  });

  it("accepts a 60-card Duel Deck", () => {
    const v = classifyPrecon(
      makeDeck({ type: "Duel Deck", mainBoard: bigBoard(60) }),
    );
    expect(v).toEqual({ ok: true });
  });

  it("accepts an unknown product type by default (denylist, not allowlist)", () => {
    const v = classifyPrecon(
      makeDeck({ type: "Brand New Product Line", mainBoard: bigBoard(60) }),
    );
    expect(v).toEqual({ ok: true });
  });

  it("rejects From the Vault as denied_type even with valid card count", () => {
    const v = classifyPrecon(
      makeDeck({ type: "From the Vault", mainBoard: bigBoard(60) }),
    );
    expect(v).toEqual({ ok: false, reason: "denied_type", cardCount: 60 });
  });

  it("rejects Foil Set / Box Set / Promo Set / Secret Lair Drop / Vanguard / Signature Spellbook / MTGO Redemption", () => {
    for (const type of [
      "Foil Set",
      "Box Set",
      "Promo Set",
      "Secret Lair Drop",
      "Vanguard",
      "Signature Spellbook",
      "MTGO Redemption",
    ]) {
      const v = classifyPrecon(makeDeck({ type, mainBoard: bigBoard(300) }));
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.reason).toBe("denied_type");
    }
  });

  it("rejects an allowed type below the card-count floor as below_card_floor", () => {
    const v = classifyPrecon(
      makeDeck({ type: "Welcome Deck", mainBoard: bigBoard(10) }),
    );
    expect(v).toEqual({ ok: false, reason: "below_card_floor", cardCount: 10 });
  });

  it("denied_type takes precedence over below_card_floor", () => {
    const v = classifyPrecon(
      makeDeck({ type: "From the Vault", mainBoard: bigBoard(15) }),
    );
    expect(v).toEqual({ ok: false, reason: "denied_type", cardCount: 15 });
  });
});

describe("hashDeckContent", () => {
  it("is deterministic for the same input", () => {
    const a = hashDeckContent("// Mainboard\n1 Sol Ring\n");
    const b = hashDeckContent("// Mainboard\n1 Sol Ring\n");
    expect(a).toBe(b);
  });

  it("differs when content differs", () => {
    const a = hashDeckContent("// Mainboard\n1 Sol Ring\n");
    const b = hashDeckContent("// Mainboard\n2 Sol Ring\n");
    expect(a).not.toBe(b);
  });

  it("returns a non-empty hex string", () => {
    expect(hashDeckContent("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});
