import { defineConfig } from '@playwright/test';

// BASE_URL set: run against that deployment (the live smoke workflow). Unset: build the client
// and start the e2e server, whose outside calls are answered from the fixtures.
const liveUrl = process.env.BASE_URL;
const localUrl = 'http://localhost:3100';

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  // A real report takes 26 to 39 seconds, and the server deadline is 90.
  timeout: 120_000,
  use: { baseURL: liveUrl ?? localUrl },
  webServer: liveUrl
    ? undefined
    : {
        command: 'pnpm build && pnpm --filter server e2e',
        url: `${localUrl}/api/health`,
        env: { PORT: '3100' },
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
