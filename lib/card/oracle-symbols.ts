type OracleToken =
  | { kind: "text"; value: string }
  | { kind: "symbol"; value: string };

// Convert a Scryfall-style symbol body (e.g. "W", "2", "W/U", "2/W", "W/P",
// "T", "+1", "-X") into the suffix used by the mana-font CSS classes.
function symbolSlug(inner: string): string {
  const trimmed = inner.trim();
  const lower = trimmed.toLowerCase();
  // Loyalty: {+1}, {-2}, {0}
  if (/^[+-]?\d+$|^[+-]x$|^\d+$/.test(lower)) {
    if (lower.startsWith("+")) return `loyalty-up-${lower.slice(1)}`;
    if (lower.startsWith("-")) return `loyalty-down-${lower.slice(1)}`;
    // plain numbers are used as generic mana; keep bare digit slug
    return lower;
  }
  // mana-font uses full-word classes for a few special symbols
  if (lower === "t") return "tap";
  if (lower === "q") return "untap";
  // Strip slashes so "W/U" → "wu" and "2/W" → "2w" and "W/P" → "wp"
  return lower.replace(/\//g, "");
}

/**
 * Tokenize Scryfall oracle text into runs of plain text and symbol tokens.
 * Symbols are anything wrapped in braces (e.g. `{T}`, `{W}`, `{2/W}`, `{W/P}`,
 * `{+1}`, `{-X}`). Text runs preserve whitespace and newlines so the caller
 * can render with `whitespace-pre-line`.
 */
export function parseOracle(text: string): OracleToken[] {
  if (!text) return [];

  const tokens: OracleToken[] = [];
  const regex = /\{([^{}]+)\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ kind: "text", value: text.slice(lastIndex, match.index) });
    }
    tokens.push({ kind: "symbol", value: symbolSlug(match[1]!) });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    tokens.push({ kind: "text", value: text.slice(lastIndex) });
  }
  return tokens;
}
