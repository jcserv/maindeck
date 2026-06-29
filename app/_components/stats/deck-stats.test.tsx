import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));

import { DeckStats } from "./deck-stats";
import { type DeckCardWithRelations } from "@/lib/stats/compute";
import { type CardType, type Zone } from "@/lib/generated/prisma/enums";

let _id = 0;
function makeDeckCard(
  mainType: CardType,
  cmc: number,
  quantity: number,
  opts: { typeLine?: string; category?: string | null; zone?: Zone } = {},
): DeckCardWithRelations & { category: string | null; id: string } {
  _id += 1;
  return {
    id: `dc-${_id}`,
    quantity,
    zone: opts.zone ?? "MAINBOARD",
    category: opts.category ?? null,
    printing: null,
    card: {
      name: `Card ${_id}`,
      mainType,
      typeLine: opts.typeLine ?? `${mainType} — Test`,
      oracleText: null,
      manaCost: null,
      cmc,
      colors: [],
    },
  } as unknown as DeckCardWithRelations & { category: string | null; id: string };
}

// A representative Commander-ish deck: spells across several types + 24 lands.
// Whole-deck nonland MV total = (2*4)+(3*4)+(4*2) creatures + (1*4) instants
// + (3*3) sorceries = 41 across 17 nonland cards => avg 2.41.
// Lands = 24, mainboard size = 41 => expected opening-hand lands 24/41*7 = 4.1.
const deckCards = [
  makeDeckCard("Creature", 2, 4, { category: "Beaters" }),
  makeDeckCard("Creature", 3, 4, { category: "Beaters" }),
  makeDeckCard("Creature", 4, 2, { category: "Beaters" }),
  makeDeckCard("Instant", 1, 4, { category: "Interaction" }),
  makeDeckCard("Sorcery", 3, 3, { category: "Ramp" }),
  makeDeckCard("Land", 0, 24, { typeLine: "Basic Land — Forest", category: "Lands" }),
];

const deck = {
  cards: deckCards,
  categories: [
    { name: "Beaters" },
    { name: "Interaction" },
    { name: "Ramp" },
    { name: "Lands" },
  ],
} as unknown as React.ComponentProps<typeof DeckStats>["deck"];

const EVIDENCE_DIR =
  "/var/folders/b2/rft4yv4177d6mpkbhbwj7svc0000gn/T/no-mistakes-evidence/01KW7BR30NHQDAXGPK0BKA3S25";

// Wrap the captured component markup in a standalone page styled with the real
// project design tokens (extracted from app/globals.css) compiled live by the
// Tailwind v4 browser CDN, so the screenshot reflects the true end-user surface.
function writeEvidenceHtml(name: string, bodyHtml: string, caption: string) {
  // Expand the "More stats" disclosure so the StatSummary line (avg MV / land
  // counts) is visible in the screenshot — that line carries the two key
  // whole-deck decisions under test.
  bodyHtml = bodyHtml.replace("<details ", "<details open ");
  const css = readFileSync(resolve(__dirname, "../../globals.css"), "utf8")
    .split("\n")
    .filter(
      (l) =>
        !l.includes('@import "tw-animate-css"') &&
        !l.includes('@import "shadcn/tailwind.css"'),
    )
    .join("\n");
  const html = `<!doctype html>
<html><head><meta charset="utf-8" />
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
<style type="text/tailwindcss">${css}</style>
</head>
<body class="bg-background text-foreground p-8" style="font-family: ui-sans-serif, system-ui, sans-serif">
<p class="mb-4 max-w-2xl text-sm text-muted-foreground">${caption}</p>
<div class="max-w-3xl">${bodyHtml}</div>
</body></html>`;
  try {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(resolve(EVIDENCE_DIR, name), html, "utf8");
  } catch {
    // Evidence capture is best-effort; never fail the assertions on FS issues.
  }
}

function barLabel(bucket: string): string {
  return screen
    .getByLabelText(new RegExp(`^CMC ${bucket.replace("+", "\\+")}: `))
    .getAttribute("aria-label")!;
}

describe("DeckStats deck-health filter", () => {
  it("scopes the curve to the selected type while keeping land/avg-MV stats whole-deck", async () => {
    const user = userEvent.setup();
    const { container } = render(<DeckStats deck={deck} />);

    const summary = () => screen.getByText(/average mana value of/i);

    // --- Unfiltered: whole deck ---
    expect(summary()).toHaveTextContent(
      "average mana value of 2.41",
    );
    expect(summary()).toHaveTextContent("contains 24 lands");
    expect(summary()).toHaveTextContent("average of 4.1 in your opening hand");
    // Curve mixes creatures + instants + sorceries.
    expect(barLabel("1")).toBe("CMC 1: 4 cards"); // instants
    expect(barLabel("2")).toBe("CMC 2: 4 cards"); // creatures
    expect(barLabel("3")).toBe("CMC 3: 7 cards"); // 4 creatures + 3 sorceries
    expect(barLabel("4")).toBe("CMC 4: 2 cards"); // creatures
    writeEvidenceHtml(
      "deck-stats-unfiltered.html",
      container.innerHTML,
      "Deck Health — no filter active. Mana curve covers every spell type; summary reads avg MV 2.41 across 24 lands.",
    );

    // --- Apply the "Creature" type filter ---
    const creatureChip = screen.getByRole("button", { name: /Creature/i });
    await user.click(creatureChip);
    expect(creatureChip).toHaveAttribute("aria-pressed", "true");

    // Curve now reflects creatures only: CMC1 (instants) drops to 0,
    // CMC3 drops from 7 -> 4 (sorceries excluded).
    expect(barLabel("1")).toBe("CMC 1: 0 cards");
    expect(barLabel("2")).toBe("CMC 2: 4 cards");
    expect(barLabel("3")).toBe("CMC 3: 4 cards");
    expect(barLabel("4")).toBe("CMC 4: 2 cards");

    // KEY DECISIONS: land count, expected lands, and average MV are computed
    // from the WHOLE deck, so they do NOT change when a spell filter is on.
    expect(summary()).toHaveTextContent("average mana value of 2.41");
    expect(summary()).toHaveTextContent("contains 24 lands");
    expect(summary()).toHaveTextContent("average of 4.1 in your opening hand");

    writeEvidenceHtml(
      "deck-stats-creature-filter.html",
      container.innerHTML,
      "Deck Health — 'Creature' filter active (highlighted chip). Curve recomputes to creatures only (CMC 1 now 0), yet the summary still reads avg MV 2.41 / 24 lands / 4.1 expected — land + avg-MV stats stay whole-deck by design.",
    );
  });

  it("clears the filter and restores the whole-deck curve", async () => {
    const user = userEvent.setup();
    render(<DeckStats deck={deck} />);

    await user.click(screen.getByRole("button", { name: /Instant/i }));
    expect(barLabel("3")).toBe("CMC 3: 0 cards"); // instants only -> no CMC3

    const clear = screen.getByRole("button", { name: /^clear$/i });
    await user.click(clear);
    expect(barLabel("3")).toBe("CMC 3: 7 cards"); // back to whole deck
  });

  it("supports selecting multiple types at once", async () => {
    const user = userEvent.setup();
    render(<DeckStats deck={deck} />);

    await user.click(screen.getByRole("button", { name: /Creature/i }));
    await user.click(screen.getByRole("button", { name: /Sorcery/i }));

    // Creatures + sorceries: CMC1 (instants) excluded, CMC3 = 4 + 3 = 7.
    expect(barLabel("1")).toBe("CMC 1: 0 cards");
    expect(barLabel("3")).toBe("CMC 3: 7 cards");
    expect(barLabel("4")).toBe("CMC 4: 2 cards");
    void within; // keep import used if refactored
  });
});
