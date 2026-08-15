import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/**
 * The tinkering loop, in a real browser: build something, lock, reject, re-roll.
 *
 * The load-bearing assertion is that **a locked slot holds its exact index across a re-roll**
 * while the rest turn over (spec §3.3, ui-sensibility §2.4). That is determinism made visible,
 * and it is the one behavior the whole engine design exists to guarantee.
 */

/** Adds the first source kind offered, whatever it is, and waits for the deck to fill. */
async function addFirstSource(page: Page) {
  await page.getByRole('button', { name: 'Add a source' }).click();

  const library = page.getByRole('button', { name: /my library/i }).first();
  await library.click();

  await expect(page.getByRole('button', { name: 'Re-roll' })).toBeEnabled({ timeout: 60_000 });
}

function slotTitles(page: Page) {
  return page.locator('.slot__title');
}

test('adding a source fills the deck', async ({ page }) => {
  await page.goto('/');
  await addFirstSource(page);

  await expect(slotTitles(page).first()).toBeVisible();
});

test('a locked track holds its slot across a re-roll', async ({ page }) => {
  await page.goto('/');
  await addFirstSource(page);

  const firstTitle = await slotTitles(page).first().innerText();

  await page.getByRole('button', { name: /^Lock .*, slot 1$|^Lock .* to slot 1$/ }).click();
  await page.getByRole('button', { name: 'Re-roll' }).click();

  await expect(slotTitles(page).first()).toHaveText(firstTitle);
});

test('a re-roll turns over the slots that are not locked', async ({ page }) => {
  await page.goto('/');
  await addFirstSource(page);

  const before = await slotTitles(page).allInnerTexts();
  await page.getByRole('button', { name: 'Re-roll' }).click();
  await expect(slotTitles(page).first()).toBeVisible();
  const after = await slotTitles(page).allInnerTexts();

  expect(after).not.toEqual(before);
});

test('a rejected track does not come back on the next re-roll', async ({ page }) => {
  await page.goto('/');
  await addFirstSource(page);

  const rejected = await slotTitles(page).first().innerText();
  await page.getByRole('button', { name: `Reject ${rejected}` }).click();
  await page.getByRole('button', { name: 'Re-roll' }).click();
  await expect(slotTitles(page).first()).toBeVisible();

  await expect(slotTitles(page).filter({ hasText: rejected })).toHaveCount(0);
});

test('the recipe and its build survive a reload', async ({ page }) => {
  await page.goto('/');
  await addFirstSource(page);

  const before = await slotTitles(page).allInnerTexts();
  await page.reload();
  await expect(slotTitles(page).first()).toBeVisible({ timeout: 60_000 });

  expect(await slotTitles(page).allInnerTexts()).toEqual(before);
});

test('blocking a playlist is reachable and removes tracks', async ({ page }) => {
  await page.goto('/');
  await addFirstSource(page);

  await page.getByRole('button', { name: 'Block something' }).click();
  await page
    .getByRole('button', { name: /playlist/i })
    .first()
    .click();

  await expect(page.getByText(/kids jams/i).first()).toBeVisible({ timeout: 60_000 });
});

/**
 * The two hardware primitives, in a browser. Geometry is what jsdom cannot measure (§15), so
 * the unit tests own the value arithmetic and the ARIA contract and these own the one thing
 * they cannot: that the marks a person actually looks at move with the value.
 */
test('a knob turns from the keyboard and its arc follows', async ({ page }) => {
  await page.goto('/');

  const knob = page.getByRole('slider', { name: 'Deep cuts' });
  const arc = page.locator('[data-dial="depth"] .knob__value');
  await knob.focus();

  await page.keyboard.press('Home');
  const atLow = await arc.evaluate((node) => (node as SVGElement).style.strokeDashoffset);

  await page.keyboard.press('End');
  await expect(knob).toHaveAttribute('aria-valuenow', '1');
  const atHigh = await arc.evaluate((node) => (node as SVGElement).style.strokeDashoffset);

  expect(Number(atHigh)).toBeLessThan(Number(atLow));
});

test('a fader cap travels the length of its slot', async ({ page }) => {
  await page.goto('/');

  const fader = page.getByRole('slider', { name: 'Tracks' });
  const cap = fader.locator('.fader__cap');
  await fader.focus();

  await page.keyboard.press('Home');
  await expect(fader).toHaveAttribute('aria-valuenow', '1');
  const low = await cap.boundingBox();

  await page.keyboard.press('End');
  await expect(fader).toHaveAttribute('aria-valuenow', '200');
  await expect
    .poll(async () => (await cap.boundingBox())?.x ?? 0)
    .toBeGreaterThan((low?.x ?? 0) + 100);
});

test('a held slot lights its lamp and says so in words', async ({ page }) => {
  await page.goto('/');
  await addFirstSource(page);

  await page.getByRole('button', { name: /^Lock .*, slot 1$|^Lock .* to slot 1$/ }).click();

  const lamp = page.locator('.slot .led[data-tone="held"][data-lit="true"]').first();
  await expect(lamp).toContainText('Held');
});
