/**
 * The cover's colors, read from `tokens.css` rather than written here.
 *
 * A canvas takes a color string, so the drawing cannot say `var(--source-artist)` the way a
 * stylesheet can. This module is the one place that bridges the two, and it bridges by
 * **reading the token layer** — it names `--cover-ink`, never `oklch(...)`. §4.1's rule is
 * that nothing outside `tokens.css` holds a raw value, and nothing here does.
 *
 * **The cover always draws in one palette, in both themes.** It is a printed object, and it
 * ends up on Spotify where there is no theme at all — so a cover that changed color with the
 * app's theme would be one recipe with two fingerprints, and the shelf and the uploaded JPEG
 * would disagree. That palette is the light one: a bright sleeve reads on a dark shelf and on
 * Spotify's dark grid, and a dark one disappears into both.
 *
 * **This used to be done by parsing `light-dark()` and keeping the first half, and that never
 * worked.** A browser resolves `light-dark()` in a custom property at computed-value time, so
 * `getComputedStyle(root).getPropertyValue('--ink')` hands back one already-themed color —
 * `lab(89% …)` in the dark theme — with no pair left to choose from. The parse found nothing
 * to split, passed the value through, and the cover quietly followed the theme: black in the
 * dark, white in the light, and whichever one the person happened to be looking at got
 * uploaded to Spotify. The fix is a set of `--cover-*` tokens that hold no `light-dark()` at
 * all (§4.1's component tier), so there is nothing to resolve and nothing to get wrong.
 */

export type CoverPalette = {
  readonly ink: string;
  readonly ground: string;
  readonly accent: string;
  /** `--font-display`. The name on the cover is set in the app's own voice (§6.1). */
  readonly displayFont: string;
  /** Keyed by the **semantic** tone name, as `CoverBand.tone` holds it. */
  readonly tones: ReadonlyMap<string, string>;
};

/** The eight source tones, named as the registry names them. §12 */
const TONE_TOKENS = [
  '--source-artist',
  '--source-track',
  '--source-search',
  '--source-playlist',
  '--source-library',
  '--source-top',
  '--source-followed',
  '--source-new',
] as const;

/**
 * The cover token that stands in for a semantic one. The plan and the registry speak in
 * `--source-artist`, the cover draws in `--cover-source-artist`, and this is the whole of the
 * translation — one rule rather than a second table nobody remembers to extend (§12).
 */
export function coverTokenFor(semantic: string): string {
  return semantic.replace(/^--/, '--cover-');
}

function readToken(styles: CSSStyleDeclaration, token: string): string {
  return styles.getPropertyValue(token).trim();
}

/**
 * Null where the tokens cannot be read — a test environment with no layout engine, most of
 * all. Nothing invents a fallback color: §11.1's empty state is a designed absence, and a
 * cover drawn in a guessed palette would be worse than one that politely does not draw.
 */
export function readCoverPalette(root: Element): CoverPalette | null {
  const styles = getComputedStyle(root);
  const ink = readToken(styles, '--cover-ink');
  const ground = readToken(styles, '--cover-ground');
  const accent = readToken(styles, '--cover-accent');
  const displayFont = readToken(styles, '--font-display');
  if (ink.length === 0 || ground.length === 0 || accent.length === 0) return null;
  if (displayFont.length === 0) return null;

  const tones = new Map<string, string>();
  for (const token of TONE_TOKENS) {
    const value = readToken(styles, coverTokenFor(token));
    if (value.length === 0) return null;
    tones.set(token, value);
  }

  return { ink, ground, accent, displayFont, tones };
}
