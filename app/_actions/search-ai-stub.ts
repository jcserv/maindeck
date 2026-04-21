"use server";

// TODO: Replace the keyword-to-syntax logic below with a real LLM call.
// Suggested approach: call Anthropic claude-haiku-3-5 with a system prompt
// instructing it to translate natural-language card descriptions into the
// Scryfall-syntax subset supported by syntax-parser.ts, then run the result
// through searchCardsBySyntax.

import { parseSyntax } from "@/app/_components/search/syntax-parser";
import { searchCardsBySyntax, type CardSearchResult } from "@/lib/search/card-search";

export type AiSearchResult = {
  syntax: string;
  results: CardSearchResult[];
};

/** Keyword-based translation stub — deterministic, no model required. */
function translateToSyntax(prompt: string): string {
  const text = prompt.toLowerCase();
  const parts: string[] = [];

  if (/white|angel|plains|life gain|lifelink/.test(text)) parts.push("c:w");
  if (/blue|counter|merfolk|draw|island/.test(text)) parts.push("c:u");
  if (/black|discard|vampire|swamp|destroy/.test(text)) parts.push("c:b");
  if (/red|burn|goblin|dragon|mountain|lightning/.test(text)) parts.push("c:r");
  if (/green|elf|ramp|forest|trample/.test(text)) parts.push("c:g");

  if (/creature/.test(text)) parts.push("t:creature");
  if (/instant/.test(text)) parts.push("t:instant");
  if (/sorcery/.test(text)) parts.push("t:sorcery");
  if (/artifact/.test(text)) parts.push("t:artifact");
  if (/enchantment/.test(text)) parts.push("t:enchantment");
  if (/planeswalker/.test(text)) parts.push("t:planeswalker");
  if (/land/.test(text)) parts.push("t:land");

  const underMatch = text.match(/under\s+(\d)/);
  if (underMatch) {
    parts.push(`cmc<=${underMatch[1]}`);
  } else if (/cheap|low.cost|one.cost|two.cost/.test(text)) {
    parts.push("cmc<=2");
  }

  if (/ramp/.test(text)) parts.push('o:"add"');
  if (/removal|destroy|exile/.test(text)) parts.push('o:destroy');
  if (/draw a card/.test(text)) parts.push('o:"draw a card"');
  if (/flying|flier/.test(text)) parts.push("o:flying");
  if (/flash/.test(text)) parts.push("o:flash");
  if (/haste/.test(text)) parts.push("o:haste");
  if (/vigilance/.test(text)) parts.push("o:vigilance");
  if (/deathtouch/.test(text)) parts.push("o:deathtouch");

  return parts.join(" ") || "t:creature cmc<=3";
}

export async function translateAndSearch(prompt: string): Promise<AiSearchResult> {
  const syntax = translateToSyntax(prompt);
  const parsed = parseSyntax(syntax);
  const results = await searchCardsBySyntax(parsed, [], [], 60);
  return { syntax, results };
}
