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
  /** Colors that must ALL appear in the card's color identity */
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
      /* c8 ignore next -- regex captures only ops present in OP_MAP; the `?? "="` is unreachable. */
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

const WUBRG_ORDER = ["W", "U", "B", "R", "G"] as const;

/**
 * Serialize a {@link ParsedWhere} back into the Scryfall-syntax dialect this
 * module parses — the inverse of {@link parseSyntax}. Emits, in order: name
 * fragments, `c:WUBRG`, `t:<type>` per type, `cmc<op>N`, then `o:` oracle
 * fragments. Fragments containing whitespace are quoted. The output is stable
 * under `parseSyntax(serializeWhere(p))`, so the Filters tab and the syntax box
 * round-trip through a single source-of-truth query string.
 */
export function serializeWhere(p: ParsedWhere): string {
  const parts: string[] = [];

  for (const frag of p.nameFragments) {
    parts.push(/\s/.test(frag) ? `"${frag}"` : frag);
  }

  if (p.colors.length > 0) {
    const present = new Set(p.colors.map((c) => c.toUpperCase()));
    const ordered = WUBRG_ORDER.filter((c) => present.has(c));
    if (ordered.length > 0) parts.push(`c:${ordered.join("")}`);
  }

  for (const type of p.typeFragments) {
    parts.push(`t:${type}`);
  }

  for (const { op, value } of p.cmcFilters) {
    parts.push(`cmc${op}${value}`);
  }

  for (const frag of p.oracleFragments) {
    parts.push(/\s/.test(frag) ? `o:"${frag}"` : `o:${frag}`);
  }

  return parts.join(" ");
}

