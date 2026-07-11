// Hand-written types for the Epic freeGamesPromotions payload — only the fields we read,
// optional-heavy because upstream guarantees none of the nesting.

export type EpicOffer = {
  id: string;
  title: string;
  description: string;
  offerType: string;
  keyImages?: { type: string; url: string }[];
  seller?: { name: string };
  productSlug?: string | null;
  offerMappings?: { pageSlug: string }[] | null;
  catalogNs?: { mappings?: { pageSlug: string }[] | null };
  price?: {
    totalPrice?: {
      discountPrice: number;
      originalPrice: number;
      currencyCode: string;
      fmtPrice?: { originalPrice: string };
    };
  };
  promotions?: {
    promotionalOffers?: { promotionalOffers?: { startDate: string; endDate: string }[] }[];
  } | null;
};

export type EpicFreeGamesResponse = {
  data?: { Catalog?: { searchStore?: { elements?: EpicOffer[] } } };
};
