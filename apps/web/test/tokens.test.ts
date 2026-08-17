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
const INTENTIONALLY_THEME_INVARIANT = new Set(['--accent-ink', '--danger-ink']);

/** Semantic color tokens, which are the ones a theme can half-declare. */
const SEMANTIC_COLOR_TOKENS = [
  '--ground',
  '--surface',
  '--surface-raised',
  '--surface-top',
  '--surface-well',
  '--surface-neutral',
  '--ink',
  '--ink-muted',
  '--line',
  '--accent',
  '--accent-bright',
  '--accent-ink',
  '--led',
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

  it.each(['light', 'dark'] as const)(
    'an accent control reads against the ground in %s',
    (theme) => {
      const accent = themeValues('--accent')[theme];
      const ground = themeValues('--ground')[theme];
      expect(contrast(accent, ground)).toBeGreaterThanOrEqual(AA_LARGE);
    },
  );

  /**
   * The inverse assertion, and the one that would have caught the direction breaking.
   *
   * `--line` is a **seam**, not a border: it suggests where a panel ends and should be nearly
   * invisible until looked for. The previous token set made it near-white on a dark ground —
   * an 11:1 outline around every module. Separation in this direction comes from panel value
   * and from light (§5), so a seam that reads as an outline is a defect, and the test is that
   * it stays *below* the threshold rather than above one.
   */
  it.each(['light', 'dark'] as const)('the seam stays quiet against its panel in %s', (theme) => {
    const line = themeValues('--line')[theme];
    const surface = themeValues('--surface')[theme];
    expect(contrast(line, surface)).toBeLessThan(AA_LARGE);
  });

  it.each(['light', 'dark'] as const)(
    'the panel value steps are distinguishable in %s',
    (theme) => {
      const well = themeValues('--surface-well')[theme];
      const top = themeValues('--surface-top')[theme];
      expect(contrast(top, well)).toBeGreaterThan(1.2);
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
  const ACCENT_HUE = 25;
  const LED_HUE = 73;
  const MIN_SEPARATION = 45;
  const MIN_LED_SEPARATION = 35;

  function hueOf(value: string): number {
    const match = /oklch\(\s*[\d.]+%?\s+[\d.]+\s+([\d.]+)\s*\)/.exec(value);
    if (match === null || match[1] === undefined) throw new Error(`no hue in ${value}`);
    return Number(match[1]);
  }

  /** Shortest arc between two hues, in degrees. */
  function separation(hue: number, from: number): number {
    return Math.abs(((hue - from + 540) % 360) - 180);
  }

  it.each(SOURCE_TOKENS)('%s sits clear of the accent hue in both themes', (token) => {
    const values = themeValues(token);
    const closest = Math.min(
      separation(hueOf(values.light), ACCENT_HUE),
      separation(hueOf(values.dark), ACCENT_HUE),
    );
    expect(closest).toBeGreaterThanOrEqual(MIN_SEPARATION);
  });

  /** A chip must be mistakable for neither the colour that acts nor the one that reports. */
  it.each(SOURCE_TOKENS)('%s sits clear of the status LED hue in both themes', (token) => {
    const values = themeValues(token);
    const closest = Math.min(
      separation(hueOf(values.light), LED_HUE),
      separation(hueOf(values.dark), LED_HUE),
    );
    expect(closest).toBeGreaterThanOrEqual(MIN_LED_SEPARATION);
  });

  /**
   * Amber reports, red acts, and the two must not be confusable. Separation is asserted on
   * hue rather than on luminance: a console's meters and its record light are told apart by
   * colour and position, not by brightness. §5's "colour is never the only carrier" is what
   * keeps this honest for anyone who cannot separate the two hues — every LED state also
   * carries a word or a glyph.
   */
  it.each(['light', 'dark'] as const)('the status LED is not the accent hue in %s', (theme) => {
    const led = hueOf(themeValues('--led')[theme]);
    expect(separation(led, ACCENT_HUE)).toBeGreaterThanOrEqual(MIN_LED_SEPARATION);
  });

  it.each(['light', 'dark'] as const)('every source tone is distinct in %s', (theme) => {
    const hues = SOURCE_TOKENS.map((token) => hueOf(themeValues(token)[theme]));
    expect(new Set(hues).size).toBe(SOURCE_TOKENS.length);
  });
});

/**
 * §11.1: the cover is a printed object and holds **one palette in both themes**, so that one
 * recipe is one fingerprint on the shelf, in the save preview and in the JPEG that goes up to
 * Spotify.
 *
 * The assertion is that these tokens carry no `light-dark()` at all, and it is the assertion
 * that would have caught the bug they exist to fix: a browser resolves `light-dark()` in a
 * custom property at computed-value time, so a cover reading the semantic layer through
 * `getComputedStyle` got one already-themed color and followed the theme — while the code
 * that was meant to pin it looked, and tested, as though it worked.
 */
describe('the cover palette is theme-invariant by construction', () => {
  const declarations = [...css.matchAll(/^\s*(--cover-[\w-]+):\s*([^;]+);/gm)];

  it('declares a cover palette at all', () => {
    expect(declarations.length).toBeGreaterThan(0);
  });

  it.each(declarations.map((match) => [match[1] ?? '', match[2] ?? '']))(
    '%s holds no light-dark pair to resolve',
    (_token, value) => {
      expect(value).not.toContain('light-dark');
    },
  );

  it.each(['--cover-ink', '--cover-ground', '--cover-accent'])(
    '%s resolves to a color',
    (token) => {
      expect(() => parseOklch(resolve(declarationOf(token)))).not.toThrow();
    },
  );

  it('covers every source tone the registry can hand it', () => {
    const tones = declarations.filter((match) => (match[1] ?? '').startsWith('--cover-source-'));
    expect(tones).toHaveLength(
      SEMANTIC_COLOR_TOKENS.filter((t) => t.startsWith('--source-')).length,
    );
  });
});

/**
 * ui-sensibility §5.2 prints the palette as a table and says of it: "`tokens.css` is the source
 * of truth. This table follows it, never the reverse." Nothing enforced that, and it drifted —
 * seven rows went stale the moment the light stack was lifted, which is the same silent-drift
 * failure as a screenshot nobody can re-take.
 *
 * So the sentence is a test now. The doc writes values in a shorthand a designer reads
 * (`oklch(83% .008 87)`), tokens.css writes them in full (`oklch(83% 0.008 87)`), and comparing
 * numbers rather than strings is what lets both keep their own spelling.
 */
describe('the palette table in ui-sensibility follows tokens.css', () => {
  const doc = readFileSync(
    fileURLToPath(new URL('../../../docs/ui-sensibility.md', import.meta.url)),
    'utf8',
  );

  const ROW = /^\|\s*`(--[\w-]+)`\s*\|\s*`(oklch\([^`]+\))`\s*\|\s*`(oklch\([^`]+\))`\s*\|/gm;
  const rows = [...doc.matchAll(ROW)].map((match) => ({
    token: match[1] ?? '',
    light: match[2] ?? '',
    dark: match[3] ?? '',
  }));

  /** The three oklch components as numbers, so `.008` and `0.008` compare equal. */
  function components(value: string): readonly number[] {
    const match = /oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)\s*\)/.exec(value);
    if (match === null) throw new Error(`not an oklch color: ${value}`);
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  }

  it('finds the table at all, so a rename cannot make this vacuous', () => {
    expect(rows).toHaveLength(12);
  });

  it.each(rows.map((row) => [row.token, row.light, row.dark] as const))(
    '%s matches its declaration in both themes',
    (token, light, dark) => {
      const declared = themeValues(token);
      expect([components(light), components(dark)]).toEqual([
        components(declared.light),
        components(declared.dark),
      ]);
    },
  );
});

/**
 * The source-tone table in §5.1 is checked by **value rather than by name**. Its rows are keyed
 * by source kind (`newReleases`), not by token (`--source-new`), and a hand-written map from one
 * to the other would just be a second thing to keep in sync — a drift test that itself drifts.
 * Asking instead that every printed pair is a pair the stylesheet actually declares needs no map
 * and still fails the moment a value is edited in one place and not the other.
 */
describe('the source-tone table in ui-sensibility follows tokens.css', () => {
  const doc = readFileSync(
    fileURLToPath(new URL('../../../docs/ui-sensibility.md', import.meta.url)),
    'utf8',
  );

  const ROW =
    /^\|\s*`(\w+)`\s*\|\s*(\d+)\s*\|\s*`(oklch\([^`]+\))`\s*\|\s*`(oklch\([^`]+\))`\s*\|/gm;
  const rows = [...doc.matchAll(ROW)].map((match) => ({
    kind: match[1] ?? '',
    hue: Number(match[2]),
    light: match[3] ?? '',
    dark: match[4] ?? '',
  }));

  const SOURCE_TOKENS = SEMANTIC_COLOR_TOKENS.filter((token) => token.startsWith('--source-'));

  function components(value: string): string {
    const match = /oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)\s*\)/.exec(value);
    if (match === null) throw new Error(`not an oklch color: ${value}`);
    return [Number(match[1]), Number(match[2]), Number(match[3])].join(' ');
  }

  const declared = new Set(
    SOURCE_TOKENS.map((token) => {
      const pair = themeValues(token);
      return `${components(pair.light)} / ${components(pair.dark)}`;
    }),
  );

  it('prints one row per source token', () => {
    expect(rows).toHaveLength(SOURCE_TOKENS.length);
  });

  it.each(rows.map((row) => [row.kind, row.light, row.dark] as const))(
    '%s is a pair tokens.css actually declares',
    (_kind, light, dark) => {
      expect(declared).toContain(`${components(light)} / ${components(dark)}`);
    },
  );

  it.each(rows.map((row) => [row.kind, row.hue, row.light] as const))(
    '%s prints the hue its own colour uses',
    (_kind, hue, light) => {
      expect(Number(components(light).split(' ')[2])).toBe(hue);
    },
  );
});
