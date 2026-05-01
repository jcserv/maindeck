/**
 * Scryfall-syntax subset parser.
 *
 * Supported operators (case-insensitive):
 *   c:WUBRG       — color identity contains all specified colors
 *   t:<type>      — type line contains the word (e.g. t:creature)
 *   cmc<=N        — converted mana cost comparison (<=, >=, <, >, =, :)
 *   cmc>=N
 *   cmc<N
 *   cmc>N
 *   cmc=N
 *   cmc:N         — treated as cmc=N
 *   o:"text"      — oracle text contains phrase (quotes required)
 *   o:word        — oracle text contains word
 *   "quoted name" — card name contains phrase
 *   bare word     — card name ILIKE %word%
 *
 * NOT supported: set:, is:, pow:, tou:, id:, r: (rarity), artist:, etc.
 */

export type ParsedWhere = {
  /** ILIKE name fragments — ANDed together */
  nameFragments: string[];
  /** Colors that must ALL appear in the card's colors array */
  colors: string[];
  /** Type line must contain all of these strings */
  typeFragments: string[];
  /** CMC filters */
  cmcFilters: Array<{ op: "<=" | ">=" | "<" | ">" | "="; value: number }>;
  /** Oracle text must contain all of these strings */
  oracleFragments: string[];
};

const OP_MAP: Record<string, "<=" | ">=" | "<" | ">" | "="> = {
  "<=": "<=",
  ">=": ">=",
  "<": "<",
  ">": ">",
  "=": "=",
  ":": "=",
};

export function parseSyntax(input: string): ParsedWhere {
  const result: ParsedWhere = {
    nameFragments: [],
    colors: [],
    typeFragments: [],
    cmcFilters: [],
    oracleFragments: [],
  };

  // Tokenize: quoted strings become single tokens, everything else split by whitespace
  const raw = input.trim();
  const tokens: string[] = [];
  let m: RegExpExecArray | null;
  const tokenizer = /(?:[^\s"]+|"[^"]*")+/g;
  while ((m = tokenizer.exec(raw)) !== null) {
    tokens.push(m[0]);
  }

  for (const token of tokens) {
    // c:WUBRG
    const colorMatch = token.match(/^c[=:]([wubrg]+)$/i);
    if (colorMatch?.[1]) {
      result.colors.push(...colorMatch[1].toUpperCase().split(""));
      continue;
    }

    // t:type
    const typeMatch = token.match(/^t[=:]([a-z]+)$/i);
    if (typeMatch?.[1]) {
      result.typeFragments.push(typeMatch[1]);
      continue;
    }

    // cmc operator
    const cmcMatch = token.match(/^cmc(<=|>=|<|>|=|:)(\d+)$/i);
    if (cmcMatch?.[1] && cmcMatch[2]) {
      const op = OP_MAP[cmcMatch[1]] ?? "=";
      result.cmcFilters.push({ op, value: parseInt(cmcMatch[2], 10) });
      continue;
    }

    // o:"phrase" or o:word
    const oracleMatch = token.match(/^o[=:](?:"([^"]*)"|([\w'-]+))$/i);
    if (oracleMatch) {
      const phrase = oracleMatch[1] ?? oracleMatch[2];
      if (phrase) result.oracleFragments.push(phrase);
      continue;
    }

    // "quoted name fragment"
    const quotedName = token.match(/^"([^"]+)"$/);
    if (quotedName?.[1]) {
      result.nameFragments.push(quotedName[1]);
      continue;
    }

    // bare word → name fragment
    if (token && !token.startsWith("-")) {
      result.nameFragments.push(token);
    }
  }

  return result;
}

/** Produce a label describing the active query for screen readers / display */
export function describeQuery(parsed: ParsedWhere): string {
  const parts: string[] = [];
  if (parsed.nameFragments.length) parts.push(`name: ${parsed.nameFragments.join(" ")}`);
  if (parsed.colors.length) parts.push(`colors: ${parsed.colors.join("")}`);
  if (parsed.typeFragments.length) parts.push(`type: ${parsed.typeFragments.join(", ")}`);
  if (parsed.cmcFilters.length)
    parts.push(`cmc: ${parsed.cmcFilters.map((f) => `${f.op}${f.value}`).join(" ")}`);
  if (parsed.oracleFragments.length) parts.push(`oracle: ${parsed.oracleFragments.join(", ")}`);
  return parts.join(" · ") || "all cards";
}
