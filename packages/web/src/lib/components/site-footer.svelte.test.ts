import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";
import SiteFooter from "./site-footer.svelte";

test("shows attribution, secondary links, and the current release version", async () => {
  const screen = render(SiteFooter, { apiUrl: "/api/openapi", version: "1.2.3" });

  await expect.element(screen.getByRole("contentinfo")).toBeInTheDocument();
  await expect
    .element(screen.getByRole("navigation", { name: "Footer navigation" }))
    .toBeInTheDocument();
  await expect
    .element(screen.getByRole("link", { name: "Anthony Pillot" }))
    .toHaveAttribute("href", "https://anthonypillot.com");
  await expect
    .element(screen.getByRole("link", { name: "GitHub" }))
    .toHaveAttribute("href", "https://github.com/anthonypillot/claim");
  await expect
    .element(screen.getByRole("link", { name: "API" }))
    .toHaveAttribute("href", "/api/openapi");
  await expect
    .element(screen.getByRole("link", { name: "Claim version v1.2.3" }))
    .toHaveAttribute("href", "https://github.com/anthonypillot/claim/releases/tag/v1.2.3");
  await expect
    .element(screen.getByRole("link", { name: "Claim version v1.2.3" }))
    .toHaveTextContent("v1.2.3");
});

test("shows the exact preview image version and links it to the repository", async () => {
  const screen = render(SiteFooter, { apiUrl: "/api/openapi", version: "issue-44-footer" });

  await expect
    .element(screen.getByRole("link", { name: "Claim version issue-44-footer" }))
    .toHaveAttribute("href", "https://github.com/anthonypillot/claim");
  await expect
    .element(screen.getByRole("link", { name: "Claim version issue-44-footer" }))
    .toHaveTextContent("issue-44-footer");
});
