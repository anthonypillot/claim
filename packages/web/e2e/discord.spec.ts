import { expect, test } from "@playwright/test";

test("publishes localized Discord installation, privacy, and verified deletion help", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/discord");
  await expect(
    page.getByRole("heading", { name: "Discord giveaway alerts", exact: true }),
  ).toBeVisible();
  const install = page.getByRole("link", { name: "Add to Discord" });
  await expect(install).toHaveAttribute(
    "href",
    /https:\/\/discord.com\/oauth2\/authorize\?.*client_id=100000000000000003/,
  );
  await expect(page.getByText("/claim setup", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Discord privacy", exact: true })).toBeVisible();
  await expect(page.getByText(/at most 30 days/)).toBeVisible();
  await page.goto("/discord/support");
  await expect(page.getByRole("link", { name: "Contact support" })).toHaveAttribute(
    "href",
    "https://support.example/claim",
  );
  await expect(page.getByText(/verify that you manage the server/)).toBeVisible();
  await page.getByRole("radio", { name: "Français", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Assistance Discord", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
