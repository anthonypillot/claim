import { describe, expect, it } from "vitest";
import { formatExpiry, formatStore, formatTimeLeft, getGiveawayImage } from "./model.ts";

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
});
