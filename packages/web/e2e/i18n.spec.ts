import { expect, test } from "@playwright/test";

test.use({ locale: "fr-FR" });

test("renders French before JavaScript runs", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ locale: "fr-FR", javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    const response = await page.goto(`${baseURL}/`);
    expect(response?.headers()["content-language"]).toBe("fr");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page).toHaveTitle("Jeux offerts | Claim");
    await expect(page.getByRole("heading", { name: "Des jeux à ne pas manquer" })).toBeVisible();
    await expect(page.getByText("Découvrez ce jeu en français (FR).")).toBeVisible();
    await expect(page.getByRole("radio", { name: "Français", exact: true })).toBeChecked();
  } finally {
    await context.close();
  }
});

test("switches language, persists it, and preserves filters across document reloads", async ({
  page,
  context,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "warning" && message.text().includes("hydration"))
      errors.push(message.text());
  });
  await page.goto("/?store=epic-games&sort=ending-soon#giveaway-list-title");
  await expect(page.getByText("Une aventure offerte", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "Epic Games, 1 jeu offert", exact: true }),
  ).toBeChecked();
  const initialTimeOrigin = await page.evaluate(() => performance.timeOrigin);

  await page.getByRole("radio", { name: "English", exact: true }).click();
  await expect(page).toHaveTitle("Giveaways | Claim");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByText("Discover this game in English (US).")).toBeVisible();
  await expect(page.getByRole("radio", { name: "English", exact: true })).toBeChecked();
  await expect(
    page.getByRole("radio", { name: "Epic Games, 1 giveaway", exact: true }),
  ).toBeChecked();
  await expect(page.getByRole("button", { name: "Sort by ending soon" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page).toHaveURL(/\?store=epic-games&sort=ending-soon#giveaway-list-title$/);
  expect(await page.evaluate(() => performance.timeOrigin)).not.toBe(initialTimeOrigin);

  const cookie = (await context.cookies()).find((cookie) => cookie.name === "claim_locale");
  expect(cookie?.value).toBe("en");
  expect(cookie?.path).toBe("/");
  expect(cookie?.expires).toBeGreaterThan(Date.now() / 1000 + 360 * 24 * 60 * 60);
  await page.reload();
  await expect(page).toHaveTitle("Giveaways | Claim");

  // A new browser context restores only persisted cookies; its browser language remains French.
  const returning = await browser.newContext({
    locale: "fr-FR",
    storageState: await context.storageState(),
  });
  try {
    const nextVisit = await returning.newPage();
    await nextVisit.goto(page.url());
    await expect(nextVisit).toHaveTitle("Giveaways | Claim");
    await expect(nextVisit.getByText("Discover this game in English (US).")).toBeVisible();
  } finally {
    await returning.close();
  }

  await page.getByRole("radio", { name: "Français", exact: true }).click();
  await expect(page).toHaveTitle("Jeux offerts | Claim");
  await expect(page.getByText("Découvrez ce jeu en français (FR).")).toBeVisible();
  expect(errors).toEqual([]);
});

test("keeps French controls accessible on mobile and translates theme changes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.getByRole("radio", { name: "English", exact: true })).toBeInViewport();
  await expect(page.getByRole("radio", { name: "Français", exact: true })).toBeInViewport();
  await page.getByRole("switch", { name: "Passer au thème sombre" }).click();
  await expect(page.getByRole("switch", { name: "Passer au thème clair" })).toBeChecked();
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute(
    "href",
    "/favicon-white.svg",
  );
  await expect(page.getByRole("navigation", { name: "Navigation de pied de page" })).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("fits the French filter toolbar at the desktop breakpoint", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Trier par date de fin" }).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("uses the language selected in another tab when returning home", async ({ page, context }) => {
  await page.goto("/missing-page");
  await expect(page).toHaveTitle("Page introuvable | Claim");

  const otherTab = await context.newPage();
  await otherTab.goto("/");
  await otherTab.getByRole("radio", { name: "English", exact: true }).click();
  await expect(otherTab).toHaveTitle("Giveaways | Claim");

  await page.getByRole("link", { name: "Retour à l’accueil" }).click();
  await expect(page).toHaveTitle("Giveaways | Claim");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("radio", { name: "English", exact: true })).toBeChecked();
  await expect(page.getByText("Discover this game in English (US).")).toBeVisible();
});

test("retains the server language when navigator preferences differ during hydration", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "languages", { get: () => ["en-US"] });
  });
  await page.goto("/");
  await expect(page).toHaveTitle("Jeux offerts | Claim");
  await expect(page.getByRole("radio", { name: "Français", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Trier par date de fin" }).click();
  await expect(page.getByRole("button", { name: "Trier par date de fin" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
});

test("offers keyboard language switching on a French error page", async ({ page }) => {
  const response = await page.goto("/missing-page");
  expect(response?.status()).toBe(404);
  await expect(page).toHaveTitle("Page introuvable | Claim");
  await expect(page.getByRole("link", { name: "Retour à l’accueil" })).toBeVisible();
  await page.getByRole("radio", { name: "English", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(page).toHaveTitle("Page not found | Claim");
  await expect(page.getByRole("link", { name: "Return home" })).toBeVisible();
  await expect(page).toHaveURL(/\/missing-page$/);
});

test("keeps the selected language checked when it is activated again", async ({ page }) => {
  await page.goto("/");
  const french = page.getByRole("radio", { name: "Français", exact: true });
  await expect(french).toBeChecked();
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);

  await french.click();
  await expect(french).toBeChecked();
  await french.press("Space");
  await expect(french).toBeChecked();
  await expect(page.getByRole("radio", { name: "English", exact: true })).not.toBeChecked();
  await expect(page).toHaveTitle("Jeux offerts | Claim");
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
});
