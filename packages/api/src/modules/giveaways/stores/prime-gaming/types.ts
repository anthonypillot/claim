// Hand-written types for the Prime Gaming offers payload (Luna GraphQL) — only the fields we
// read, optional-heavy because upstream guarantees none of the nesting.

export interface PrimeMedia {
  defaultMedia?: { src1x?: string } | null;
}

export interface PrimeItem {
  id: string;
  isFGWP?: boolean;
  category?: string;
  assets?: {
    title?: string;
    externalClaimLink?: string | null;
    shortformDescription?: string | null;
    cardMedia?: PrimeMedia | null;
    heroMedia?: PrimeMedia | null;
  };
  offers?: { startTime?: string | null; endTime?: string | null }[] | null;
  game?: { assets?: { title?: string; publisher?: string | null } | null } | null;
}

export interface PrimeFreeGamesResponse {
  data?: { games?: { items?: PrimeItem[] } };
  errors?: { message?: string }[] | null;
}
