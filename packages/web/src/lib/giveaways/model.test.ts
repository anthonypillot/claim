import { describe, expect, it } from "vitest";
import { formatExpiry, formatStore, getGiveawayImage } from "./model.ts";

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
    expect(formatExpiry("not-a-date")).toBe("Unknown");
  });
});
