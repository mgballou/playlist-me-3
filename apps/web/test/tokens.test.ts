// @vitest-environment node
// Reads tokens.css off disk, so it wants a real file URL. jsdom does not give one, and
// Vite's CSS plugin swallows `?raw` for stylesheets.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(
  fileURLToPath(new URL('../src/styles/tokens.css', import.meta.url)),
  'utf8',
);

/**
 * Tokens that resolve to one value in both themes, on purpose. Anything else missing a
 * `light-dark()` pair is a token defined for one theme and forgotten for the other.
 *
 * `--accent-ink` is the interesting one: the accent is yellow and carries ink in both
 * themes, so black-on-yellow holds light and dark alike. See ui-sensibility §4.2, §5.2.
 */
const INTENTIONALLY_THEME_INVARIANT = new Set(['--accent-ink']);

/** Semantic color tokens, which are the ones a theme can half-declare. */
const SEMANTIC_COLOR_TOKENS = [
  '--ground',
  '--surface',
  '--surface-raised',
  '--surface-well',
  '--surface-neutral',
  '--ink',
  '--ink-muted',
  '--line',
  '--accent',
  '--accent-line',
  '--accent-ink',
  '--danger',
  '--danger-ink',
  '--source-artist',
  '--source-search',
  '--source-playlist',
  '--source-library',
  '--source-top',
  '--source-followed',
  '--source-new',
  '--source-track',
] as const;

function declarationOf(token: string): string {
  const match = new RegExp(`^\\s*${token}:\\s*([^;]+);`, 'm').exec(css);
  if (match === null || match[1] === undefined) {
    throw new Error(`token ${token} is not declared in tokens.css`);
  }
  return match[1].trim();
}

/** Resolve a chain of `var(--x)` references down to a literal. */
function resolve(value: string): string {
  let current = value;
  for (let hop = 0; hop < 10; hop += 1) {
    const reference = /^var\((--[\w-]+)\)$/.exec(current.trim());
    if (reference === null || reference[1] === undefined) return current.trim();
    current = declarationOf(reference[1]);
  }
  throw new Error(`var() chain did not terminate for ${value}`);
}

type Rgb = { readonly r: number; readonly g: number; readonly b: number };

function parseOklch(value: string): Rgb {
  const match = /oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)\s*\)/.exec(value);
  if (match === null || !match[1] || !match[2] || !match[3]) {
    throw new Error(`not an oklch color: ${value}`);
  }
  const lightness = value.includes('%') ? Number(match[1]) / 100 : Number(match[1]);
  const chroma = Number(match[2]);
  const hue = (Number(match[3]) * Math.PI) / 180;

  const a = chroma * Math.cos(hue);
  const bComponent = chroma * Math.sin(hue);

  const lCube = lightness + 0.3963377774 * a + 0.2158037573 * bComponent;
  const mCube = lightness - 0.1055613458 * a - 0.0638541728 * bComponent;
  const sCube = lightness - 0.0894841775 * a - 1.291485548 * bComponent;

  const l = lCube ** 3;
  const m = mCube ** 3;
  const s = sCube ** 3;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

/** WCAG relative luminance, computed on linear-light sRGB. */
function luminance(color: Rgb): number {
  const clamp = (channel: number): number => Math.min(1, Math.max(0, channel));
  return 0.2126 * clamp(color.r) + 0.7152 * clamp(color.g) + 0.0722 * clamp(color.b);
}

function contrast(foreground: string, background: string): number {
  const a = luminance(parseOklch(foreground));
  const b = luminance(parseOklch(background));
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

type ThemePair = { readonly light: string; readonly dark: string };

function themeValues(token: string): ThemePair {
  const declaration = resolve(declarationOf(token));
  const pair = /^light-dark\(([^,]+),(.+)\)$/s.exec(declaration);
  if (pair === null || pair[1] === undefined || pair[2] === undefined) {
    return { light: resolve(declaration), dark: resolve(declaration) };
  }
  return { light: resolve(pair[1]), dark: resolve(pair[2]) };
}

describe('theme parity', () => {
  it.each(SEMANTIC_COLOR_TOKENS)('%s is declared', (token) => {
    expect(() => declarationOf(token)).not.toThrow();
  });

  it.each(SEMANTIC_COLOR_TOKENS.filter((t) => !INTENTIONALLY_THEME_INVARIANT.has(t)))(
    '%s declares both themes',
    (token) => {
      const values = themeValues(token);
      expect(values.light).not.toBe(values.dark);
    },
  );

  it.each([...INTENTIONALLY_THEME_INVARIANT])('%s is theme-invariant on purpose', (token) => {
    const values = themeValues(token);
    expect(values.light).toBe(values.dark);
  });

  it.each(SEMANTIC_COLOR_TOKENS)('%s resolves to a parseable color in both themes', (token) => {
    const values = themeValues(token);
    expect(() => [parseOklch(values.light), parseOklch(values.dark)]).not.toThrow();
  });
});

describe('contrast', () => {
  const AA_BODY = 4.5;
  const AA_LARGE = 3;

  it.each(['light', 'dark'] as const)('ink on ground clears AA body text in %s', (theme) => {
    const ink = themeValues('--ink')[theme];
    const ground = themeValues('--ground')[theme];
    expect(contrast(ink, ground)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it.each(['light', 'dark'] as const)('ink on surface clears AA body text in %s', (theme) => {
    const ink = themeValues('--ink')[theme];
    const surface = themeValues('--surface')[theme];
    expect(contrast(ink, surface)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it.each(['light', 'dark'] as const)('muted ink on ground clears AA body text in %s', (theme) => {
    const muted = themeValues('--ink-muted')[theme];
    const ground = themeValues('--ground')[theme];
    expect(contrast(muted, ground)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it.each(['light', 'dark'] as const)('the accent carries its ink in %s', (theme) => {
    const accentInk = themeValues('--accent-ink')[theme];
    const accent = themeValues('--accent')[theme];
    expect(contrast(accentInk, accent)).toBeGreaterThanOrEqual(AA_BODY);
  });

  /**
   * The accent is a light yellow slab in *both* themes, so it separates from its ground by a
   * different means in each, and neither means works in both:
   *
   *   light — yellow on paper is 1.38:1. The ink edge does the separating (17:1).
   *   dark  — yellow on slate is 11.7:1. The fill does it; the ink edge is inner detail.
   *
   * So the invariant is not "the fill reads" and not "the edge reads" — it is that an accent
   * control is told apart from its ground by *at least one of them*. That is what WCAG 1.4.11
   * non-text contrast actually asks for, and asserting either one alone fails a theme.
   */
  it.each(['light', 'dark'] as const)(
    'an accent control separates from the ground in %s',
    (theme) => {
      const accent = themeValues('--accent')[theme];
      const edge = themeValues('--accent-ink')[theme];
      const ground = themeValues('--ground')[theme];
      const strongest = Math.max(contrast(accent, ground), contrast(edge, ground));
      expect(strongest).toBeGreaterThanOrEqual(AA_LARGE);
    },
  );

  it.each(['light', 'dark'] as const)(
    'the accent edge reads against its own fill in %s',
    (theme) => {
      const edge = themeValues('--accent-ink')[theme];
      const accent = themeValues('--accent')[theme];
      expect(contrast(edge, accent)).toBeGreaterThanOrEqual(AA_LARGE);
    },
  );

  it.each(['light', 'dark'] as const)('danger carries its ink in %s', (theme) => {
    const danger = themeValues('--danger')[theme];
    const dangerInk = themeValues('--danger-ink')[theme];
    expect(contrast(dangerInk, danger)).toBeGreaterThanOrEqual(AA_BODY);
  });
});

describe('source tones', () => {
  const SOURCE_TOKENS = SEMANTIC_COLOR_TOKENS.filter((t) => t.startsWith('--source-'));
  const ACCENT_HUE = 95;
  const MIN_SEPARATION = 45;

  function hueOf(value: string): number {
    const match = /oklch\(\s*[\d.]+%?\s+[\d.]+\s+([\d.]+)\s*\)/.exec(value);
    if (match === null || match[1] === undefined) throw new Error(`no hue in ${value}`);
    return Number(match[1]);
  }

  /** Shortest arc between two hues, in degrees. */
  function separation(hue: number): number {
    return Math.abs(((hue - ACCENT_HUE + 540) % 360) - 180);
  }

  it.each(SOURCE_TOKENS)('%s sits clear of the accent hue in both themes', (token) => {
    const values = themeValues(token);
    const closest = Math.min(separation(hueOf(values.light)), separation(hueOf(values.dark)));
    expect(closest).toBeGreaterThanOrEqual(MIN_SEPARATION);
  });

  it.each(['light', 'dark'] as const)('every source tone is distinct in %s', (theme) => {
    const hues = SOURCE_TOKENS.map((token) => hueOf(themeValues(token)[theme]));
    expect(new Set(hues).size).toBe(SOURCE_TOKENS.length);
  });
});
