/**
 * A seeded generator, written out in full so there is no dependency and no ambiguity
 * about which stream a seed produces.
 *
 * Spec §3.1: the engine never touches `Math.random`. A recipe plus a seed is a complete
 * description of a playlist, which is what makes share-by-URL a two-line feature (§6)
 * and what makes re-roll reproducible months later.
 */

import { RngMisuse } from './errors';

export type Rng = {
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** A new array, Fisher-Yates shuffled. The input is never mutated. */
  shuffle<T>(items: readonly T[]): T[];
  /** One item, chosen in proportion to its weight. */
  weightedPick<T>(items: readonly T[], weights: readonly number[]): T;
};

const UINT32 = 0x100000000;

/**
 * mulberry32. Thirty-two bits of state, a good enough distribution for choosing tracks,
 * and short enough to read in one sitting.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / UINT32;
  };
}

export function createRng(seed: number): Rng {
  if (!Number.isFinite(seed)) throw RngMisuse.invalidSeed(seed);
  const next = mulberry32(Math.trunc(seed));

  const int = (maxExclusive: number): number => {
    if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
      throw RngMisuse.invalidBound(maxExclusive);
    }
    return Math.floor(next() * maxExclusive);
  };

  const shuffle = <T>(items: readonly T[]): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1));
      const a = out[i];
      const b = out[j];
      if (a === undefined || b === undefined) continue;
      out[i] = b;
      out[j] = a;
    }
    return out;
  };

  const weightedPick = <T>(items: readonly T[], weights: readonly number[]): T => {
    if (items.length === 0) throw RngMisuse.emptyPool();
    if (items.length !== weights.length) {
      throw RngMisuse.weightMismatch(items.length, weights.length);
    }

    let total = 0;
    for (const weight of weights) {
      total += weight > 0 && Number.isFinite(weight) ? weight : 0;
    }

    // Every weight was zero or worse, so proportion means nothing. Pick uniformly
    // rather than refuse — a fully-suppressed pool is still a pool.
    if (total <= 0) {
      const fallback = items[int(items.length)];
      if (fallback === undefined) throw RngMisuse.emptyPool();
      return fallback;
    }

    let cursor = next() * total;
    for (let i = 0; i < items.length; i += 1) {
      const weight = weights[i] ?? 0;
      cursor -= weight > 0 && Number.isFinite(weight) ? weight : 0;
      if (cursor < 0) {
        const picked = items[i];
        if (picked !== undefined) return picked;
      }
    }

    // Floating-point drift can leave the cursor a hair above zero on the last step.
    const last = items[items.length - 1];
    if (last === undefined) throw RngMisuse.emptyPool();
    return last;
  };

  return { next, int, shuffle, weightedPick };
}

/**
 * A second stream from one seed. `build` gives selection and ordering different streams
 * so that changing the order strategy cannot quietly change which tracks were chosen.
 */
export function deriveSeed(seed: number, salt: number): number {
  const mixed =
    Math.imul(Math.trunc(seed) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 1, 0xc2b2ae35);
  return mixed >>> 0;
}
