import { defineConfig, devices } from '@playwright/test';

// Lokal ohne passende Playwright-Browser: PW_CHROMIUM_PATH setzen und WebKit mit E2E_SKIP_WEBKIT=1 auslassen.
const executablePath = process.env.PW_CHROMIUM_PATH;
const chromium = executablePath ? { launchOptions: { executablePath } } : {};

// update.spec.ts braucht für den echten Worker-Wechsel einen eigenen Server (Port 4180) und läuft nur in
// chromium-desktop: ein Browser genügt als Nachweis, die Logik ist per Unit-Test abgedeckt.
const skipUpdate = { testIgnore: /update\.spec\.ts/ };

const projects = [
  { name: 'chromium-mobile', use: { ...devices['Pixel 7'], ...chromium }, ...skipUpdate },
  { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], ...chromium } },
  ...(process.env.E2E_SKIP_WEBKIT
    ? []
    : [
        { name: 'webkit-mobile', use: { ...devices['iPhone 14'] }, ...skipUpdate },
        { name: 'webkit-desktop', use: { ...devices['Desktop Safari'] }, ...skipUpdate },
      ]),
];

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4173/', locale: 'de-DE', trace: 'retain-on-failure' },
  webServer: {
    command: 'VITE_E2E=1 npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects,
});
