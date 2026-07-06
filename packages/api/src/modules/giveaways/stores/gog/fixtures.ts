import type { GogGiveawaySection, GogSectionsResponse } from "./types.ts";

// Trimmed upstream-shaped payloads: the home-page section list plus one giveaway-section detail
// per predicate branch. Only (a) "Actually Free GOG Game" must survive the filter.
export const gogSectionsFixture: GogSectionsResponse = {
  sections: [
    { sectionId: "section-big-spot", sectionType: "BIG_SPOT_SECTION" },
    // (a) live giveaway with a product and a future end date — the one expected result
    { sectionId: "section-giveaway-active", sectionType: "GIVEAWAY_SECTION" },
    // (b) giveaway whose end date has passed — filtered by dates
    { sectionId: "section-giveaway-expired", sectionType: "GIVEAWAY_SECTION" },
    // (c) giveaway without a product — filtered by the missing-product branch
    { sectionId: "section-giveaway-no-product", sectionType: "GIVEAWAY_SECTION" },
    // (d) giveaway without an end date — filtered by the missing-endDate branch
    { sectionId: "section-giveaway-no-end-date", sectionType: "GIVEAWAY_SECTION" },
    { sectionId: "section-news", sectionType: "NEWS_SECTION" },
  ],
};

export const gogGiveawaySectionFixtures: Record<string, GogGiveawaySection> = {
  "section-giveaway-active": {
    properties: {
      endDate: "2099-12-31T00:00:00+00:00",
      product: {
        // Numeric on purpose: the mapper must coerce ids to strings.
        id: 1207658787,
        title: "Actually Free GOG Game",
        slug: "actually_free_gog_game",
        coverHorizontal: "https://images.gog-statics.com/cover-horizontal.png",
        coverVertical: "https://images.gog-statics.com/cover-vertical.jpg",
      },
    },
  },
  "section-giveaway-expired": {
    properties: {
      endDate: "2001-01-01T00:00:00+00:00",
      product: { id: "2", title: "Formerly Free Game", slug: "formerly_free_game" },
    },
  },
  "section-giveaway-no-product": {
    properties: { endDate: "2099-12-31T00:00:00+00:00" },
  },
  "section-giveaway-no-end-date": {
    properties: { product: { id: "3", title: "No End Date Game", slug: "no_end_date_game" } },
  },
};
