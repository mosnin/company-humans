import { defineConfig } from "@playwright/test";
/** Explicit local runtime suite: start the isolated Convex backend and Next server first. */
export default defineConfig({
  testDir: "./tests/runtime",
  testMatch: "**/*.spec.ts",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" },
  outputDir: "./test-results/runtime",
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
