type ScryfallImageUris = {
  normal?: string;
  small?: string;
  large?: string;
  png?: string;
  art_crop?: string;
  border_crop?: string;
};

type ScryfallCardFace = {
  image_uris?: ScryfallImageUris;
};

type ScryfallPrices = {
  usd?: string | null;
  usd_foil?: string | null;
  usd_etched?: string | null;
  eur?: string | null;
  eur_foil?: string | null;
  eur_etched?: string | null;
  tix?: string | null;
};

type ScryfallCardPart = {
  id: string;
  component: "token" | "meld_part" | "meld_result" | "combo_piece";
  name: string;
  type_line: string;
  uri: string;
};

export type ScryfallCard = {
  id: string;
  lang: string;
  layout: string;
  games: string[];
  name: string;
  type_line?: string;
  oracle_text?: string;
  mana_cost?: string;
  cmc?: number;
  colors?: string[];
  color_identity?: string[];
  keywords?: string[];
  power?: string;
  toughness?: string;
  legalities?: Record<string, string>;
  reserved?: boolean;
  game_changer?: boolean;
  rarity?: string;
  set: string;
  set_name: string;
  collector_number: string;
  promo_types?: string[];
  finishes?: string[];
  image_uris?: ScryfallImageUris;
  card_faces?: ScryfallCardFace[];
  prices?: ScryfallPrices;
  all_parts?: ScryfallCardPart[];
};
