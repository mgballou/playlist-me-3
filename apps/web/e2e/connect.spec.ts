import { expect, test } from '@playwright/test';

/**
 * Pressing Connect in a copy of the app with no credentials. ui-sensibility §2.7 — **a dead
 * end is a bug**, and this is the one flow that has no demo mode to fall back on.
 *
 * It goes through the login route rather than straight to `/?connect=unavailable`, because the
 * redirect is half of what is being asserted: the suite runs with no `SPOTIFY_CLIENT_ID`, so
 * the route really does answer `unavailable`, and the bench really does have to say so.
 */

const notice = '.stage__notice [role="alert"]';

test('pressing connect in an unconfigured copy says why it cannot', async ({ page }) => {
  await page.goto('/api/auth/login');

  await expect(page.locator(notice)).toContainText('cannot connect to Spotify');
});

test('the notice says what happens instead rather than stopping there', async ({ page }) => {
  await page.goto('/?connect=unavailable');

  await expect(page.locator(notice)).toContainText('demo mode');
});

test('it offers no connect link that could only land back here', async ({ page }) => {
  await page.goto('/?connect=unavailable');

  await expect(page.locator(`${notice} a`)).toHaveCount(0);
});

test('a failed handoff says what went wrong and offers the way back', async ({ page }) => {
  await page.goto('/?auth=stateMismatch');

  await expect(page.locator(notice)).toContainText('That sign-in did not finish');
});

test('a failed handoff never prints the reason it was given', async ({ page }) => {
  await page.goto('/?auth=stateMismatch');

  await expect(page.locator(notice)).not.toContainText('stateMismatch');
});

test('the reason leaves the URL, so a reload does not show it forever', async ({ page }) => {
  await page.goto('/?auth=stateMismatch');
  await expect(page.locator(notice)).toBeVisible();

  await expect(page).toHaveURL('/');
});

test('a reload after the notice lands on a plain bench', async ({ page }) => {
  await page.goto('/?auth=stateMismatch');
  await expect(page.locator(notice)).toBeVisible();

  await page.reload();

  await expect(page.locator(notice)).toHaveCount(0);
});

test('the bench carries no notice when nothing failed', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator(notice)).toHaveCount(0);
});
