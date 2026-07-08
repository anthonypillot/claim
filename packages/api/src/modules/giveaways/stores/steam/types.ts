// Hand-written types for the Steam store payloads — only the fields we read, optional-heavy
// because upstream guarantees none of the nesting.

export interface SteamFeaturedItem {
  id: number;
  type?: number;
  name?: string;
  discount_percent?: number;
  original_price?: number | null;
  final_price?: number;
  currency?: string;
  header_image?: string | null;
  small_capsule_image?: string | null;
  discount_expiration?: number;
}

export interface SteamFeaturedCategoriesResponse {
  specials?: {
    items?: SteamFeaturedItem[];
  } | null;
}

export interface SteamActiveDiscount {
  discount_end_date?: number;
}

export interface SteamPurchaseOption {
  discount_pct?: number;
  final_price_in_cents?: string;
  original_price_in_cents?: string;
  formatted_original_price?: string;
  active_discounts?: SteamActiveDiscount[];
}

export interface SteamStoreItem {
  appid: number;
  name?: string;
  is_free?: boolean;
  store_url_path?: string;
  best_purchase_option?: SteamPurchaseOption | null;
}

export interface SteamGetItemsResponse {
  response?: {
    store_items?: SteamStoreItem[];
  } | null;
}

/** A featured discovery item joined to its store-browse confirmation, keyed by appid. */
export interface SteamCandidate {
  featured: SteamFeaturedItem;
  confirm?: SteamStoreItem;
}
