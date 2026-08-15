/**
 * The cover's colors, read from `tokens.css` rather than written here.
 *
 * A canvas takes a color string, so the drawing cannot say `var(--source-artist)` the way a
 * stylesheet can. This module is the one place that bridges the two, and it bridges by
 * **reading the semantic layer** — it names `--source-artist`, never `oklch(...)`. §4.1's
 * rule is that nothing outside `tokens.css` names a primitive or holds a raw value, and
 * nothing here does.
 *
 * **The cover always draws in the light palette, in both themes.** It is a printed object,
 * and it ends up on Spotify where there is no theme at all — so a cover that changed color
 * with the app's theme would be one recipe with two fingerprints, and the shelf and the
 * uploaded JPEG would disagree. This is a decision, not an oversight.
 *
 * Reading it takes one wrinkle worth naming: an unregistered custom property computes to its
 * substituted token stream, so `--ink` comes back as the literal `light-dark(a, b)` rather
 * than as one of the two. Picking the light side is therefore a parse, done once, here.
 */

const LIGHT_DARK = /^light-dark\(\s*(.+?)\s*,\s*(.+?)\s*\)$/s;

export type CoverPalette = {
  readonly ink: string;
  readonly ground: string;
  readonly accent: string;
  /** `--font-display`. The name on the cover is set in the app's own voice (§6.1). */
  readonly displayFont: string;
  /** Keyed by semantic token name, as `CoverBand.tone` holds it. */
  readonly tones: ReadonlyMap<string, string>;
};

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

/** The light side of a `light-dark()` pair, or the value itself when it is not one. */
export function lightSideOf(value: string): string {
  const trimmed = value.trim();
  const pair = LIGHT_DARK.exec(trimmed);
  return pair?.[1] === undefined ? trimmed : pair[1].trim();
}

function readToken(styles: CSSStyleDeclaration, token: string): string {
  return lightSideOf(styles.getPropertyValue(token));
}

/**
 * Null where the tokens cannot be read — a test environment with no layout engine, most of
 * all. Nothing invents a fallback color: §11.1's empty state is a designed absence, and a
 * cover drawn in a guessed palette would be worse than one that politely does not draw.
 */
export function readCoverPalette(root: Element): CoverPalette | null {
  const styles = getComputedStyle(root);
  const ink = readToken(styles, '--ink');
  const ground = readToken(styles, '--surface-neutral');
  const accent = readToken(styles, '--accent');
  const displayFont = readToken(styles, '--font-display');
  if (ink.length === 0 || ground.length === 0 || accent.length === 0) return null;
  if (displayFont.length === 0) return null;

  const tones = new Map<string, string>();
  for (const token of TONE_TOKENS) {
    const value = readToken(styles, token);
    if (value.length === 0) return null;
    tones.set(token, value);
  }

  return { ink, ground, accent, displayFont, tones };
}
