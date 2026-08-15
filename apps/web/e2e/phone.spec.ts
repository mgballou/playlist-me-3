import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/**
 * The paged frame, on a phone. ui-sensibility §7.1.
 *
 * This is the suite that has to exist: every claim in §7.1 is about a viewport, a scroll
 * position or a gesture, and jsdom has none of the three (§15 — geometry a unit test cannot
 * measure gets a browser pass instead). The unit tests own the ARIA contract, the counts and
 * the navigation arithmetic; these own the part a person actually experiences.
 */

const KEYS = ['Sources', 'Block', 'Shape', 'Deck'] as const;

function key(page: Page, name: (typeof KEYS)[number]): Locator {
  return page.getByRole('tab', { name: new RegExp(name) });
}

async function addFirstSource(page: Page) {
  await key(page, 'Sources').click();
  await page.getByRole('button', { name: 'Add a source' }).click();
  await page
    .getByRole('button', { name: /my library/i })
    .first()
    .click();
  await key(page, 'Deck').click();
  await expect(page.getByRole('button', { name: 'Re-roll' })).toBeEnabled({ timeout: 60_000 });
}

/** A real gesture: pointer events with a touch pointer type, which is what a thumb sends. */
async function swipe(page: Page, distance: number) {
  const stage = page.locator('.stage');
  const box = await stage.boundingBox();
  const from = { x: (box?.width ?? 390) / 2, y: (box?.height ?? 600) / 2 };
  const touch = { pointerType: 'touch', pointerId: 1, isPrimary: true, bubbles: true };

  await stage.dispatchEvent('pointerdown', { ...touch, clientX: from.x, clientY: from.y });
  await stage.dispatchEvent('pointerup', {
    ...touch,
    clientX: from.x + distance,
    clientY: from.y,
  });
}

test('the frame gains its keys below the threshold', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('tab')).toHaveCount(4);
});

test('the keys do not exist above the threshold', async ({ page }) => {
  await page.goto('/');
  await page.setViewportSize({ width: 1280, height: 900 });

  await expect(page.getByRole('tab')).toHaveCount(0);
});

test('all four regions are on screen at once above the threshold', async ({ page }) => {
  await page.goto('/');
  await page.setViewportSize({ width: 1280, height: 900 });

  for (const name of KEYS) {
    await expect(page.getByRole('region', { name })).toBeVisible();
  }
});

test('one section is showing and the other three are not', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('tabpanel')).toHaveCount(1);
});

test('the crown and the ledger stay put while sections change', async ({ page }) => {
  await page.goto('/');
  await key(page, 'Deck').click();

  await expect(page.getByText('demo mode', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save to Spotify' })).toBeVisible();
});

test('the keys sit between the section and the ledger, at thumb height', async ({ page }) => {
  await page.goto('/');

  const keys = (await page.locator('.keys').boundingBox())?.y ?? 0;
  const ledger = (await page.locator('.ledger').boundingBox())?.y ?? 0;
  const stage = (await page.locator('.stage').boundingBox())?.y ?? 0;

  expect(stage).toBeLessThan(keys);
  expect(keys).toBeLessThan(ledger);
});

/**
 * Position is marked by **height**, not by colour (§7.1, §3). A proud key carries a drop
 * shadow as well as its inset top edge; a key machined into the panel carries inset light and
 * nothing else. Reading the shadows apart is what tells those two states apart honestly —
 * `includes('inset')` would call both of them pressed, because the top edge is inset too.
 */
function shadows(locator: Locator): Promise<readonly string[]> {
  return locator.evaluate((node) =>
    getComputedStyle(node)
      .boxShadow.split(/,(?![^(]*\))/)
      .map((part) => part.trim()),
  );
}

test('the selected key is pressed in while the others stay proud', async ({ page }) => {
  await page.goto('/');

  const pressed = await shadows(key(page, 'Sources'));
  expect(pressed.every((part) => part.includes('inset'))).toBe(true);
});

test('an unselected key keeps a drop shadow, so it still reads as proud', async ({ page }) => {
  await page.goto('/');

  const proud = await shadows(key(page, 'Deck'));
  expect(proud.some((part) => !part.includes('inset'))).toBe(true);
});

test('a key is never marked by the accent, because travel is not an act', async ({ page }) => {
  await page.goto('/');

  // Resolved through a probe so both sides arrive in the browser's own colour format; the
  // raw token is an oklch string and would differ from a computed fill for the wrong reason.
  const accent = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = 'var(--accent)';
    document.body.append(probe);
    const resolved = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return resolved;
  });

  for (const name of KEYS) {
    const face = await key(page, name).evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(face).not.toBe(accent);
  }
});

/**
 * The load-bearing claim of the whole design: **`BLOCK −68` is legible while you are looking
 * at the deck.** A key that showed only a name would be a worse version of a scroll.
 */
test('a key carries its count while another section is showing', async ({ page }) => {
  await page.goto('/');
  await addFirstSource(page);

  await key(page, 'Block').click();
  await page.getByRole('button', { name: 'Block something' }).click();
  await page
    .getByRole('button', { name: /playlist/i })
    .first()
    .click();
  await page.locator('.picker__choice').first().click();

  await key(page, 'Deck').click();
  await expect(key(page, 'Block')).toHaveText(/−\d+/, { timeout: 60_000 });
});

/** §2.3, and the reason a long scroll was the wrong answer: the tuning has to land. */
test('a change made in SHAPE is visible on the DECK one press later', async ({ page }) => {
  await page.goto('/');
  await addFirstSource(page);

  await key(page, 'Shape').click();
  const tracks = page.getByRole('slider', { name: 'Tracks' });
  await tracks.focus();
  await page.keyboard.press('Home');
  await expect(tracks).toHaveAttribute('aria-valuenow', '1');

  await key(page, 'Deck').click();
  await expect(page.locator('.slot__title')).toHaveCount(1);
});

test('the deck keeps building while it is off screen', async ({ page }) => {
  await page.goto('/');
  await addFirstSource(page);

  await key(page, 'Shape').click();
  await expect(key(page, 'Deck')).toHaveText(/\d+/);
});

test('each section keeps its own scroll position', async ({ page }) => {
  await page.goto('/');
  await addFirstSource(page);

  const stage = page.locator('.stage');
  await stage.evaluate((node) => {
    node.scrollTop = 400;
  });
  const left = await stage.evaluate((node) => node.scrollTop);
  expect(left).toBeGreaterThan(0);

  await key(page, 'Sources').click();
  await expect(stage).toHaveJSProperty('scrollTop', 0);

  await key(page, 'Deck').click();
  await expect(stage).toHaveJSProperty('scrollTop', left);
});

test('the selected section survives a reload', async ({ page }) => {
  await page.goto('/');
  await key(page, 'Shape').click();
  await expect(key(page, 'Shape')).toHaveAttribute('aria-selected', 'true');

  await page.reload();

  await expect(key(page, 'Shape')).toHaveAttribute('aria-selected', 'true', { timeout: 60_000 });
});

test('a swipe left brings the next section in', async ({ page }) => {
  await page.goto('/');
  await swipe(page, -160);

  await expect(key(page, 'Block')).toHaveAttribute('aria-selected', 'true');
});

test('a swipe right brings the previous section back', async ({ page }) => {
  await page.goto('/');
  await key(page, 'Shape').click();
  await swipe(page, 160);

  await expect(key(page, 'Block')).toHaveAttribute('aria-selected', 'true');
});

test('a drift that is not a swipe changes nothing', async ({ page }) => {
  await page.goto('/');
  await swipe(page, -12);

  await expect(key(page, 'Sources')).toHaveAttribute('aria-selected', 'true');
});

test('nothing a hidden section holds can be reached by keyboard', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('slider', { name: 'Tracks' })).toHaveCount(0);
});

test('the section a key travels to is reachable by keyboard alone', async ({ page }) => {
  await page.goto('/');

  await key(page, 'Sources').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');

  await expect(page.getByRole('slider', { name: 'Tracks' })).toBeVisible();
});

test('pinch zoom is never taken away', async ({ page }) => {
  await page.goto('/');

  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewport ?? '').not.toMatch(/user-scalable=no|maximum-scale=1/);
});
