import type { Giveaway, GiveawaysResponse, StoreId } from "$lib/giveaways/model";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import type { PageProps } from "./$types";
import PageTestWrapper from "./_page-test-wrapper.svelte";
import { overwriteGetLocale } from "$lib/paraglide/runtime";

function createGiveaway(
  id: string,
  title: string,
  store: StoreId,
  freeUntil = "2099-12-31T00:00:00.000Z",
): Giveaway {
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

async function renderPage(
  items: GiveawaysResponse,
  loadedAt = Date.parse("2099-01-01T00:00:00.000Z"),
) {
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

  expiryBadge
    .element()
    .dispatchEvent(new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" }));
  await expect
    .element(screen.getByRole("tooltip"))
    .toHaveTextContent("Ends Aug 1, 2026, 12:00 PM UTC");
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
  expect(
    screen
      .getByRole("radio", { name: "Epic Games" })
      .element()
      .querySelector("img")
      ?.getAttribute("src"),
  ).toBe("/stores/epic-games.svg");
  const storeBadge = screen.getByLabelText("Store: Epic Games");
  expect(storeBadge.element().querySelector("img")?.getAttribute("src")).toBe(
    "/stores/epic-games.svg",
  );
  storeBadge
    .element()
    .dispatchEvent(new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" }));
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

  await expect
    .element(screen.getByRole("radio", { name: "Steam" }))
    .toHaveAttribute("aria-checked", "true");
  await expect
    .element(screen.getByRole("radio", { name: "All stores" }))
    .toHaveAttribute("aria-checked", "false");
  await expect.element(screen.getByText("Steam Giveaway", { exact: true })).toBeInTheDocument();
  await expect.element(screen.getByText("Epic Giveaway", { exact: true })).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("GOG: Could not refresh giveaways.");
  await expect
    .element(screen.getByRole("radio", { name: "GOG, 0 giveaways", exact: true }))
    .toBeInTheDocument();
});

test("shows a genuine empty state when every store responded successfully", async () => {
  const items = {
    count: 0,
    giveaways: [],
    errors: [],
  } satisfies GiveawaysResponse;

  const screen = await renderPage(items);

  await expect
    .element(screen.getByText("No giveaways available", { exact: true }))
    .toBeInTheDocument();
  await expect
    .element(screen.getByText(/There are no active free-to-keep games right now/))
    .toBeInTheDocument();
});

test("does not report a genuine empty state when failed stores have no usable data", async () => {
  const items = {
    count: 0,
    giveaways: [],
    errors: [{ store: "gog", error: "Refresh failed" }],
  } satisfies GiveawaysResponse;

  const screen = await renderPage(items);

  await expect
    .element(screen.getByText("Giveaways could not be confirmed", { exact: true }))
    .toBeInTheDocument();
  await expect
    .element(screen.getByText(/No current giveaway data is available/))
    .toBeInTheDocument();
  await expect
    .element(screen.getByText("No giveaways available", { exact: true }))
    .not.toBeInTheDocument();
});

test("does not report a failed selected store as empty", async () => {
  const items = {
    count: 1,
    giveaways: [createGiveaway("epic", "Epic Giveaway", "epic-games")],
    errors: [{ store: "gog", error: "Refresh failed" }],
  } satisfies GiveawaysResponse;

  const screen = await renderPage(items);
  await screen.getByRole("radio", { name: "GOG" }).click();

  await expect
    .element(screen.getByText("GOG giveaways could not be confirmed", { exact: true }))
    .toBeInTheDocument();
  await expect.element(screen.getByText(/GOG could not be refreshed/)).toBeInTheDocument();
  await expect
    .element(screen.getByText("No GOG giveaways available", { exact: true }))
    .not.toBeInTheDocument();
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
    Array.from(
      document.querySelectorAll<HTMLElement>("[data-slot=card-title]"),
      (title) => title.innerText,
    ),
  ).toEqual(["Other Giveaway", "Sooner Giveaway", "Later Giveaway"]);
  refresh.mockClear();

  await endingSoon.click();
  await expect.element(endingSoon).toHaveAttribute("aria-pressed", "false");
  await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(
    Array.from(
      document.querySelectorAll<HTMLElement>("[data-slot=card-title]"),
      (title) => title.innerText,
    ),
  ).toEqual(["Later Giveaway", "Other Giveaway", "Sooner Giveaway"]);
  refresh.mockRestore();
});

test("renders French cards, filters, metadata, and accessible deadlines", async () => {
  overwriteGetLocale(() => "fr");
  const screen = await renderPage(
    {
      count: 1,
      giveaways: [
        {
          ...createGiveaway("epic", "Un jeu offert", "epic-games", "2026-08-01T12:00:00.000Z"),
          description: "Une aventure en français.",
          seller: "Unknown",
          price: { original: 1999, formatted: "€19.99", currency: "EUR" },
          url: "https://example.com/game",
          images: {
            wide: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
            tall: null,
            thumbnail: null,
          },
        },
      ],
      errors: [],
    },
    Date.parse("2026-07-27T12:00:00.000Z"),
  );

  await expect
    .element(screen.getByRole("heading", { name: "Des jeux à ne pas manquer" }))
    .toBeInTheDocument();
  await expect
    .element(screen.getByRole("radio", { name: "Toutes les boutiques, 1 jeu offert" }))
    .toBeInTheDocument();
  await expect
    .element(screen.getByRole("radio", { name: "GOG, 0 jeu offert" }))
    .toBeInTheDocument();
  await expect
    .element(screen.getByRole("button", { name: "Trier par date de fin" }))
    .toBeInTheDocument();
  await expect
    .element(screen.getByRole("img", { name: "Illustration de Un jeu offert" }))
    .toBeInTheDocument();
  await expect.element(screen.getByLabelText("Boutique : Epic Games")).toBeInTheDocument();
  await expect.element(screen.getByText("Une aventure en français.")).toBeInTheDocument();
  await expect.element(screen.getByText("Inconnu", { exact: true })).toBeInTheDocument();
  await expect.element(screen.getByText("19,99 €", { exact: true })).toBeInTheDocument();
  await expect.element(screen.getByRole("link", { name: "Voir l’offre" })).toBeInTheDocument();

  const deadline = screen.getByLabelText("5 jours restants ; fin le 1 août 2026 à 12:00 UTC");
  await expect.element(deadline).toHaveTextContent("5 jours restants");
  deadline
    .element()
    .dispatchEvent(new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" }));
  await expect
    .element(screen.getByRole("tooltip"))
    .toHaveTextContent("Se termine le 1 août 2026 à 12:00 UTC");
  expect(document.title).toBe("Jeux offerts | Claim");
  expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
    "Découvrez les jeux à récupérer gratuitement et à conserver sur les principales boutiques.",
  );
});

test("renders French empty states and translated card fallbacks", async () => {
  overwriteGetLocale(() => "fr");
  const screen = await renderPage({
    count: 1,
    giveaways: [createGiveaway("epic", "Un jeu offert", "epic-games", "invalid")],
    errors: [],
  });

  await expect.element(screen.getByText("Illustration indisponible")).toBeInTheDocument();
  await expect
    .element(screen.getByRole("button", { name: "Lien vers la boutique indisponible" }))
    .toBeDisabled();
  const deadline = screen.getByLabelText("Heure de fin inconnue");
  deadline
    .element()
    .dispatchEvent(new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" }));
  await expect.element(screen.getByRole("tooltip")).toHaveTextContent("Date de fin inconnue");

  await screen.getByRole("radio", { name: "GOG" }).click();
  await expect
    .element(screen.getByText("Aucun jeu offert sur GOG", { exact: true }))
    .toBeInTheDocument();
});

test("renders the French all-store empty state", async () => {
  overwriteGetLocale(() => "fr");
  const screen = await renderPage({ count: 0, giveaways: [], errors: [] });
  await expect
    .element(screen.getByText("Aucun jeu offert disponible", { exact: true }))
    .toBeInTheDocument();
});

test("renders French partial failures without raw API error text", async () => {
  overwriteGetLocale(() => "fr");
  const screen = await renderPage({
    count: 0,
    giveaways: [],
    errors: [{ store: "gog", error: "Failed to fetch giveaways from gog" }],
  });

  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("Impossible d’actualiser certaines boutiques");
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("GOG: Impossible d’actualiser les jeux offerts.");
  await expect.element(screen.getByRole("alert")).not.toHaveTextContent("Failed to fetch");
  await expect
    .element(screen.getByText("Impossible de confirmer les jeux offerts", { exact: true }))
    .toBeInTheDocument();
  await screen.getByRole("radio", { name: "GOG" }).click();
  await expect
    .element(screen.getByText("Impossible de confirmer les jeux offerts sur GOG", { exact: true }))
    .toBeInTheDocument();
});

test("reports all failed stores in French while showing cached giveaways", async () => {
  overwriteGetLocale(() => "fr");
  const screen = await renderPage({
    count: 2,
    giveaways: [
      createGiveaway("epic", "Jeu Epic", "epic-games"),
      createGiveaway("steam", "Jeu Steam", "steam"),
    ],
    errors: [
      { store: "epic-games", error: "Refresh failed" },
      { store: "prime-gaming", error: "Refresh failed" },
      { store: "gog", error: "Refresh failed" },
      { store: "steam", error: "Refresh failed" },
    ],
  });

  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("Impossible d’actualiser les boutiques");
  await expect
    .element(screen.getByRole("radio", { name: "Toutes les boutiques, 2 jeux offerts" }))
    .toBeInTheDocument();
  await expect.element(screen.getByText("Jeu Epic", { exact: true })).toBeInTheDocument();
  await expect.element(screen.getByText("Jeu Steam", { exact: true })).toBeInTheDocument();
});
