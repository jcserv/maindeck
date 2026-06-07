const MULTI_COMMANDER_KEYWORDS = [
  "Partner",           // generic Partner only — see canHavePartner for "Partner with" exclusion
  "Doctor's companion",
  // Scryfall stores "Choose a background" with a lowercase 'b' — verified against card data.
  "Choose a background",
  // Rowan, Scholar of Sparks // Will, Scholar of Frost — exact string from Scryfall keywords array.
  "Friends forever",
] as const;

export function canHavePartner(
  keywords: string[],
  typeLine?: string | null,
): boolean {
  if (typeLine?.split("—")[1]?.includes("Background")) return true;
  return keywords.some((k) =>
    MULTI_COMMANDER_KEYWORDS.some((p) => {
      if (p === "Partner") {
        // "Partner with [Name]" is a named-partner pairing — the two cards can
        // only pair with each other, not freely with any other commander.
        // Exclude it here; named-pairing validation is tracked as a follow-up.
        return k.startsWith("Partner") && !k.startsWith("Partner with");
      }
      return k === p;
    }),
  );
}
