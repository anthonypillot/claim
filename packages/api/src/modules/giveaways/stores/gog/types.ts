// Hand-written types for the GOG homepage sections payloads — only the fields we read,
// optional-heavy because upstream guarantees none of the nesting.

export interface GogSection {
  sectionId?: string;
  sectionType?: string;
}

export interface GogSectionsResponse {
  sections?: GogSection[];
}

export interface GogGiveawayProduct {
  id?: string | number;
  title?: string;
  slug?: string;
  coverHorizontal?: string | null;
  coverVertical?: string | null;
  storeLink?: string | null;
}

export interface GogGiveawaySection {
  properties?: {
    endDate?: string | null;
    product?: GogGiveawayProduct | null;
  } | null;
}
