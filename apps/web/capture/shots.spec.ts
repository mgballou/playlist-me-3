import { fileURLToPath } from 'node:url';

import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/**
 * The README's screenshots, captured by driving the real app in demo mode.
 *
 * These exist because the alternative is capturing by hand, and a hand-captured shot goes
 * stale silently. One already had: `collapsed-deck.png` was still showing the single-line
 * ellipsis that `6071a8b` removed, so the README advertised a bug the code had fixed. A shot
 * nobody can re-take is a claim nobody can re-check.
 *
 * This is a capture tool, not a test. It lives outside `e2e/` and behind its own config
 * (`pnpm shots`), because it writes into the working tree — the one thing a test must not do,
 * and something `pnpm test:e2e` and CI must not be able to reach. The assertions in it exist
 * to make it fail loudly rather than photograph a blank page.
 *
 * Determinism comes from the engine, not from this file. `INITIAL_SEED` is a constant and the
 * fixtures are fixed, so the same clicks produce the same deck every run and a re-capture is a
 * no-op diff unless something actually changed.
 */

/** Resolved from this file, not from the cwd, so it lands in the repo's `docs/` either way. */
const SHOTS = fileURLToPath(new URL('../../../docs/assets', import.meta.url));

/**
 * Demo mode starts empty; every shot but the empty bench needs something on the deck.
 *
 * Readiness is **every** source row showing its `+N`, not the Re-roll button. Re-roll enables
 * as soon as the *first* source lands, so waiting on it photographed a second source still
 * mid-flight: the first hero went out reading `resolving…` in two places, with a red "found
 * nothing" edge on a source that pools 24 tracks a moment later.
 *
 * Waiting on the crown instead would race the other way — it still holds the previous count
 * for a tick after the click, so the assertion can pass on a number that predates the source
 * being added. Asking each row for its own arithmetic cannot be satisfied by a stale value.
 */
async function addSource(page: Page, name: RegExp) {
  // Scoped away from `.row--block`, which shares the class and would skew the arithmetic.
  const rows = page.locator('.row:not(.row--block) .row__count');
  const before = await rows.count();

  await page.getByRole('button', { name: 'Add a source' }).click();
  await page.getByRole('button', { name }).first().click();

  await expect(rows).toHaveCount(before + 1);
  await expect(rows).toHaveText(
    Array.from({ length: before + 1 }, () => /\+\d/),
    {
      timeout: 60_000,
    },
  );
}

/**
 * Goes to a section, or does nothing when the frame is wide enough to show all four at once.
 * Above the threshold the keys do not exist at all (§7.1), so there is nothing to press.
 */
async function visit(page: Page, section: 'Sources' | 'Block' | 'Shape' | 'Deck') {
  const key = page.getByRole('tab', { name: new RegExp(section) });
  if ((await key.count()) === 0) return;
  await key.click();
  await expect(key).toHaveAttribute('aria-selected', 'true');
}

/**
 * Drives a slider or a knob from its floor by `steps` presses, the way a keyboard user would,
 * and blurs it afterwards. Blurring matters for the same reason it does on the name field: a
 * focus ring is drawn in the accent, and a shot of a control is not a shot of it being used.
 */
async function turn(page: Page, name: string, steps: number) {
  const control = page.getByRole('slider', { name });
  await control.focus();
  await page.keyboard.press('Home');
  for (let press = 0; press < steps; press += 1) await page.keyboard.press('ArrowRight');
  await control.blur();
}

/**
 * A named recipe, two sources that pool, and the kids' playlist blocked — the app in use
 * rather than the app on arrival. The block is not decoration: excluding a whole playlist is
 * the thing the README claims Spotify's own generator will not do, so the hero should show it
 * happening rather than show the empty state describing it.
 */
async function stageRecipe(page: Page) {
  await visit(page, 'Sources');
  await addSource(page, /my library/i);
  await addSource(page, /my top tracks/i);

  await visit(page, 'Block');
  await page.getByRole('button', { name: 'Block something' }).click();
  await page
    .getByRole('button', { name: /playlist/i })
    .first()
    .click();
  await page.locator('.picker__choice').first().click();
  await expect(page.locator('.row--block')).toHaveCount(1);

  await visit(page, 'Sources');
  const name = page.getByRole('textbox', { name: 'Recipe name' });
  await name.fill('Late dub, nothing I know');
  await expect(name).toHaveValue('Late dub, nothing I know');

  // `fill` leaves the field focused, and a focus ring is drawn in the accent — which would put
  // a second accent in the shot, on a text box, in a design whose first rule is one accent per
  // region and the accent means *act* (§5). Blur it so the only red left is Re-roll.
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await expect(name).not.toBeFocused();
}

/**
 * Scrolls a region until it sits clear of the crown.
 *
 * `scrollIntoViewIfNeeded` is not enough: the crown is fixed, so a region scrolled flush to
 * the top of the viewport is scrolled *underneath* it. An element screenshot photographs the
 * region's box either way, and the first SHAPE capture came back with `PLAYLIST.ME` printed
 * where the module's own heading band should have been.
 *
 * Which thing scrolls differs by layout — the stage below the threshold, the document above it
 * — so this finds the ancestor that *actually* overflows rather than naming one. Naming one was
 * the first attempt and it silently did nothing: `.stage` matched on desktop but never scrolls
 * there, so `scrollTop -= overlap` moved an element that was already at zero.
 */
async function clearCrown(page: Page, region: Locator) {
  await region.scrollIntoViewIfNeeded();

  const crown = (await page.locator('.crown').boundingBox())?.height ?? 0;
  await region.evaluate((node, clearance) => {
    const scrolls = (el: Element) =>
      el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY);

    let scroller: Element | null = node.parentElement;
    while (scroller !== null && !scrolls(scroller)) scroller = scroller.parentElement;
    scroller ??= document.scrollingElement;

    const overlap = clearance - node.getBoundingClientRect().top;
    if (scroller !== null && overlap > 0) scroller.scrollTop -= overlap;
  }, crown + 12);
}

async function setTheme(page: Page, theme: 'dark' | 'light') {
  const toggle = page.getByRole('button', { name: `Switch to the ${theme} theme` });
  if ((await toggle.count()) > 0) {
    await toggle.click();
    // Blurred through the document, not through `toggle`: the button renames itself to the
    // theme it now offers, so the locator that clicked it no longer matches anything.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

/**
 * Motion is disabled for every capture. A knob mid-sweep or a slot mid-fade photographs as a
 * smear, and the shot is meant to show the resting state of the interface.
 */
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/**
 * Waits for the two things that quietly ruin a screenshot, both learned the hard way:
 *
 * - **Fonts.** Reduced motion does not hold the shutter for `next/font`, and the first capture
 *   went out in the system fallback — wider than Plex, which truncated `SOURCES` to `SOURC…`
 *   in a key that fits it fine. A shot in the wrong typeface is a shot of a layout bug that
 *   does not exist.
 * - **Transitions.** `prefers-reduced-motion` shortens the durations here, it does not remove
 *   them (§8 — reduced motion is designed, not stripped), so a cross-fade is still in flight
 *   for a beat after a section key is pressed.
 */
async function settle(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(async () => {
        await document.fonts.ready;
        // The name is the assertion. `next/font` registers a metric-matched
        // `IBM Plex Sans Fallback` beside the real face, and `fonts.ready` resolves happily
        // with only the fallback present — which is how the first phone capture went out in
        // the wrong typeface, photographing a truncated `SOURC…` that does not happen in Plex.
        const real = (family: string) =>
          [...document.fonts].some((face) => face.family === family && face.status === 'loaded');
        return real('IBM Plex Sans') && real('IBM Plex Mono');
      }),
    )
    .toBe(true);

  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.panel, .slot')].every(
          (node) => getComputedStyle(node).opacity === '1',
        ),
      ),
    )
    .toBe(true);
}

test.describe('desktop', () => {
  test.use({ viewport: { width: 1440, height: 1180 } });

  test('empty bench', async ({ page }) => {
    await page.goto('/');
    await setTheme(page, 'dark');

    await expect(page.getByRole('button', { name: 'Add a source' })).toBeVisible();
    await settle(page);
    await page.screenshot({ path: `${SHOTS}/empty-bench.png` });
  });

  test('bench, dark', async ({ page }) => {
    await page.goto('/');
    await setTheme(page, 'dark');
    await stageRecipe(page);

    await settle(page);

    await page.screenshot({ path: `${SHOTS}/bench.png` });
  });

  test('bench, light', async ({ page }) => {
    await page.goto('/');
    await setTheme(page, 'light');
    await stageRecipe(page);

    await settle(page);

    await page.screenshot({ path: `${SHOTS}/bench-light.png` });
  });

  /**
   * The deck with slot 1 locked, because a lit lock is the only still image that carries what
   * re-roll does — the README's claim that a locked slot holds while the rest turn over.
   */
  test('deck', async ({ page }) => {
    await page.goto('/');
    await setTheme(page, 'dark');
    await addSource(page, /my library/i);

    // Ten tracks, so the region fits the viewport. A taller deck makes Playwright scroll and
    // composite, and the fixed ledger stays where it is — the first attempt came out with the
    // save bar printed across the middle of the list, over a slot it had covered.
    await turn(page, 'Tracks', 9);
    await expect(page.locator('.slot')).toHaveCount(10);

    await page.getByRole('button', { name: /^Lock .*slot 1$/ }).click();
    await expect(page.getByRole('button', { name: /^Unlock/ }).first()).toBeVisible();

    await settle(page);

    await page.getByRole('region', { name: 'Deck' }).screenshot({ path: `${SHOTS}/deck.png` });
  });

  /** Both knobs and both honesty lines, which is the one place the app's estimates are named. */
  test('shape', async ({ page }) => {
    await page.goto('/');
    await setTheme(page, 'dark');
    await addSource(page, /my library/i);

    // One knob turned and one left alone. Both at `no preference` photographs two identical
    // controls at twelve o'clock, which shows the parts but not that they do anything.
    await turn(page, 'Deep cuts', 14);

    const shape = page.getByRole('region', { name: 'Shape' });
    await clearCrown(page, shape);
    await settle(page);
    await shape.screenshot({ path: `${SHOTS}/shape.png` });
  });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('sources', async ({ page }) => {
    await page.goto('/');
    await setTheme(page, 'dark');
    await stageRecipe(page);

    await settle(page);
    await page.screenshot({ path: `${SHOTS}/phone-sources.png` });
  });

  test('deck', async ({ page }) => {
    await page.goto('/');
    await setTheme(page, 'dark');
    await stageRecipe(page);

    await visit(page, 'Deck');
    await settle(page);
    await page.screenshot({ path: `${SHOTS}/phone-deck.png` });
  });
});
