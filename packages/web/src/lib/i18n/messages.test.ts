import { compile } from "@inlang/paraglide-js";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "vitest";
import english from "../../../i18n/en.json";
import french from "../../../i18n/fr.json";
import settings from "../../../i18n/project.inlang/settings.json";
import config from "../../../paraglide.config";

test("ships a French translation for each English message", () => {
  expect(Object.keys(french).sort()).toEqual(Object.keys(english).sort());
});

test("a missing French message compiles to the English fallback", async () => {
  const directory = await mkdtemp(join(tmpdir(), "claim-i18n-"));
  const catalogRoot = fileURLToPath(new URL("../../../i18n/", import.meta.url));
  const { page_title: _omitted, ...incompleteFrench } = french;
  try {
    await mkdir(join(directory, "i18n/project.inlang"), { recursive: true });
    await writeFile(
      join(directory, "i18n/project.inlang/settings.json"),
      JSON.stringify({
        ...settings,
        modules: settings.modules.map((module) =>
          relative(join(directory, "i18n"), resolve(catalogRoot, module)),
        ),
      }),
    );
    await writeFile(join(directory, "i18n/en.json"), JSON.stringify(english));
    await writeFile(join(directory, "i18n/fr.json"), JSON.stringify(incompleteFrench));

    await compile({
      ...config,
      project: join(directory, "i18n/project.inlang"),
      outdir: join(directory, "generated"),
      emitTsDeclarations: false,
    });
    const messages = await import(
      /* @vite-ignore */ pathToFileURL(join(directory, "generated/messages.js")).href
    );
    expect(messages.page_title({}, { locale: "fr" })).toBe("Giveaways | Claim");
    expect(messages.hero_title({}, { locale: "fr" })).toBe("Des jeux à ne pas manquer");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
