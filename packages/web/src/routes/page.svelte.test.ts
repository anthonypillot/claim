import type { Giveaway, GiveawaysResponse, StoreId } from "$lib/giveaways/model";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import type { PageProps } from "./$types";
import PageTestWrapper from "./_page-test-wrapper.svelte";

function createGiveaway(id: string, title: string, store: StoreId, freeUntil = "2099-12-31T00:00:00.000Z"): Giveaway {
  return {
    id,
    title,
    description: `${title} description`,
    url: null,
    images: {
      wide: null,
      tall: null,
      thumbnail: null,
    },
    seller: "Publisher",
    price: null,
    freeUntil,
    store,
  };
}

async function renderPage(items: GiveawaysResponse, loadedAt = Date.parse("2099-01-01T00:00:00.000Z")) {
  const props = {
    data: { items, loadedAt },
    params: {},
    form: null,
  } satisfies PageProps;

  return render(PageTestWrapper, props);
}

test("shows the adaptive time remaining with the exact deadline available", async () => {
  const items = {
    count: 1,
    giveaways: [createGiveaway("epic", "Epic Giveaway", "epic-games", "2026-08-01T12:00:00.000Z")],
    errors: [],
  } satisfies GiveawaysResponse;

  const screen = await renderPage(items, Date.parse("2026-07-27T12:00:00.000Z"));

  const expiryBadge = screen.getByLabelText("5 days left; ends Aug 1, 2026, 12:00 PM UTC");
  await expect.element(expiryBadge).toHaveTextContent("5 days left");

  expiryBadge.element().dispatchEvent(new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" }));
  await expect.element(screen.getByRole("tooltip")).toHaveTextContent("Ends Aug 1, 2026, 12:00 PM UTC");
});

test("shows giveaways from all stores by default", async () => {
  const items = {
    count: 2,
    giveaways: [
      {
        ...createGiveaway("epic", "Epic Giveaway", "epic-games"),
        price: { original: 1999, formatted: "$19.99", currency: "USD" },
      },
      createGiveaway("steam", "Steam Giveaway", "steam"),
    ],
    errors: [],
  } satisfies GiveawaysResponse;

  const screen = await renderPage(items);

  await expect
    .element(screen.getByRole("radio", { name: "All stores, 2 giveaways", exact: true }))
    .toHaveAttribute("aria-checked", "true");
  await expect
    .element(screen.getByRole("radio", { name: "Epic Games, 1 giveaway", exact: true }))
    .toHaveAttribute("aria-checked", "false");
  expect(screen.getByRole("radio", { name: "Epic Games" }).element().querySelector("img")?.getAttribute("src")).toBe(
    "/stores/epic-games.svg",
  );
  const storeBadge = screen.getByLabelText("Store: Epic Games");
  expect(storeBadge.element().querySelector("img")?.getAttribute("src")).toBe("/stores/epic-games.svg");
  storeBadge.element().dispatchEvent(new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" }));
  await expect.element(screen.getByRole("tooltip")).toHaveTextContent("Epic Games");
  await expect.element(screen.getByText("$19.99", { exact: true })).toHaveClass("line-through");
  await expect.element(screen.getByText("Epic Giveaway", { exact: true })).toBeInTheDocument();
  await expect.element(screen.getByText("Steam Giveaway", { exact: true })).toBeInTheDocument();
});

test("tracks clicks on available giveaway links", async () => {
  const plausible = vi.fn();
  vi.stubGlobal("plausible", plausible);

  try {
    const items = {
      count: 1,
      giveaways: [
        {
          ...createGiveaway("epic", "Epic Giveaway", "epic-games"),
          url: "https://example.com/epic-giveaway",
        },
      ],
      errors: [],
    } satisfies GiveawaysResponse;

    const screen = await renderPage(items);
    const giveawayLink = screen.getByRole("link", { name: "View giveaway" });
    giveawayLink.element().addEventListener("click", (event) => event.preventDefault());
    await giveawayLink.click();

    expect(plausible).toHaveBeenCalledOnce();
    expect(plausible).toHaveBeenCalledWith("Giveaway Click", {
      props: {
        giveaway_title: "Epic Giveaway",
        store: "epic-games",
      },
    });
  } finally {
    vi.unstubAllGlobals();
  }
});

test("fills the motion hero with current giveaway artwork", async () => {
  const items = {
    count: 1,
    giveaways: [
      {
        ...createGiveaway("epic", "Epic Giveaway", "epic-games"),
        images: {
          wide: "https://example.com/epic-giveaway.jpg",
          tall: null,
          thumbnail: null,
        },
      },
    ],
    errors: [],
  } satisfies GiveawaysResponse;

  const screen = await renderPage(items);
  const hero = screen.getByTestId("giveaway-hero").element();
  const motionItems = hero.querySelectorAll<HTMLElement>("[data-grid-motion-item]");

  expect(motionItems).toHaveLength(28);
  expect(motionItems[0]?.firstElementChild).toHaveStyle({
    backgroundImage: 'url("https://example.com/epic-giveaway.jpg")',
  });
});

test("filters giveaways by store and keeps partial-store errors visible", async () => {
  const items = {
    count: 2,
    giveaways: [
      createGiveaway("epic", "Epic Giveaway", "epic-games"),
      createGiveaway("steam", "Steam Giveaway", "steam"),
    ],
    errors: [{ store: "gog", error: "Refresh failed" }],
  } satisfies GiveawaysResponse;

  const screen = await renderPage(items);
  await screen.getByRole("radio", { name: "Steam" }).click();

  await expect.element(screen.getByRole("radio", { name: "Steam" })).toHaveAttribute("aria-checked", "true");
  await expect.element(screen.getByRole("radio", { name: "All stores" })).toHaveAttribute("aria-checked", "false");
  await expect.element(screen.getByText("Steam Giveaway", { exact: true })).toBeInTheDocument();
  await expect.element(screen.getByText("Epic Giveaway", { exact: true })).not.toBeInTheDocument();
  await expect.element(screen.getByRole("alert")).toHaveTextContent("GOG: Refresh failed");
  await expect.element(screen.getByRole("radio", { name: "GOG, 0 giveaways", exact: true })).toBeInTheDocument();
});

test("shows a store-specific empty state", async () => {
  const items = {
    count: 1,
    giveaways: [createGiveaway("epic", "Epic Giveaway", "epic-games")],
    errors: [],
  } satisfies GiveawaysResponse;

  const screen = await renderPage(items);
  await screen.getByRole("radio", { name: "GOG" }).click();

  await expect.element(screen.getByText("No GOG giveaways available")).toBeInTheDocument();
  await expect
    .element(screen.getByText(/There are no active free-to-keep games from GOG right now/))
    .toBeInTheDocument();
  await expect.element(screen.getByText("Epic Giveaway", { exact: true })).not.toBeInTheDocument();
});

test("sorts visible giveaways by expiry and restores API order", async () => {
  gsap.registerPlugin(ScrollTrigger);
  const refresh = vi.spyOn(ScrollTrigger, "refresh");
  const items = {
    count: 3,
    giveaways: [
      createGiveaway("later", "Later Giveaway", "epic-games", "2099-12-31T00:00:00.000Z"),
      createGiveaway("other", "Other Giveaway", "gog", "2099-10-31T00:00:00.000Z"),
      createGiveaway("sooner", "Sooner Giveaway", "steam", "2099-11-30T00:00:00.000Z"),
    ],
    errors: [],
  } satisfies GiveawaysResponse;

  const screen = await renderPage(items);
  const endingSoon = screen.getByRole("button", { name: "Sort by ending soon" });
  await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
  refresh.mockClear();

  await endingSoon.click();
  await expect.element(endingSoon).toHaveAttribute("aria-pressed", "true");
  await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(
    Array.from(document.querySelectorAll<HTMLElement>("[data-slot=card-title]"), (title) => title.innerText),
  ).toEqual(["Other Giveaway", "Sooner Giveaway", "Later Giveaway"]);
  refresh.mockClear();

  await endingSoon.click();
  await expect.element(endingSoon).toHaveAttribute("aria-pressed", "false");
  await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(
    Array.from(document.querySelectorAll<HTMLElement>("[data-slot=card-title]"), (title) => title.innerText),
  ).toEqual(["Later Giveaway", "Other Giveaway", "Sooner Giveaway"]);
  refresh.mockRestore();
});
