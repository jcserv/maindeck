import { describe, expect, it } from "vitest";
import { toCardCreate, toPrintingCreate } from "../map";
import type { ScryfallCard } from "../types";
import { CardType } from "../types-card";

function makeCard(overrides: Partial<ScryfallCard> = {}): ScryfallCard {
  return {
    id: "scry-1",
    lang: "en",
    layout: "normal",
    games: ["paper", "mtgo", "arena", "sega"],
    name: "Test Card",
    type_line: "Creature — Human Wizard",
    oracle_text: "Do a thing.",
    mana_cost: "{1}{U}",
    cmc: 2,
    colors: ["U", "X"],
    color_identity: ["U"],
    keywords: ["Flying", "Trample", "Bogus"],
    power: "1",
    toughness: "2",
    legalities: { standard: "legal", commander: "legal", bogus: "legal" },
    reserved: false,
    game_changer: false,
    set: "tst",
    set_name: "Test Set",
    collector_number: "42",
    promo_types: [],
    finishes: ["nonfoil", "foil"],
    image_uris: { normal: "https://img/front.png" },
    prices: {
      usd: "1.00",
      usd_foil: "2.00",
      usd_etched: null,
      eur: "0.80",
      eur_foil: "",
    },
    ...overrides,
  };
}

describe("toCardCreate", () => {
  it("throws when name is missing", () => {
    const c = makeCard({ name: undefined as unknown as string });
    expect(() => toCardCreate(c)).toThrow("Card must have a name");
  });

  it("normalizes a full card", () => {
    const out = toCardCreate(makeCard());
    expect(out.name).toBe("Test Card");
    expect(out.mainType).toBe(CardType.Creature);
    expect(out.typeLine).toBe("Creature — Human Wizard");
    expect(out.oracleText).toBe("Do a thing.");
    expect(out.manaCost).toBe("{1}{U}");
    expect(out.cmc).toBe(2);
    expect(out.colors).toEqual(["U"]);
    expect(out.colorIdentity).toEqual(["U"]);
    expect(out.keywords).toEqual(["Flying", "Trample"]);
    expect(out.power).toBe("1");
    expect(out.toughness).toBe("2");
    expect(out.games).toEqual(["paper", "mtgo", "arena"]);
    const legalities = out.legalities as Record<string, string>;
    expect(legalities.standard).toBe("legal");
    expect(legalities.commander).toBe("legal");
    expect("bogus" in legalities).toBe(false);
    expect(out.reserved).toBe(false);
    expect(out.gameChanger).toBe(false);
    expect(typeof out.version).toBe("string");
  });

  it("is deterministic — same input twice yields same version", () => {
    const a = toCardCreate(makeCard());
    const b = toCardCreate(makeCard());
    expect(a.version).toBe(b.version);
  });

  it("different oracle text yields different version", () => {
    const a = toCardCreate(makeCard());
    const b = toCardCreate(makeCard({ oracle_text: "Do a different thing." }));
    expect(a.version).not.toBe(b.version);
  });

  it.each<[keyof ScryfallCard, Partial<ScryfallCard>]>([
    ["name", { name: "Other Card" }],
    ["type_line", { type_line: "Instant" }],
    ["oracle_text", { oracle_text: "Different." }],
    ["mana_cost", { mana_cost: "{2}" }],
    ["cmc", { cmc: 3 }],
    ["colors", { colors: ["R"] }],
    ["color_identity", { color_identity: ["R"] }],
    ["keywords", { keywords: ["Haste"] }],
    ["power", { power: "2" }],
    ["toughness", { toughness: "3" }],
    ["games", { games: ["paper"] }],
    ["legalities", { legalities: { modern: "legal" } }],
    ["reserved", { reserved: true }],
    ["game_changer", { game_changer: true }],
  ])("mutating %s changes the version hash", (_field, patch) => {
    const base = toCardCreate(makeCard());
    const mutated = toCardCreate(makeCard(patch));
    expect(mutated.version).not.toBe(base.version);
  });

  it("defaults undefined optionals", () => {
    const out = toCardCreate(
      makeCard({
        type_line: undefined,
        oracle_text: undefined,
        mana_cost: undefined,
        cmc: undefined,
        colors: undefined,
        color_identity: undefined,
        keywords: undefined,
        power: undefined,
        toughness: undefined,
        games: undefined as unknown as string[],
        legalities: undefined,
        reserved: undefined,
        game_changer: undefined,
      }),
    );
    expect(out.typeLine).toBeNull();
    expect(out.oracleText).toBeNull();
    expect(out.manaCost).toBeNull();
    expect(out.cmc).toBeNull();
    expect(out.colors).toEqual([]);
    expect(out.colorIdentity).toEqual([]);
    expect(out.keywords).toEqual([]);
    expect(out.power).toBeNull();
    expect(out.toughness).toBeNull();
    expect(out.games).toEqual([]);
    expect(out.reserved).toBe(false);
    expect(out.gameChanger).toBe(false);
    // mainType still resolves via fallback
    expect(out.mainType).toBe(CardType.Unknown);
  });
});

describe("toPrintingCreate", () => {
  it("uses image_uris.normal when present; backImageUri null", () => {
    const p = toPrintingCreate(1, makeCard());
    expect(p.imageUri).toBe("https://img/front.png");
    expect(p.backImageUri).toBeNull();
  });

  it("falls back to single card_faces[0] image when image_uris missing", () => {
    const p = toPrintingCreate(
      1,
      makeCard({
        image_uris: undefined,
        card_faces: [{ image_uris: { normal: "https://img/face.png" } }],
      }),
    );
    expect(p.imageUri).toBe("https://img/face.png");
    expect(p.backImageUri).toBeNull();
  });

  it("uses front and back images when two card_faces exist", () => {
    const p = toPrintingCreate(
      1,
      makeCard({
        image_uris: undefined,
        card_faces: [
          { image_uris: { normal: "https://img/front.png" } },
          { image_uris: { normal: "https://img/back.png" } },
        ],
      }),
    );
    expect(p.imageUri).toBe("https://img/front.png");
    expect(p.backImageUri).toBe("https://img/back.png");
  });

  it("throws when no image is available anywhere", () => {
    const card = makeCard({ image_uris: undefined, card_faces: undefined });
    expect(() => toPrintingCreate(1, card)).toThrow(
      "Printing scry-1 has no image_uri",
    );
  });

  it("throws when card_faces[0] has no image_uris (front chain falls through to null)", () => {
    const card = makeCard({ image_uris: undefined, card_faces: [{}] });
    expect(() => toPrintingCreate(1, card)).toThrow(
      "Printing scry-1 has no image_uri",
    );
  });

  it("back face with no image_uris leaves backImageUri null", () => {
    const p = toPrintingCreate(
      1,
      makeCard({
        image_uris: undefined,
        card_faces: [{ image_uris: { normal: "https://img/front.png" } }, {}],
      }),
    );
    expect(p.imageUri).toBe("https://img/front.png");
    expect(p.backImageUri).toBeNull();
  });

  it("detects serialized promo type", () => {
    const p = toPrintingCreate(1, makeCard({ promo_types: ["serialized"] }));
    expect(p.isSerialized).toBe(true);
  });

  it("isSerialized false when promo_types absent", () => {
    const p = toPrintingCreate(1, makeCard({ promo_types: undefined }));
    expect(p.isSerialized).toBe(false);
  });

  it("lowercases and filters finishes", () => {
    const p = toPrintingCreate(
      1,
      makeCard({ finishes: ["Foil", "bogus", "Etched"] }),
    );
    expect(p.finishes).toEqual(["foil", "etched"]);
  });

  it("passes finishes through as empty when undefined", () => {
    const p = toPrintingCreate(1, makeCard({ finishes: undefined }));
    expect(p.finishes).toEqual([]);
  });

  it("maps prices: undefined / '' / null → null; real string passthrough", () => {
    const p = toPrintingCreate(
      1,
      makeCard({
        prices: {
          usd: "3.50",
          usd_foil: "",
          usd_etched: null,
          eur: undefined,
          eur_foil: undefined,
        },
      }),
    );
    expect(p.priceUsd).toBe("3.50");
    expect(p.priceUsdFoil).toBeNull();
    expect(p.priceUsdEtched).toBeNull();
    expect(p.priceEur).toBeNull();
    expect(p.priceEurFoil).toBeNull();
  });

  it("priceEurEtched is always null (Scryfall schema gap)", () => {
    const p = toPrintingCreate(1, makeCard());
    expect(p.priceEurEtched).toBeNull();
  });

  it("treats undefined prices object as all null", () => {
    const p = toPrintingCreate(1, makeCard({ prices: undefined }));
    expect(p.priceUsd).toBeNull();
    expect(p.priceUsdFoil).toBeNull();
    expect(p.priceUsdEtched).toBeNull();
    expect(p.priceEur).toBeNull();
    expect(p.priceEurFoil).toBeNull();
  });

  it("same card twice → same version", () => {
    const a = toPrintingCreate(1, makeCard());
    const b = toPrintingCreate(1, makeCard());
    expect(a.version).toBe(b.version);
  });

  it("changing setCode changes the version", () => {
    const a = toPrintingCreate(1, makeCard());
    const b = toPrintingCreate(1, makeCard({ set: "other" }));
    expect(a.version).not.toBe(b.version);
  });
});
