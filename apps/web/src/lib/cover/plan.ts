/**
 * The cover is a fingerprint. ui-sensibility §11.1.
 *
 * A recipe's cover is **derived from the recipe**, deterministically — two recipes look
 * different because they *are* different, and the same recipe always draws the same cover. A
 * random pattern would be decoration; this is a reading of the recipe you can learn:
 *
 * ```
 * ┌────────────────────────────────┐
 * │████████│▒▒▒▒▒▒▒▒▒▒▒▒│░░░░░░░░░░│ ← one band per source, width by its share
 * │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ ← one ink bar per exclusion
 * │  LATE DUB,                     │ ← the name, display face, bottom-left
 * │  ──────●──   ─●───────         │ ← the two dials as notched rules
 * └────────────────────────────────┘
 * ```
 *
 * **Every mark means something.** Band width is a source's share of the pool. Bar count is
 * exclusion count. Notch position is a dial value. Nothing is added for texture.
 *
 * This module is the whole of the geometry, and it is pure: a `Recipe` in, numbers out. That
 * is what makes "deterministic for a given recipe, different across recipes" a plain
 * assertion rather than an image diff. Painting it is `draw.ts`, and painting adds no
 * decisions.
 */

import type { BuildReport, Recipe, SourceKind } from '@pm/core';

import { sourceDefinition } from '../registry/sources';

/** The drawing is authored in this square and scaled to whatever it is asked for. §11.1 */
export const COVER_SIDE = 640;

/** Its size on the shelf, and therefore the size it is designed to read at first. §11.1 */
export const COVER_SHELF_SIZE = 64;

export type CoverBand = {
  readonly sourceIndex: number;
  readonly kind: SourceKind;
  /** A semantic token name. The plan never holds a color. §4.1 */
  readonly tone: string;
  /** 0..1 across the square. */
  readonly start: number;
  readonly width: number;
};

export type CoverBar = {
  readonly exclusionIndex: number;
  /** 0..1 down the square. */
  readonly y: number;
  readonly height: number;
  /** How far across the square the bar strikes — wider where it removed more. */
  readonly width: number;
};

export type CoverNotch = {
  readonly label: string;
  /** 0..1 along the rule. */
  readonly position: number;
};

export type CoverPlan = {
  /** Empty only when the recipe has no sources, which draws the designed empty state. §11.1 */
  readonly bands: readonly CoverBand[];
  readonly bars: readonly CoverBar[];
  readonly notches: readonly [CoverNotch, CoverNotch];
  /** The name, broken to fit, in the display face. Never more than three lines. */
  readonly nameLines: readonly string[];
  readonly empty: boolean;
};

/**
 * Where the marks sit, as fractions of the square. The bars sit **inside** the band block, so
 * an exclusion is drawn struck across the bands it removed from (§11.1) rather than listed
 * underneath them. A bar below the bands would be a legend; a bar across them is the picture.
 */
const BANDS_TOP = 0;
const BANDS_BOTTOM = 0.56;
const BARS_TOP = 0.26;
const BARS_BOTTOM = 0.54;
const MAX_BARS = 8;
const MAX_NAME_LINES = 3;
const NAME_LINE_CHARS = 18;

/**
 * A source's share of the square. After a build we know what each source actually
 * contributed, so the cover reads the recipe *as it ran*. Before one, every source gets an
 * equal band — which is the honest picture of a recipe nobody has run yet, rather than a
 * guess dressed up as a measurement.
 */
function shares(recipe: Recipe, report: BuildReport | null): readonly number[] {
  const count = recipe.sources.length;
  if (count === 0) return [];

  const pooled = recipe.sources.map((_, index) => {
    const found = report?.sourceContributions.find((entry) => entry.sourceIndex === index);
    return found === undefined ? 0 : found.pooled;
  });

  const total = pooled.reduce((sum, value) => sum + value, 0);
  if (total === 0) return recipe.sources.map(() => 1 / count);

  // A source that contributed nothing still gets a hairline, because "this source is on the
  // recipe and produced nothing" is exactly the thing worth being able to see (§2.3).
  const floor = 0.02;
  const raw = pooled.map((value) => Math.max(floor, value / total));
  const scale = raw.reduce((sum, value) => sum + value, 0);
  return raw.map((value) => value / scale);
}

/** Greedy wrap on words, then a hard cut, so a 90-character name cannot run off the art. */
export function wrapName(name: string, lines = MAX_NAME_LINES): readonly string[] {
  const trimmed = name.trim();
  if (trimmed.length === 0) return [];

  const out: string[] = [];
  let current = '';

  for (const word of trimmed.split(/\s+/)) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (candidate.length <= NAME_LINE_CHARS) {
      current = candidate;
      continue;
    }
    if (current.length > 0) out.push(current);
    current = word.slice(0, NAME_LINE_CHARS);
    if (out.length === lines) break;
  }

  if (current.length > 0 && out.length < lines) out.push(current);
  return out.slice(0, lines);
}

export function coverPlan(recipe: Recipe, report: BuildReport | null = null): CoverPlan {
  const widths = shares(recipe, report);

  let cursor = 0;
  const bands = recipe.sources.map((source, sourceIndex) => {
    const width = widths[sourceIndex] ?? 0;
    const band: CoverBand = {
      sourceIndex,
      kind: source.kind,
      tone: sourceDefinition(source.kind).tone,
      start: BANDS_TOP + cursor,
      width,
    };
    cursor += width;
    return band;
  });

  const shown = recipe.exclusions.slice(0, MAX_BARS);
  const removals = report?.reject.removals ?? [];
  const heaviest = Math.max(1, ...removals.map((removal) => removal.removed));
  const gap = shown.length === 0 ? 0 : (BARS_BOTTOM - BARS_TOP) / shown.length;

  const bars = shown.map((_, exclusionIndex) => {
    const removed = removals.find((entry) => entry.exclusionIndex === exclusionIndex)?.removed ?? 0;
    return {
      exclusionIndex,
      y: BARS_TOP + gap * exclusionIndex,
      height: gap * 0.62,
      // A bar that removed nothing is still drawn, at its minimum: the exclusion is on the
      // recipe, and a mark that vanished would be the cover lying about the recipe.
      width: 0.28 + 0.72 * (removed / heaviest),
    };
  });

  return {
    bands,
    bars,
    notches: [
      { label: 'depth', position: recipe.shape.depth },
      { label: 'familiar', position: recipe.shape.familiarity },
    ],
    nameLines: wrapName(recipe.name),
    empty: recipe.sources.length === 0,
  };
}

export const COVER_GEOMETRY = {
  bandsTop: BANDS_TOP,
  bandsBottom: BANDS_BOTTOM,
  barsTop: BARS_TOP,
  barsBottom: BARS_BOTTOM,
} as const;
