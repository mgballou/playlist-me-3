import { describe, expect, it } from 'vitest';

import { RngMisuse, createRng, deriveSeed } from '../src/index';
import { captureError } from './fixtures/index';

const draw = (seed: number, count: number): number[] => {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => rng.next());
};

describe('createRng', () => {
  it('gives the same stream for the same seed', () => {
    expect(draw(7, 20)).toEqual(draw(7, 20));
  });

  it('gives a different stream for a different seed', () => {
    expect(draw(7, 20)).not.toEqual(draw(8, 20));
  });

  it('stays inside the unit interval', () => {
    expect(draw(99, 500).every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it('refuses a seed that is not finite', () => {
    expect(captureError(() => createRng(Number.NaN))).toBeInstanceOf(RngMisuse);
  });
});

describe('int', () => {
  it('stays below the bound', () => {
    const rng = createRng(3);
    const values = Array.from({ length: 400 }, () => rng.int(5));
    expect(values.every((value) => value >= 0 && value < 5)).toBe(true);
  });

  it('returns whole numbers', () => {
    const rng = createRng(3);
    const values = Array.from({ length: 100 }, () => rng.int(9));
    expect(values.every(Number.isInteger)).toBe(true);
  });

  it('eventually reaches every value in range', () => {
    const rng = createRng(11);
    const seen = new Set(Array.from({ length: 400 }, () => rng.int(4)));
    expect(seen.size).toBe(4);
  });

  it('refuses a bound of zero', () => {
    expect(captureError(() => createRng(1).int(0))).toBeInstanceOf(RngMisuse);
  });

  it('refuses a fractional bound', () => {
    expect(captureError(() => createRng(1).int(2.5))).toBeInstanceOf(RngMisuse);
  });
});

describe('shuffle', () => {
  const items = Array.from({ length: 30 }, (_, index) => index);

  it('is a permutation', () => {
    expect([...createRng(5).shuffle(items)].sort((a, b) => a - b)).toEqual(items);
  });

  it('leaves the input untouched', () => {
    const input = [...items];
    createRng(5).shuffle(input);
    expect(input).toEqual(items);
  });

  it('repeats for the same seed', () => {
    expect(createRng(5).shuffle(items)).toEqual(createRng(5).shuffle(items));
  });

  it('differs for a different seed', () => {
    expect(createRng(5).shuffle(items)).not.toEqual(createRng(6).shuffle(items));
  });

  it('handles an empty list', () => {
    expect(createRng(5).shuffle([])).toEqual([]);
  });

  it('handles a single item', () => {
    expect(createRng(5).shuffle(['only'])).toEqual(['only']);
  });
});

describe('weightedPick', () => {
  it('never picks a zero-weight item when another has weight', () => {
    const rng = createRng(21);
    const picks = Array.from({ length: 300 }, () => rng.weightedPick(['a', 'b'], [0, 1]));
    expect(new Set(picks)).toEqual(new Set(['b']));
  });

  it('follows the proportions', () => {
    const rng = createRng(4);
    const picks = Array.from({ length: 4000 }, () => rng.weightedPick(['a', 'b'], [9, 1]));
    const share = picks.filter((pick) => pick === 'a').length / picks.length;
    expect(share).toBeGreaterThan(0.85);
  });

  it('falls back to uniform when every weight is zero', () => {
    const rng = createRng(13);
    const picks = Array.from({ length: 200 }, () => rng.weightedPick(['a', 'b', 'c'], [0, 0, 0]));
    expect(new Set(picks).size).toBe(3);
  });

  it('refuses an empty list', () => {
    expect(captureError(() => createRng(1).weightedPick([], []))).toBeInstanceOf(RngMisuse);
  });

  it('refuses mismatched weights', () => {
    expect(captureError(() => createRng(1).weightedPick(['a', 'b'], [1]))).toBeInstanceOf(
      RngMisuse,
    );
  });

  it('ignores a negative weight', () => {
    const rng = createRng(2);
    const picks = Array.from({ length: 200 }, () => rng.weightedPick(['a', 'b'], [-5, 3]));
    expect(new Set(picks)).toEqual(new Set(['b']));
  });
});

describe('deriveSeed', () => {
  it('is deterministic', () => {
    expect(deriveSeed(42, 1)).toBe(deriveSeed(42, 1));
  });

  it('separates salts', () => {
    expect(deriveSeed(42, 1)).not.toBe(deriveSeed(42, 2));
  });

  it('separates seeds', () => {
    expect(deriveSeed(42, 1)).not.toBe(deriveSeed(43, 1));
  });

  it('returns a non-negative integer', () => {
    expect(Number.isInteger(deriveSeed(-9, 3)) && deriveSeed(-9, 3) >= 0).toBe(true);
  });
});
