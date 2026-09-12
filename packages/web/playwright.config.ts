import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://127.0.0.1:4174",
    browserName: "chromium",
    contextOptions: { reducedMotion: "reduce" },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "bun run build && node e2e/server.ts",
    url: "http://127.0.0.1:4174/health",
    timeout: 120_000,
  },
});
