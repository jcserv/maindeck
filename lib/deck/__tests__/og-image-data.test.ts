import { describe, expect, it } from "vitest";
import { Format, Zone } from "@/lib/generated/prisma/enums";
import { buildDeckOgImageData, pickHeroImage } from "../og-image-data";
import type { Deck, DeckCard } from "../zone-view";

interface MakeDeckCardInput {
  id?: string;
  zone: Zone;
  quantity?: number;
  cardName: string;
  cmc?: number | null;
  typeLine?: string;
  gameChanger?: boolean;
  pinnedImage?: string | null;
  firstPrintingImage?: string | null;
}

function makeDeckCard(input: MakeDeckCardInput): DeckCard {
  const printing =
    input.pinnedImage !== undefined
      ? input.pinnedImage === null
        ? null
        : { imageUri: input.pinnedImage }
      : null;

  const printings =
    input.firstPrintingImage !== undefined
      ? [{ imageUri: input.firstPrintingImage }]
      : [];

  return {
    id: input.id ?? `dc-${input.cardName}`,
    zone: input.zone,
    quantity: input.quantity ?? 1,
    category: null,
    isFoil: false,
    card: {
      id: `c-${input.cardName}`,
      name: input.cardName,
      typeLine: input.typeLine ?? "Creature",
      cmc: input.cmc === undefined ? 0 : input.cmc,
      manaCost: null,
      colors: [],
      colorIdentity: [],
      mainType: "Creature",
      oracleText: null,
      legalities: {},
      gameChanger: input.gameChanger ?? false,
      printings,
    },
    printing,
  } as unknown as DeckCard;
}

interface MakeDeckInput {
  format?: Format;
  name?: string;
  manualBracket?: number | null;
  username?: string;
  cards: DeckCard[];
}

function makeDeck(input: MakeDeckInput): Deck {
  return {
    id: "deck-1",
    userId: "user-1",
    name: input.name ?? "Test Deck",
    description: null,
    format: input.format ?? Format.COMMANDER,
    visibility: "PUBLIC",
    manualBracket: input.manualBracket ?? null,
    cards: input.cards,
    categories: [],
    user: {
      id: "user-1",
      username: input.username ?? "alice",
      image: null,
    },
  } as unknown as Deck;
}

describe("pickHeroImage", () => {
  it("uses the commander card image when present", () => {
    const deck = makeDeck({
      cards: [
        makeDeckCard({
          zone: Zone.COMMANDER,
          cardName: "Atraxa",
          typeLine: "Legendary Creature — Phyrexian Angel Horror",
          pinnedImage: "https://example.com/atraxa.png",
        }),
        makeDeckCard({
          zone: Zone.MAINBOARD,
          cardName: "Sol Ring",
          cmc: 1,
          typeLine: "Artifact",
          firstPrintingImage: "https://example.com/sol-ring.png",
        }),
      ],
    });

    expect(pickHeroImage(deck)).toBe("https://example.com/atraxa.png");
  });

  it("falls back to the canonical printing when commander has no pinned image", () => {
    const deck = makeDeck({
      cards: [
        makeDeckCard({
          zone: Zone.COMMANDER,
          cardName: "Atraxa",
          typeLine: "Legendary Creature — Phyrexian Angel Horror",
          firstPrintingImage: "https://example.com/atraxa-canonical.png",
        }),
      ],
    });

    expect(pickHeroImage(deck)).toBe(
      "https://example.com/atraxa-canonical.png",
    );
  });

  it("falls back to the highest-CMC mainboard creature when there is no commander", () => {
    const deck = makeDeck({
      format: Format.MODERN,
      cards: [
        makeDeckCard({
          zone: Zone.MAINBOARD,
          cardName: "Llanowar Elves",
          cmc: 1,
          typeLine: "Creature — Elf Druid",
          firstPrintingImage: "https://example.com/llanowar.png",
        }),
        makeDeckCard({
          zone: Zone.MAINBOARD,
          cardName: "Emrakul",
          cmc: 15,
          typeLine: "Legendary Creature — Eldrazi",
          firstPrintingImage: "https://example.com/emrakul.png",
        }),
        // A higher-CMC creature *before* the winner exercises the "keep best"
        // branch of the reduce; one *after* the winner exercises the
        // "replace best" branch.
        makeDeckCard({
          zone: Zone.MAINBOARD,
          cardName: "Goblin Guide",
          cmc: 1,
          typeLine: "Creature — Goblin Scout",
          firstPrintingImage: "https://example.com/guide.png",
        }),
        makeDeckCard({
          zone: Zone.MAINBOARD,
          cardName: "Lightning Bolt",
          cmc: 1,
          typeLine: "Instant",
          firstPrintingImage: "https://example.com/bolt.png",
        }),
        makeDeckCard({
          // Sideboard creatures must be ignored.
          zone: Zone.SIDEBOARD,
          cardName: "Ulamog",
          cmc: 20,
          typeLine: "Legendary Creature — Eldrazi",
          firstPrintingImage: "https://example.com/ulamog.png",
        }),
      ],
    });

    expect(pickHeroImage(deck)).toBe("https://example.com/emrakul.png");
  });

  it("returns null when there are no creatures (gradient fallback)", () => {
    const deck = makeDeck({
      format: Format.MODERN,
      cards: [
        makeDeckCard({
          zone: Zone.MAINBOARD,
          cardName: "Lightning Bolt",
          cmc: 1,
          typeLine: "Instant",
          firstPrintingImage: "https://example.com/bolt.png",
        }),
        makeDeckCard({
          zone: Zone.MAINBOARD,
          cardName: "Sol Ring",
          cmc: 1,
          typeLine: "Artifact",
          firstPrintingImage: "https://example.com/sol-ring.png",
        }),
      ],
    });

    expect(pickHeroImage(deck)).toBeNull();
  });

  it("falls through to mainboard creatures when the commander has no image", () => {
    const deck = makeDeck({
      cards: [
        makeDeckCard({
          zone: Zone.COMMANDER,
          cardName: "Atraxa",
          typeLine: "Legendary Creature — Phyrexian Angel Horror",
          pinnedImage: null,
        }),
        makeDeckCard({
          zone: Zone.MAINBOARD,
          cardName: "Eternal Witness",
          cmc: 3,
          typeLine: "Creature — Human Shaman",
          firstPrintingImage: "https://example.com/witness.png",
        }),
      ],
    });

    expect(pickHeroImage(deck)).toBe("https://example.com/witness.png");
  });

  it("treats a creature with null cmc as cmc 0 when picking the highest", () => {
    const deck = makeDeck({
      format: Format.MODERN,
      cards: [
        makeDeckCard({
          zone: Zone.MAINBOARD,
          cardName: "Mystery Creature",
          cmc: null,
          typeLine: "Creature",
          firstPrintingImage: "https://example.com/mystery.png",
        }),
        makeDeckCard({
          zone: Zone.MAINBOARD,
          cardName: "Big Dude",
          cmc: 7,
          typeLine: "Creature — Giant",
          firstPrintingImage: "https://example.com/giant.png",
        }),
      ],
    });

    expect(pickHeroImage(deck)).toBe("https://example.com/giant.png");
  });
});

describe("buildDeckOgImageData", () => {
  it("packages title, format, bracket, username, and a commander hero image", () => {
    const deck = makeDeck({
      name: "Atraxa Superfriends",
      username: "alice",
      cards: [
        makeDeckCard({
          zone: Zone.COMMANDER,
          cardName: "Atraxa",
          typeLine: "Legendary Creature — Phyrexian Angel Horror",
          gameChanger: true,
          pinnedImage: "https://example.com/atraxa.png",
        }),
      ],
    });

    const data = buildDeckOgImageData(deck);

    expect(data).toEqual({
      heroImageUrl: "https://example.com/atraxa.png",
      title: "Atraxa Superfriends",
      format: Format.COMMANDER,
      bracket: "Upgraded",
      username: "alice",
    });
  });

  it("omits the bracket for non-Commander formats", () => {
    const deck = makeDeck({
      format: Format.MODERN,
      name: "Burn",
      cards: [
        makeDeckCard({
          zone: Zone.MAINBOARD,
          cardName: "Goblin Guide",
          cmc: 1,
          typeLine: "Creature — Goblin Scout",
          firstPrintingImage: "https://example.com/goblin.png",
        }),
      ],
    });

    const data = buildDeckOgImageData(deck);

    expect(data.format).toBe(Format.MODERN);
    expect(data.bracket).toBeNull();
    expect(data.heroImageUrl).toBe("https://example.com/goblin.png");
  });

  it("treats an out-of-range manual bracket as a missing bracket label", () => {
    const deck = makeDeck({
      manualBracket: 42,
      cards: [
        makeDeckCard({
          zone: Zone.COMMANDER,
          cardName: "Atraxa",
          typeLine: "Legendary Creature — Phyrexian Angel Horror",
          pinnedImage: "https://example.com/atraxa.png",
        }),
      ],
    });

    expect(buildDeckOgImageData(deck).bracket).toBeNull();
  });

  it("returns a null heroImageUrl when no creatures exist (gradient fallback)", () => {
    const deck = makeDeck({
      format: Format.MODERN,
      name: "Spell Slinger",
      cards: [
        makeDeckCard({
          zone: Zone.MAINBOARD,
          cardName: "Lightning Bolt",
          cmc: 1,
          typeLine: "Instant",
          firstPrintingImage: "https://example.com/bolt.png",
        }),
      ],
    });

    expect(buildDeckOgImageData(deck).heroImageUrl).toBeNull();
  });
});
