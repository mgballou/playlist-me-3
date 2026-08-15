import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/**
 * The claim these exist to defend: **the app runs with no credentials at all** (spec §5.1).
 * The suite is configured with no `SPOTIFY_CLIENT_ID` and no `SESSION_SECRET`, so if any of
 * this passes, demo mode genuinely works rather than merely being documented.
 */

/**
 * `exact` is load-bearing. The crown's indicator is an LED, and §5 rule 4 says a lamp is never
 * the only carrier — so the word sits beside it, and the full notice sits behind it for a
 * screen reader. A loose match would resolve to the hidden notice and quietly assert nothing
 * about the thing on screen.
 */
const indicator = (page: Page) => page.getByText('demo mode', { exact: true });

test('the app loads into demo mode and says so', async ({ page }) => {
  await page.goto('/');

  await expect(indicator(page)).toBeVisible();
});

test('demo mode names itself in words, not only by the colour of a lamp', async ({ page }) => {
  await page.goto('/');

  await expect(indicator(page)).toContainText(/demo/i);
});

test('the lamp beside the words is lit', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.crown__demo .led')).toHaveAttribute('data-lit', 'true');
});

test('the empty bench offers exactly one thing to do', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Add a source' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Re-roll' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save to Spotify' })).toBeDisabled();
});

test('the empty bench names what happens next rather than saying nothing here', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.getByText(/nothing to build from yet/i)).toBeVisible();
});

/**
 * With no client id configured there is nothing to connect *to*, so the crown offers no
 * connect link — `cause` is `notConfigured`, not `noSession`. Offering a button that could
 * only fail would be a dead end with a control on it (§2.7).
 */
test('an unconfigured app does not offer a connection it cannot make', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('link', { name: /connect spotify/i })).toHaveCount(0);
});
