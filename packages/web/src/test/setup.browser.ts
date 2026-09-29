import { beforeEach } from "vitest";
import { overwriteGetLocale } from "$lib/paraglide/runtime";

beforeEach(() => {
  overwriteGetLocale(() => "en");
});
