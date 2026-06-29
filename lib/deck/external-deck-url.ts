export type ExternalSource = "moxfield" | "archidekt";

export function detectExternalSource(raw: string): ExternalSource | null {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./, "");
  if (host === "moxfield.com" && parsed.pathname.startsWith("/decks/")) return "moxfield";
  if (host === "archidekt.com" && parsed.pathname.startsWith("/decks/")) return "archidekt";
  return null;
}

export function isExternalDeckUrl(raw: string): boolean {
  return detectExternalSource(raw) !== null;
}
