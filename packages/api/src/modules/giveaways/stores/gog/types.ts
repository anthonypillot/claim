// Hand-written types for the GOG homepage sections payloads — only the fields we read,
// optional-heavy because upstream guarantees none of the nesting.

export type GogSection = {
  sectionId?: string;
  sectionType?: string;
};

export type GogSectionsResponse = {
  sections?: GogSection[];
};

export type GogGiveawayProduct = {
  id?: string | number;
  title?: string;
  slug?: string;
  coverHorizontal?: string | null;
  coverVertical?: string | null;
  storeLink?: string | null;
};

export type GogGiveawaySection = {
  properties?: {
    endDate?: string | null;
    product?: GogGiveawayProduct | null;
  } | null;
};
