import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end against **demo mode**, which needs no credentials and no network (spec §5.1).
 * That is the whole reason these can run in CI: `FakeSpotifyClient` is a real implementation
 * of the client contract, not a stub, so exercising it exercises the app.
 *
 * The server is built and started rather than run through `next dev`, because a dev server
 * hides exactly the class of mistake a build catches.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // Serial in CI so a shared runner cannot make timing the reason a run is red. Locally,
  // omitted entirely rather than set to undefined — `exactOptionalPropertyTypes` is on.
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: process.env.CI ? ([['html'], ['list']] as const) : 'list',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  /**
   * Two widths, because §7.1's two layouts differ **in kind rather than in size** and jsdom
   * cannot measure either. The phone project is the reference viewport — 390×844, a hand
   * holding a phone — with touch on, since a swipe between sections is a real gesture and not
   * a mouse drag with a different name.
   */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /phone\.spec\.ts/,
    },
    {
      name: 'phone',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
      testMatch: /phone\.spec\.ts/,
    },
  ],

  webServer: {
    command: 'pnpm build && pnpm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // No SPOTIFY_CLIENT_ID and no SESSION_SECRET, deliberately: missing env is demo mode,
    // never a crash (spec §5.1), and this suite is the thing that proves it.
    env: { NODE_ENV: 'production' },
  },
});
