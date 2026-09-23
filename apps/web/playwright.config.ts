import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser", testMatch: "**/*.spec.ts", fullyParallel: true,
  use: { baseURL: "http://127.0.0.1:3219", trace: "retain-on-failure" },
  projects: [{ name: "desktop", use: { viewport: { width: 1440, height: 1000 } } }, { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }],
  webServer: { command: "npx vite --config browser-test.config.ts", url: "http://127.0.0.1:3219", reuseExistingServer: false },
});
