import type { SteamFeaturedCategoriesResponse, SteamGetItemsResponse } from "./types.ts";

// Trimmed upstream-shaped payloads: the featured "specials" list plus the store-browse
// confirmation. Only (a) "Actually Free Steam Game" survives both the discovery filter and the
// confirm predicate. `discount_expiration`/`discount_end_date` far in the future keeps (a) live.
export const steamFeaturedCategoriesFixture: SteamFeaturedCategoriesResponse = {
  specials: {
    items: [
      // (a) 100% off with a zero final price — the one expected result
      {
        id: 100100,
        type: 0,
        name: "Actually Free Steam Game",
        discount_percent: 100,
        original_price: 1999,
        final_price: 0,
        currency: "USD",
        header_image: "https://shared.akamai.steamstatic.com/apps/100100/header.jpg",
        small_capsule_image: "https://shared.akamai.steamstatic.com/apps/100100/capsule.jpg",
        discount_expiration: 4102444800,
      },
      // (b) merely discounted, not free — dropped at discovery, never confirmed
      {
        id: 200200,
        type: 0,
        name: "Half Off Game",
        discount_percent: 50,
        original_price: 1999,
        final_price: 999,
        currency: "USD",
      },
      // (c) 100% off but actually free-to-play — passes discovery, dropped by the is_free branch
      {
        id: 300300,
        type: 0,
        name: "Free To Play Game",
        discount_percent: 100,
        original_price: 0,
        final_price: 0,
        currency: "USD",
      },
      // (d) 100% off but the promo has ended — passes discovery, dropped by the window branch
      {
        id: 400400,
        type: 0,
        name: "Expired Promo Game",
        discount_percent: 100,
        original_price: 999,
        final_price: 0,
        currency: "USD",
      },
      // (e) 100% off but the confirm carries no purchase option — dropped by the missing-option branch
      {
        id: 500500,
        type: 0,
        name: "No Purchase Option Game",
        discount_percent: 100,
        original_price: 1499,
        final_price: 0,
        currency: "USD",
      },
    ],
  },
};

export const steamGetItemsFixture: SteamGetItemsResponse = {
  response: {
    store_items: [
      // (a) genuine free-to-keep: not free, 100% off, zero price, discount still live
      {
        appid: 100100,
        name: "Actually Free Steam Game",
        store_url_path: "app/100100/Actually_Free_Steam_Game",
        best_purchase_option: {
          discount_pct: 100,
          final_price_in_cents: "0",
          original_price_in_cents: "1999",
          formatted_original_price: "$19.99",
          active_discounts: [{ discount_end_date: 4102444800 }],
        },
      },
      // (c) free-to-play — dropped by the is_free branch
      {
        appid: 300300,
        name: "Free To Play Game",
        is_free: true,
        store_url_path: "app/300300/Free_To_Play_Game",
      },
      // (d) discount already ended — dropped by the window branch
      {
        appid: 400400,
        name: "Expired Promo Game",
        store_url_path: "app/400400/Expired_Promo_Game",
        best_purchase_option: {
          discount_pct: 100,
          final_price_in_cents: "0",
          original_price_in_cents: "999",
          formatted_original_price: "$9.99",
          active_discounts: [{ discount_end_date: 946684800 }],
        },
      },
      // (e) no purchase option — dropped by the missing-option branch
      {
        appid: 500500,
        name: "No Purchase Option Game",
        store_url_path: "app/500500/No_Purchase_Option_Game",
      },
    ],
  },
};
