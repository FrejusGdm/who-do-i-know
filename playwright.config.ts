import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 30_000 },
  outputDir: "/private/tmp/network-os-browser-results",
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3007",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { channel: "chrome" },
  },
  webServer: {
    command: "node --import tsx tests/browser/start-server.ts",
    url: "http://127.0.0.1:3007",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
