import type { PrimeFreeGamesResponse } from "./types.ts";

// Anonymous session page shell: single-quoted attributes, matching the real markup.
export const primeHomeHtmlFixture =
  "<html><body><form><input type='hidden' name='csrf-key' value='test-csrf-token' /></form></body></html>";

// Trimmed upstream-shaped payload: one item per predicate branch.
// Only (a) "Actually Free Full Game" must survive the filter.
export const primeFreeGamesFixture: PrimeFreeGamesResponse = {
  data: {
    games: {
      items: [
        // (a) FGWP full game with an active offer window — the one expected result
        {
          id: "item-active-full-game",
          isFGWP: true,
          category: "FULL_GAME",
          assets: {
            title: "Actually Free Full Game",
            externalClaimLink: "https://gaming.amazon.com/actually-free/dp/item-active-full-game",
            shortformDescription: "A free full game.",
            cardMedia: { defaultMedia: { src1x: "https://cdn.example.com/card.jpg" } },
            heroMedia: { defaultMedia: { src1x: "https://cdn.example.com/hero.jpg" } },
          },
          offers: [{ startTime: "2000-01-01T00:00:00Z", endTime: "2099-12-31T00:00:00Z" }],
          game: { assets: { title: "Actually Free Full Game", publisher: "WayForward" } },
        },
        // (b) in-game loot with an active window — filtered by the FGWP/category flags
        {
          id: "item-loot-drop",
          isFGWP: false,
          category: "IN_GAME_CONTENT",
          assets: { title: "Loot Drop" },
          offers: [{ startTime: "2000-01-01T00:00:00Z", endTime: "2099-12-31T00:00:00Z" }],
        },
        // (c) full game whose offer window has expired — filtered by dates
        {
          id: "item-expired-full-game",
          isFGWP: true,
          category: "FULL_GAME",
          assets: { title: "Formerly Free Game" },
          offers: [{ startTime: "2000-01-01T00:00:00Z", endTime: "2001-01-01T00:00:00Z" }],
        },
        // (d) full game whose offer window hasn't started — filtered by dates
        {
          id: "item-upcoming-full-game",
          isFGWP: true,
          category: "FULL_GAME",
          assets: { title: "Upcoming Free Game" },
          offers: [{ startTime: "2098-01-01T00:00:00Z", endTime: "2099-01-01T00:00:00Z" }],
        },
        // (e) full game with no usable end date — filtered by the missing-endTime branch
        {
          id: "item-endless-full-game",
          isFGWP: true,
          category: "FULL_GAME",
          assets: { title: "No End Date Game" },
          offers: [{ startTime: "2000-01-01T00:00:00Z", endTime: null }],
        },
      ],
    },
  },
};
