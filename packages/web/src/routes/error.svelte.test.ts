import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import ErrorPage from "./+error.svelte";
import { overwriteGetLocale } from "$lib/paraglide/runtime";

test("offers retry for server failures", async () => {
  const retry = vi.fn();
  const screen = render(ErrorPage, { status: 502, retry });

  await expect
    .element(screen.getByRole("heading", { name: "Something went wrong" }))
    .toBeInTheDocument();
  await expect.element(screen.getByText("Error 502", { exact: true })).toBeInTheDocument();
  await screen.getByRole("button", { name: "Try again" }).click();
  expect(retry).toHaveBeenCalledOnce();
});

test("offers a translated retry for French server failures", async () => {
  overwriteGetLocale(() => "fr");
  const retry = vi.fn();
  const screen = render(ErrorPage, { status: 502, retry });
  await expect
    .element(screen.getByRole("heading", { name: "Une erreur est survenue" }))
    .toBeInTheDocument();
  await expect.element(screen.getByText("Erreur 502", { exact: true })).toBeInTheDocument();
  await screen.getByRole("button", { name: "Réessayer" }).click();
  expect(retry).toHaveBeenCalledOnce();
});

test("offers translated navigation for a French missing page", async () => {
  overwriteGetLocale(() => "fr");
  const screen = render(ErrorPage, { status: 404 });
  await expect
    .element(screen.getByRole("heading", { name: "Page introuvable" }))
    .toBeInTheDocument();
  await expect
    .element(screen.getByRole("link", { name: "Retour à l’accueil" }))
    .toHaveAttribute("href", "/");
});

test("offers navigation home instead of retry for unknown routes", async () => {
  const screen = render(ErrorPage, { status: 404 });

  await expect.element(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  await expect
    .element(screen.getByRole("link", { name: "Return home" }))
    .toHaveAttribute("href", "/");
  await expect.element(screen.getByRole("button", { name: "Try again" })).not.toBeInTheDocument();
});
