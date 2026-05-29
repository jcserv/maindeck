const MULTI_COMMANDER_KEYWORDS = [
  "Partner",           // also matches "Partner with [Name]" and "Partner—[X]" via startsWith
  "Doctor's companion",
  "Choose a background", // Scryfall stores lowercase 'b'
] as const;

export function canHavePartner(
  keywords: string[],
  typeLine?: string | null,
): boolean {
  if (typeLine?.split("—")[1]?.includes("Background")) return true;
  return keywords.some((k) =>
    MULTI_COMMANDER_KEYWORDS.some((p) =>
      p === "Partner" ? k.startsWith("Partner") : k === p,
    ),
  );
}
