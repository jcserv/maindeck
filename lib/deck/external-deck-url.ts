export type ExternalSource = "moxfield" | "archidekt";

export function detectExternalSource(raw: string): ExternalSource | null {
  const url = raw.trim();
  if (/moxfield\.com\/decks\//.test(url)) return "moxfield";
  if (/archidekt\.com\/decks\//.test(url)) return "archidekt";
  return null;
}

export function isExternalDeckUrl(raw: string): boolean {
  return detectExternalSource(raw) !== null;
}
