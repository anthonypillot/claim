import type { EpicFreeGamesResponse } from "./types.ts";

// Trimmed upstream-shaped payload: one element per predicate branch.
// Only (a) "Actually Free Game" must survive the filter.
export const epicFreeGamesFixture: EpicFreeGamesResponse = {
  data: {
    Catalog: {
      searchStore: {
        elements: [
          // (a) free BASE_GAME with an active window — the one expected result
          {
            id: "offer-free-base-game",
            title: "Actually Free Game",
            description: "A free base game.",
            offerType: "BASE_GAME",
            keyImages: [
              { type: "Thumbnail", url: "https://cdn.example.com/thumb.png" },
              { type: "OfferImageWide", url: "https://cdn.example.com/wide.png" },
              { type: "OfferImageTall", url: "https://cdn.example.com/tall.png" },
            ],
            seller: { name: "WayForward" },
            offerMappings: [{ pageSlug: "actually-free-game" }],
            price: {
              totalPrice: {
                discountPrice: 0,
                originalPrice: 3599,
                currencyCode: "EUR",
                fmtPrice: { originalPrice: "€35.99" },
              },
            },
            promotions: {
              promotionalOffers: [
                {
                  promotionalOffers: [
                    { startDate: "2000-01-01T00:00:00.000Z", endDate: "2099-12-31T00:00:00.000Z" },
                  ],
                },
              ],
              upcomingPromotionalOffers: [],
            },
          },
          // (b) free-priced ADD_ON with an active window — filtered by offerType
          {
            id: "offer-free-addon",
            title: "Free DLC",
            description: "An add-on, not a base game.",
            offerType: "ADD_ON",
            price: { totalPrice: { discountPrice: 0, originalPrice: 359, currencyCode: "EUR" } },
            promotions: {
              promotionalOffers: [
                {
                  promotionalOffers: [
                    { startDate: "2000-01-01T00:00:00.000Z", endDate: "2099-12-31T00:00:00.000Z" },
                  ],
                },
              ],
            },
          },
          // (c) paid BASE_GAME, no promotions — filtered by price
          {
            id: "offer-paid-base-game",
            title: "Paid Game",
            description: "Costs money.",
            offerType: "BASE_GAME",
            price: {
              totalPrice: { discountPrice: 1999, originalPrice: 1999, currencyCode: "EUR" },
            },
            promotions: null,
          },
          // (d) free-priced BASE_GAME with only an upcoming promo — no active window
          {
            id: "offer-upcoming-base-game",
            title: "Upcoming Free Game",
            description: "Free next week, not now.",
            offerType: "BASE_GAME",
            price: { totalPrice: { discountPrice: 0, originalPrice: 2999, currencyCode: "EUR" } },
            promotions: {
              promotionalOffers: [],
              upcomingPromotionalOffers: [
                {
                  promotionalOffers: [
                    { startDate: "2098-01-01T00:00:00.000Z", endDate: "2099-01-01T00:00:00.000Z" },
                  ],
                },
              ],
            },
          },
          // (e) free-priced BASE_GAME with an expired window — filtered by dates
          {
            id: "offer-expired-base-game",
            title: "Formerly Free Game",
            description: "The giveaway is over.",
            offerType: "BASE_GAME",
            price: { totalPrice: { discountPrice: 0, originalPrice: 999, currencyCode: "EUR" } },
            promotions: {
              promotionalOffers: [
                {
                  promotionalOffers: [
                    { startDate: "2000-01-01T00:00:00.000Z", endDate: "2001-01-01T00:00:00.000Z" },
                  ],
                },
              ],
            },
          },
        ],
      },
    },
  },
};
