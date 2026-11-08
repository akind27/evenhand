import { defineConfig, devices } from '@playwright/test';

const PORT = 4322;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
  },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...(process.env as Record<string, string>),
      // Keyless demo mode: the e2e must never spend money or reach a real service.
      PAYPAL_CLIENT_ID: '',
      PAYPAL_CLIENT_SECRET: '',
      ANTHROPIC_API_KEY: '',
      BLOB_READ_WRITE_TOKEN: '',
      // The renter link the app builds must point at this test server.
      PUBLIC_BASE_URL: BASE_URL,
    },
  },
  projects: [
    // The installed Google Chrome is used because the bundled browser build is not installed (Ruling R27).
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'chrome' } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
  ],
});
