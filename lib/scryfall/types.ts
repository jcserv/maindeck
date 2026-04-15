export type ScryfallImageUris = {
  normal?: string;
  small?: string;
  large?: string;
  png?: string;
  art_crop?: string;
  border_crop?: string;
};

export type ScryfallCardFace = {
  image_uris?: ScryfallImageUris;
};

export type ScryfallPrices = {
  usd?: string | null;
  usd_foil?: string | null;
  usd_etched?: string | null;
  eur?: string | null;
  eur_foil?: string | null;
  tix?: string | null;
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
  set: string;
  set_name: string;
  collector_number: string;
  promo_types?: string[];
  finishes?: string[];
  image_uris?: ScryfallImageUris;
  card_faces?: ScryfallCardFace[];
  prices?: ScryfallPrices;
};
