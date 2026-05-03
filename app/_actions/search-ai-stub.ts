"use server";

// TODO: Replace the keyword-to-syntax logic below with a real LLM call.
// Suggested approach: call Anthropic claude-haiku-3-5 with a system prompt
// instructing it to translate natural-language card descriptions into the
// Scryfall-syntax subset supported by syntax-parser.ts, then run the result
// through searchCardsBySyntax.

import { parseSyntax } from "@/lib/search/syntax-parser";
import { searchCardsBySyntax, type CardSearchResult } from "@/lib/search/card-search";

type AiSearchResult = {
  syntax: string;
  results: CardSearchResult[];
};

const KEYWORD_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/white|angel|plains|life gain|lifelink/, "c:w"],
  [/blue|counter|merfolk|draw|island/, "c:u"],
  [/black|discard|vampire|swamp|destroy/, "c:b"],
  [/red|burn|goblin|dragon|mountain|lightning/, "c:r"],
  [/green|elf|ramp|forest|trample/, "c:g"],
  [/creature/, "t:creature"],
  [/instant/, "t:instant"],
  [/sorcery/, "t:sorcery"],
  [/artifact/, "t:artifact"],
  [/enchantment/, "t:enchantment"],
  [/planeswalker/, "t:planeswalker"],
  [/land/, "t:land"],
  [/ramp/, 'o:"add"'],
  [/removal|destroy|exile/, "o:destroy"],
  [/draw a card/, 'o:"draw a card"'],
  [/flying|flier/, "o:flying"],
  [/flash/, "o:flash"],
  [/haste/, "o:haste"],
  [/vigilance/, "o:vigilance"],
  [/deathtouch/, "o:deathtouch"],
];

function cmcClause(text: string): string | null {
  const underMatch = text.match(/under\s+(\d)/);
  if (underMatch) return `cmc<=${underMatch[1]}`;
  if (/cheap|low.cost|one.cost|two.cost/.test(text)) return "cmc<=2";
  return null;
}

/** Keyword-based translation stub — deterministic, no model required. */
function translateToSyntax(prompt: string): string {
  const text = prompt.toLowerCase();
  const parts = KEYWORD_RULES.flatMap(([re, clause]) =>
    re.test(text) ? [clause] : [],
  );
  const cmc = cmcClause(text);
  if (cmc) parts.push(cmc);
  return parts.join(" ") || "t:creature cmc<=3";
}

export async function translateAndSearch(prompt: string): Promise<AiSearchResult> {
  const syntax = translateToSyntax(prompt);
  const parsed = parseSyntax(syntax);
  const results = await searchCardsBySyntax(parsed, [], [], 60);
  return { syntax, results };
}
