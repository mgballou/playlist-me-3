import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/**
 * The reduced-motion branch, rendered.
 *
 * ui-sensibility §8 says reduced motion is **designed, not stripped** — nothing visible under
 * normal motion may go missing. The obvious implementation collapses every duration to 1ms,
 * which is exactly the strip the rule forbids: a 1ms cross-fade is not a cross-fade. That bug
 * shipped in the first draft of `tokens.css` and this is the test that would have caught it.
 *
 * Unit tests can only assert this at the source level. These read what a browser computed.
 */

const MOTION_TOKENS = [
  '--motion-scale',
  '--duration-fast',
  '--duration-base',
  '--duration-slow',
] as const;

type MotionTokens = Record<(typeof MOTION_TOKENS)[number], string>;

async function readMotion(page: Page): Promise<MotionTokens> {
  return page.evaluate((tokens) => {
    const style = getComputedStyle(document.documentElement);
    const read = (token: string) => style.getPropertyValue(token).trim();
    return Object.fromEntries(tokens.map((token) => [token, read(token)])) as Record<
      string,
      string
    >;
  }, MOTION_TOKENS) as Promise<MotionTokens>;
}

/**
 * The production build minifies `180ms` to `.18s`, so a duration arrives in either unit.
 * Parsing one and not the other reads a real duration as a near-zero number.
 */
function durationMs(value: string): number {
  const match = /^([\d.]+)(ms|s)$/.exec(value);
  if (match === null || match[1] === undefined) return Number.NaN;
  const magnitude = Number.parseFloat(match[1]);
  return match[2] === 's' ? magnitude * 1000 : magnitude;
}

test('movement is on when nothing is asked for', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');

  const motion = await readMotion(page);
  expect(motion['--motion-scale']).toBe('1');
});

test('movement switches off when reduced motion is asked for', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const motion = await readMotion(page);
  expect(motion['--motion-scale']).toBe('0');
});

test('durations stay real under reduced motion, so a cross-fade is still a cross-fade', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const motion = await readMotion(page);
  const durations = [
    durationMs(motion['--duration-fast']),
    durationMs(motion['--duration-base']),
    durationMs(motion['--duration-slow']),
  ];

  expect(Math.min(...durations)).toBeGreaterThan(10);
});

test('reduced motion is quicker than normal motion without being instant', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const normal = durationMs((await readMotion(page))['--duration-base']);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = durationMs((await readMotion(page))['--duration-base']);

  expect(reduced).toBeLessThan(normal);
});
