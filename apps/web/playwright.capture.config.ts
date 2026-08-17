import { defineConfig, devices } from '@playwright/test';

import base from './playwright.config';

/**
 * `pnpm shots` — the tool that re-captures the README's screenshots.
 *
 * It has its own config, and its own directory, for one reason: **it writes into the working
 * tree.** A suite that edits files is a tool wearing a test's clothes, and it must not be
 * reachable from `pnpm test:e2e` or from CI. Living in `e2e/` under a fourth project would
 * have been reachable from both — `playwright test` runs every project in a config, so
 * excluding it from the other projects excludes nothing.
 *
 * Everything that describes the app under test is inherited: the same production server, the
 * same absent credentials, the same demo mode. Only the retry and reporting posture differs,
 * because a flaky capture should stop and say so rather than quietly try again.
 */
export default defineConfig({
  ...base,
  testDir: './capture',
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  projects: [{ name: 'capture', use: { ...devices['Desktop Chrome'] } }],
});
