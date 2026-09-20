/**
 * oklch → sRGB, and the WCAG contrast ratio between two of them.
 *
 * This exists so `tokens.test.ts` can recompute every contrast ratio from the token values
 * themselves. A ratio asserted against a number somebody typed once is a test of the typing.
 *
 * Ported from `character-bible/test/oklch.js`. Stdlib only, and deliberately so: a color
 * library here would be a dependency the assertion does not need and a second opinion about
 * what the numbers are.
 */

export interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
  readonly alpha: number;
}

export interface Srgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** A color already composited down to sRGB, so it carries no hue to move. */
export interface Composited {
  readonly srgb: Srgb;
}

export type Measurable = Oklch | Composited;

const isComposited = (x: Measurable): x is Composited => 'srgb' in x;

/** `oklch(62% 0.155 52)` or `oklch(62% 0.155 52 / 0.12)` → `{ l, c, h, alpha }`. */
export function parseOklch(text: string | undefined): Oklch | null {
  if (text === undefined) return null;
  const m = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/.exec(
    String(text).trim(),
  );
  if (!m) return null;
  const [, l, c, h, alpha] = m;
  return {
    l: Number(l) / 100,
    c: Number(c),
    h: Number(h),
    alpha: alpha === undefined ? 1 : Number(alpha),
  };
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

interface LinearRgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Linear-light sRGB, unclamped, so out-of-gamut shows up as a value past 1. */
export function oklchToLinearRgb({ l, c, h }: Oklch): LinearRgb {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const L = l_ * l_ * l_;
  const M = m_ * m_ * m_;
  const S = s_ * s_ * s_;

  return {
    r: 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    g: -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    b: -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  };
}

const encode = (x: number): number =>
  x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(clamp01(x), 1 / 2.4) - 0.055;

const toBytes = (lin: LinearRgb): Srgb => ({
  r: Math.round(clamp01(encode(lin.r)) * 255),
  g: Math.round(clamp01(encode(lin.g)) * 255),
  b: Math.round(clamp01(encode(lin.b)) * 255),
});

/** 0–255 per channel, clamped into gamut. */
export function oklchToSrgb(color: Oklch): Srgb {
  return toBytes(oklchToLinearRgb(color));
}

/** True when any channel falls outside sRGB before clamping. */
export function outOfGamut(color: Oklch): boolean {
  const { r, g, b } = oklchToLinearRgb(color);
  const slack = 1e-4;
  return [r, g, b].some((x) => x < -slack || x > 1 + slack);
}

const luminanceChannel = (v: number): number => {
  const x = v / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
};

/**
 * A token carrying an alpha is a wash over a ground, not a color. Composite it before
 * measuring, or every soft token reports the contrast of the tone it was derived from rather
 * than the one that reaches the eye.
 */
export function over(color: Oklch, ground: Oklch): Measurable {
  if (color.alpha === 1) return color;
  const top = oklchToLinearRgb(color);
  const bottom = oklchToLinearRgb(ground);
  const a = color.alpha;
  return {
    srgb: toBytes({
      r: top.r * a + bottom.r * (1 - a),
      g: top.g * a + bottom.g * (1 - a),
      b: top.b * a + bottom.b * (1 - a),
    }),
  };
}

const luminance = (x: Measurable): number => {
  const { r, g, b } = isComposited(x) ? x.srgb : oklchToSrgb(x);
  return 0.2126 * luminanceChannel(r) + 0.7152 * luminanceChannel(g) + 0.0722 * luminanceChannel(b);
};

export function relativeLuminance(color: Oklch): number {
  return luminance(color);
}

/** WCAG 2.2 contrast ratio, 1 to 21. */
export function contrast(a: Measurable, b: Measurable): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Every `--name: value;` declaration inside one block of a stylesheet, keyed by name. `start`
 * is a string that opens the block; the block ends at its matching brace.
 */
export function tokenBlock(css: string, start: string): Map<string, string> {
  const at = css.indexOf(start);
  if (at === -1) throw new Error(`no block opening with ${JSON.stringify(start)}`);
  let depth = 0;
  let i = at + start.length - 1;
  const open = i;
  for (; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const body = css.slice(open, i);
  const out = new Map<string, string>();
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    const [, name, value] = m;
    if (name !== undefined && value !== undefined) out.set(name, value.trim());
  }
  return out;
}
