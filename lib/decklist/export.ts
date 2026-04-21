export type ExportableCard = {
  quantity: number;
  name: string;
  setCode: string;
  collectorNumber: string;
  isFoil?: boolean;
};

export function toMoxfield(deck: readonly ExportableCard[]): string {
  return deck
    .map((card) => {
      const foil = card.isFoil ? " *f*" : "";
      return `${card.quantity} ${card.name} (${card.setCode.toUpperCase()}) ${card.collectorNumber}${foil}`;
    })
    .join("\n");
}
