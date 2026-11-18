import { defineConfig, devices } from "@playwright/test";

/**
 * Testes ponta a ponta contra o app real (frontend + API + banco + LLM).
 * Suba o ambiente antes (docker compose up, ou backend + `npm run build && npm start`) e rode `npm run test:e2e`.
 * E2E_BASE_URL muda o endereço (padrão http://localhost:3000).
 *
 * Um worker só: cada navegador usa uma conta, e o chat atende uma resposta por vez por conexão.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "pt-BR",
  },
  projects: [
    { name: "setup", testMatch: /global\.setup\.ts/ },
    { name: "chromium", use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/chromium.json" }, dependencies: ["setup"] },
    { name: "firefox", use: { ...devices["Desktop Firefox"], storageState: "e2e/.auth/firefox.json" }, dependencies: ["setup"] },
  ],
});
