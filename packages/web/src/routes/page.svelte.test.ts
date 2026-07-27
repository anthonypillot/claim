import type { Giveaway, GiveawaysResponse, StoreId } from "$lib/giveaways/model";
import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";
import type { PageProps } from "./$types";
import Page from "./+page.svelte";

function createGiveaway(id: string, title: string, store: StoreId): Giveaway {
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
    freeUntil: "2099-12-31T00:00:00.000Z",
    store,
  };
}

async function renderPage(items: GiveawaysResponse) {
  const props = {
    data: { items },
    params: {},
    form: null,
  } satisfies PageProps;

  return render(Page, props);
}

test("shows giveaways from all stores by default", async () => {
  const items = {
    count: 2,
    giveaways: [
      createGiveaway("epic", "Epic Giveaway", "epic-games"),
      createGiveaway("steam", "Steam Giveaway", "steam"),
    ],
    errors: [],
  } satisfies GiveawaysResponse;

  const screen = await renderPage(items);

  await expect.element(screen.getByRole("radio", { name: "All stores" })).toHaveAttribute("aria-checked", "true");
  await expect.element(screen.getByRole("radio", { name: "Epic Games" })).toHaveAttribute("aria-checked", "false");
  expect(screen.getByRole("radio", { name: "Epic Games" }).element().querySelector("img")?.getAttribute("src")).toBe(
    "/stores/epic-games.svg",
  );
  expect(screen.getByLabelText("Store: Epic Games").element().querySelector("img")?.getAttribute("src")).toBe(
    "/stores/epic-games.svg",
  );
  await expect.element(screen.getByText("Epic Giveaway", { exact: true })).toBeInTheDocument();
  await expect.element(screen.getByText("Steam Giveaway", { exact: true })).toBeInTheDocument();
  await expect.element(screen.getByText("2 giveaways")).toBeInTheDocument();
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
  await expect.element(screen.getByText("1 giveaway")).toBeInTheDocument();
  await expect.element(screen.getByRole("alert")).toHaveTextContent("GOG: Refresh failed");
});

test("shows a store-specific empty state", async () => {
  const items = {
    count: 1,
    giveaways: [createGiveaway("epic", "Epic Giveaway", "epic-games")],
    errors: [],
  } satisfies GiveawaysResponse;

  const screen = await renderPage(items);
  await screen.getByRole("radio", { name: "GOG" }).click();

  await expect.element(screen.getByText("0 giveaways")).toBeInTheDocument();
  await expect.element(screen.getByText("No GOG giveaways available")).toBeInTheDocument();
  await expect
    .element(screen.getByText(/There are no active free-to-keep games from GOG right now/))
    .toBeInTheDocument();
  await expect.element(screen.getByText("Epic Giveaway", { exact: true })).not.toBeInTheDocument();
});
