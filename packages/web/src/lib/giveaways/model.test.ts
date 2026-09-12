import { describe, expect, it } from "vitest";
import {
  formatExpiry,
  formatPrice,
  formatStore,
  formatTimeLeft,
  getGiveawayImage,
  isGiveawaysResponse,
} from "./model.ts";

const validResponse = {
  count: 1,
  giveaways: [
    {
      id: "game",
      title: "Free Game",
      description: "A free game",
      url: "https://example.com/game",
      images: {
        wide: "https://example.com/wide.jpg",
        tall: null,
        thumbnail: null,
      },
      seller: "Publisher",
      price: { original: 1999, formatted: "$19.99", currency: "USD" },
      freeUntil: "2099-12-31T00:00:00.000Z",
      store: "epic-games",
    },
  ],
  errors: [{ store: "gog", error: "Refresh failed" }],
};

describe("isGiveawaysResponse", () => {
  it("accepts a complete API response", () => {
    expect(isGiveawaysResponse(validResponse)).toBe(true);
  });

  it("rejects invalid envelopes and nested giveaway fields", () => {
    expect(isGiveawaysResponse({ ...validResponse, count: "1" })).toBe(false);
    expect(
      isGiveawaysResponse({
        ...validResponse,
        giveaways: [{ ...validResponse.giveaways[0], store: "unknown" }],
      }),
    ).toBe(false);
    expect(
      isGiveawaysResponse({
        ...validResponse,
        giveaways: [
          {
            ...validResponse.giveaways[0],
            images: { ...validResponse.giveaways[0]?.images, wide: "not-a-url" },
          },
        ],
      }),
    ).toBe(false);
    expect(isGiveawaysResponse({ ...validResponse, errors: [{ store: "gog" }] })).toBe(false);
  });
});

describe("getGiveawayImage", () => {
  it("prefers landscape artwork", () => {
    expect(
      getGiveawayImage({ wide: "wide.jpg", thumbnail: "thumbnail.jpg", tall: "tall.jpg" }),
    ).toBe("wide.jpg");
  });

  it("falls back through thumbnail and portrait artwork", () => {
    expect(getGiveawayImage({ wide: null, thumbnail: "thumbnail.jpg", tall: "tall.jpg" })).toBe(
      "thumbnail.jpg",
    );
    expect(getGiveawayImage({ wide: null, thumbnail: null, tall: "tall.jpg" })).toBe("tall.jpg");
    expect(getGiveawayImage({ wide: null, thumbnail: null, tall: null })).toBeNull();
  });
});

describe("formatStore", () => {
  it("uses the storefront display name", () => {
    expect(formatStore("epic-games")).toBe("Epic Games");
    expect(formatStore("gog")).toBe("GOG");
  });
});

describe("formatExpiry", () => {
  it("formats valid timestamps in UTC", () => {
    expect(formatExpiry("2099-12-31T00:00:00.000Z")).toBe("Dec 31, 2099, 12:00 AM");
  });

  it("handles invalid timestamps", () => {
    expect(formatExpiry("not-a-date")).toBeNull();
  });

  it("formats French dates and times in UTC", () => {
    expect(formatExpiry("2026-08-01T12:00:00.000Z", "fr")).toBe("1 août 2026 à 12:00");
  });
});

describe("formatTimeLeft", () => {
  const now = Date.parse("2026-07-27T12:00:00.000Z");

  it("uses the largest useful unit", () => {
    expect(formatTimeLeft("2026-08-01T12:00:00.000Z", now)).toBe("5 days left");
    expect(formatTimeLeft("2026-07-28T12:00:00.000Z", now)).toBe("1 day left");
    expect(formatTimeLeft("2026-07-28T11:00:00.000Z", now)).toBe("23 hours left");
    expect(formatTimeLeft("2026-07-27T13:00:00.000Z", now)).toBe("1 hour left");
    expect(formatTimeLeft("2026-07-27T12:12:00.000Z", now)).toBe("12 minutes left");
    expect(formatTimeLeft("2026-07-27T12:01:00.000Z", now)).toBe("1 minute left");
  });

  it("rounds partial units up", () => {
    expect(formatTimeLeft("2026-07-27T12:00:01.000Z", now)).toBe("1 minute left");
    expect(formatTimeLeft("2026-07-27T13:00:01.000Z", now)).toBe("2 hours left");
    expect(formatTimeLeft("2026-07-28T12:00:01.000Z", now)).toBe("2 days left");
  });

  it("handles elapsed and invalid timestamps", () => {
    expect(formatTimeLeft("2026-07-27T12:00:00.000Z", now)).toBe("Ended");
    expect(formatTimeLeft("2026-07-26T12:00:00.000Z", now)).toBe("Ended");
    expect(formatTimeLeft("not-a-date", now)).toBe("End time unknown");
  });

  it("uses French countdown units and translated terminal states", () => {
    expect(formatTimeLeft("2026-08-01T12:00:00.000Z", now, "fr")).toBe("5 jours restants");
    expect(formatTimeLeft("2026-07-28T12:00:00.000Z", now, "fr")).toBe("1 jour restant");
    expect(formatTimeLeft("2026-07-27T14:00:00.000Z", now, "fr")).toBe("2 heures restantes");
    expect(formatTimeLeft("2026-07-27T13:00:00.000Z", now, "fr")).toBe("1 heure restante");
    expect(formatTimeLeft("2026-07-27T12:02:00.000Z", now, "fr")).toBe("2 minutes restantes");
    expect(formatTimeLeft("2026-07-27T12:00:01.000Z", now, "fr")).toBe("1 minute restante");
    expect(formatTimeLeft("2026-07-27T12:00:00.000Z", now, "fr")).toBe("Terminé");
    expect(formatTimeLeft("not-a-date", now, "fr")).toBe("Heure de fin inconnue");
  });
});

describe("formatPrice", () => {
  it("formats the original minor-unit price in the selected locale", () => {
    const price = { original: 1999, formatted: "€19.99", currency: "EUR" };
    expect(formatPrice(price, "fr")).toBe("19,99\u00a0€");
    expect(formatPrice({ ...price, currency: "USD" }, "en")).toBe("$19.99");
  });

  it("respects currency fraction digits and falls back for an invalid currency", () => {
    expect(formatPrice({ original: 1999, formatted: "¥1999", currency: "JPY" }, "en")).toBe(
      "¥1,999",
    );
    expect(formatPrice({ original: 1999, formatted: "19.99 coins", currency: "coins" }, "fr")).toBe(
      "19.99 coins",
    );
  });
});
