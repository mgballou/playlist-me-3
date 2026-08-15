/**
 * The two dials, and the honesty rules that ride with them. ui-sensibility §12.1.
 *
 * These are the most-touched controls in the app (spec §2.4), so they are the ones where
 * overclaiming would do the most damage:
 *
 * - **Depth is estimated.** `popularity` was removed from the API in 2026-02, so track
 *   position within its album stands in for prominence. `approximation` is non-null here and
 *   the component renders it unconditionally. A test fails if it goes missing.
 * - **Familiarity is exact.** It is set membership in the person's own library, so it may be
 *   stated plainly — and stating it plainly is what makes the depth caveat believable.
 *
 * `valueText` gives `aria-valuetext` a position in words rather than a bare number (§13). A
 * screen reader saying "0.72" tells nobody anything; "mostly the obvious ones" does.
 */

import type { Dial, Shape } from '@pm/core';

export type DialName = 'familiarity' | 'depth';

export type DialDefinition = {
  readonly name: DialName;
  readonly label: string;
  /** The two ends, low first. Printed under the track, so the direction is never in doubt. */
  readonly lowLabel: string;
  readonly highLabel: string;
  /**
   * Set where the value is estimated rather than measured. Rendered always, never behind a
   * hover or a tooltip — §12.1 asks for it in the interface, not in a title attribute.
   */
  readonly approximation: string | null;
  /** Set where the value is exact, and may say so plainly. §12.1 */
  readonly exactness: string | null;
  readonly words: readonly [string, string, string, string, string];
};

export const DIAL_DEFINITIONS: Readonly<Record<DialName, DialDefinition>> = {
  familiarity: {
    name: 'familiarity',
    label: 'Familiar',
    lowLabel: 'Only what I do not know',
    highLabel: 'Only what I do',
    approximation: null,
    exactness:
      'Exact. Familiarity is whether a track is in your library, your top tracks or your recent plays.',
    words: [
      'only what I do not know',
      'mostly things I do not know',
      'no preference',
      'mostly things I know',
      'only what I know',
    ],
  },
  depth: {
    name: 'depth',
    label: 'Deep cuts',
    lowLabel: 'Deep cuts',
    highLabel: 'The obvious ones',
    // The wording the honesty test pins. Spec §3.5, §9.1: track position is a proxy for
    // prominence, and nothing in this app may imply it was measured.
    approximation:
      'An approximation, not a measurement. Spotify no longer publishes popularity, so this reads a track’s position on its album instead.',
    exactness: null,
    words: [
      'deep cuts only',
      'leaning toward deep cuts',
      'no preference',
      'leaning toward the obvious ones',
      'the obvious ones only',
    ],
  },
};

/** Keyboard steps, so the dial is reachable in sensible increments (§10, §13). */
export const DIAL_STEP = 0.05;
/**
 * Shift and an arrow, or a page key. A quarter of the sweep, which is exactly one word band
 * either way — so the larger step moves the announcement rather than only the number.
 */
export const DIAL_BIG_STEP = 0.25;
export const DIAL_MIN = 0;
export const DIAL_MAX = 1;

/**
 * Which of the five words a setting falls under. Five bands rather than a continuum,
 * because a screen reader announcing a new sentence every 0.05 is worse than useless.
 */
export function dialWords(definition: DialDefinition, value: number): string {
  const bands = definition.words.length;
  const index = Math.min(bands - 1, Math.max(0, Math.round(value * (bands - 1))));
  return definition.words[index] ?? definition.words[2];
}

/** `aria-valuetext`: the position in words, never just the number. §13 */
export function dialValueText(definition: DialDefinition, value: number): string {
  return `${definition.label}: ${dialWords(definition, value)}`;
}

export function dialValueOf(shape: Shape, name: DialName): Dial {
  return name === 'familiarity' ? shape.familiarity : shape.depth;
}
