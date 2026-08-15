import { describe, expect, it } from 'vitest';

import type { Lock, Track } from '../src/index';
import { dial, score, select, trackId } from '../src/index';
import {
  artistAt,
  makeContext,
  makePool,
  makeShape,
  makeSingleArtistPool,
  makeTrack,
} from './fixtures/index';

const context = makeContext();
const pool = makePool();

const scoreOf = (tracks: readonly Track[], familiarity = 0.5, depth = 0.5) =>
  score({
    tracks,
    shape: makeShape({ familiarity: dial(familiarity), depth: dial(depth) }),
    context,
  });

const ids = (tracks: readonly Track[]) => tracks.map((track) => track.id);

const countsByArtist = (tracks: readonly Track[]) => {
  const counts = new Map<string, number>();
  for (const track of tracks) {
    for (const artist of track.artists) {
      counts.set(artist.id, (counts.get(artist.id) ?? 0) + 1);
    }
  }
  return counts;
};

describe('count target', () => {
  it('chooses exactly the requested number', () => {
    const { chosen } = select({
      scored: scoreOf(pool),
      shape: makeShape({ target: { kind: 'count', count: 12 } }),
      locks: [],
      seed: 1,
    });
    expect(chosen.length).toBe(12);
  });

  it('never repeats a track', () => {
    const { chosen } = select({
      scored: scoreOf(pool),
      shape: makeShape({ target: { kind: 'count', count: 20 }, maxPerArtist: 10 }),
      locks: [],
      seed: 1,
    });
    expect(new Set(ids(chosen)).size).toBe(chosen.length);
  });

  it('reports the target as reached', () => {
    const { report } = select({
      scored: scoreOf(pool),
      shape: makeShape({ target: { kind: 'count', count: 12 } }),
      locks: [],
      seed: 1,
    });
    expect(report.canReachTarget).toBe(true);
  });

  it('leaves no shortfall when the target is reached', () => {
    const { report } = select({
      scored: scoreOf(pool),
      shape: makeShape({ target: { kind: 'count', count: 12 } }),
      locks: [],
      seed: 1,
    });
    expect(report.shortfall).toBeNull();
  });
});

describe('duration target', () => {
  const shape = makeShape({ target: { kind: 'duration', ms: 1_800_000 }, maxPerArtist: 10 });

  it('reaches the target', () => {
    const { report } = select({ scored: scoreOf(pool), shape, locks: [], seed: 3 });
    expect(report.totalDurationMs).toBeGreaterThanOrEqual(1_800_000);
  });

  it('overshoots by less than the longest track it chose', () => {
    const { chosen, report } = select({ scored: scoreOf(pool), shape, locks: [], seed: 3 });
    const longest = Math.max(...chosen.map((track) => track.durationMs));
    expect(report.totalDurationMs - 1_800_000).toBeLessThan(longest);
  });

  it('reports the total it landed on', () => {
    const { chosen, report } = select({ scored: scoreOf(pool), shape, locks: [], seed: 3 });
    const summed = chosen.reduce((total, track) => total + track.durationMs, 0);
    expect(report.totalDurationMs).toBe(summed);
  });

  it('falls short when the pool cannot fill the time', () => {
    const small = makeShape({ target: { kind: 'duration', ms: 999_000_000 }, maxPerArtist: 10 });
    const { report } = select({ scored: scoreOf(pool), shape: small, locks: [], seed: 3 });
    expect(report.shortfall?.reason).toBe('poolExhausted');
  });

  it('measures the shortfall in milliseconds', () => {
    const small = makeShape({ target: { kind: 'duration', ms: 999_000_000 }, maxPerArtist: 10 });
    const { report } = select({ scored: scoreOf(pool), shape: small, locks: [], seed: 3 });
    expect(report.shortfall?.shortBy).toBe(999_000_000 - report.totalDurationMs);
  });
});

describe('maxPerArtist', () => {
  it('is never exceeded', () => {
    const { chosen } = select({
      scored: scoreOf(pool),
      shape: makeShape({ target: { kind: 'count', count: 40 }, maxPerArtist: 2 }),
      locks: [],
      seed: 9,
    });
    expect([...countsByArtist(chosen).values()].every((count) => count <= 2)).toBe(true);
  });

  it('caps a single-artist pool at the allowance', () => {
    const { chosen } = select({
      scored: scoreOf(makeSingleArtistPool(30)),
      shape: makeShape({ target: { kind: 'count', count: 20 }, maxPerArtist: 3 }),
      locks: [],
      seed: 2,
    });
    expect(chosen.length).toBe(3);
  });

  it('blames the cap when it is what blocked the target', () => {
    const { report } = select({
      scored: scoreOf(makeSingleArtistPool(30)),
      shape: makeShape({ target: { kind: 'count', count: 20 }, maxPerArtist: 3 }),
      locks: [],
      seed: 2,
    });
    expect(report.shortfall?.reason).toBe('maxPerArtist');
  });

  it('counts a collaboration against both artists', () => {
    const collab = makeTrack({ id: 'tr-collab', artists: [artistAt(0), artistAt(1)] });
    const solo = makeTrack({ id: 'tr-solo', artists: [artistAt(1)] });
    const { chosen } = select({
      scored: scoreOf([collab, solo]),
      shape: makeShape({ target: { kind: 'count', count: 2 }, maxPerArtist: 1 }),
      locks: [],
      seed: 5,
    });
    expect(chosen.length).toBe(1);
  });

  it('chooses nothing when the cap is below one', () => {
    const { chosen } = select({
      scored: scoreOf(pool),
      shape: makeShape({ target: { kind: 'count', count: 5 }, maxPerArtist: 0 }),
      locks: [],
      seed: 1,
    });
    expect(chosen).toEqual([]);
  });

  it('says why nothing could be chosen', () => {
    const { report } = select({
      scored: scoreOf(pool),
      shape: makeShape({ target: { kind: 'count', count: 5 }, maxPerArtist: 0 }),
      locks: [],
      seed: 1,
    });
    expect(report.shortfall?.reason).toBe('maxPerArtistBelowOne');
  });
});

describe('locks', () => {
  const locks: readonly Lock[] = [
    { index: 0, trackId: trackId('tr-000') },
    { index: 4, trackId: trackId('tr-031') },
  ];

  it('always includes a locked track', () => {
    const { chosen } = select({
      scored: scoreOf(pool),
      shape: makeShape({ target: { kind: 'count', count: 6 } }),
      locks,
      seed: 77,
    });
    expect(ids(chosen)).toContain('tr-031');
  });

  it('places locked tracks before the sampled ones', () => {
    const { chosen } = select({
      scored: scoreOf(pool),
      shape: makeShape({ target: { kind: 'count', count: 6 } }),
      locks,
      seed: 77,
    });
    expect(ids(chosen).slice(0, 2)).toEqual(['tr-000', 'tr-031']);
  });

  it('reports which locks it applied', () => {
    const { report } = select({
      scored: scoreOf(pool),
      shape: makeShape({ target: { kind: 'count', count: 6 } }),
      locks,
      seed: 77,
    });
    expect(report.locksApplied.length).toBe(2);
  });

  it('drops a lock whose track is not in the scored set', () => {
    const { report } = select({
      scored: scoreOf(pool.slice(1)),
      shape: makeShape({ target: { kind: 'count', count: 6 } }),
      locks,
      seed: 77,
    });
    expect(report.locksDropped).toEqual([{ index: 0, trackId: 'tr-000' }]);
  });

  it('drops a duplicate lock on the same track', () => {
    const duplicate: readonly Lock[] = [
      { index: 0, trackId: trackId('tr-000') },
      { index: 1, trackId: trackId('tr-000') },
    ];
    const { chosen } = select({
      scored: scoreOf(pool),
      shape: makeShape({ target: { kind: 'count', count: 4 } }),
      locks: duplicate,
      seed: 3,
    });
    expect(ids(chosen).filter((id) => id === 'tr-000').length).toBe(1);
  });

  it('drops locks past a smaller target', () => {
    const { report } = select({
      scored: scoreOf(pool),
      shape: makeShape({ target: { kind: 'count', count: 1 } }),
      locks,
      seed: 3,
    });
    expect(report.locksDropped.length).toBe(1);
  });

  it('honours the target when locks alone fill it', () => {
    const { chosen } = select({
      scored: scoreOf(pool),
      shape: makeShape({ target: { kind: 'count', count: 1 } }),
      locks,
      seed: 3,
    });
    expect(chosen.length).toBe(1);
  });
});

describe('determinism', () => {
  it('repeats for the same seed', () => {
    const shape = makeShape({ target: { kind: 'count', count: 15 } });
    const a = select({ scored: scoreOf(pool), shape, locks: [], seed: 404 });
    const b = select({ scored: scoreOf(pool), shape, locks: [], seed: 404 });
    expect(ids(a.chosen)).toEqual(ids(b.chosen));
  });

  it('differs across seeds', () => {
    const shape = makeShape({ target: { kind: 'count', count: 15 } });
    const signatures = new Set(
      [1, 2, 3, 4, 5, 6].map((seed) =>
        ids(select({ scored: scoreOf(pool), shape, locks: [], seed }).chosen).join('|'),
      ),
    );
    expect(signatures.size).toBeGreaterThan(1);
  });
});

describe('empty and over-constrained input', () => {
  it('chooses nothing from an empty pool', () => {
    const { chosen } = select({ scored: [], shape: makeShape(), locks: [], seed: 1 });
    expect(chosen).toEqual([]);
  });

  it('names an empty pool as the reason', () => {
    const { report } = select({ scored: [], shape: makeShape(), locks: [], seed: 1 });
    expect(report.shortfall?.reason).toBe('emptyPool');
  });

  it('reports zero candidates for an empty pool', () => {
    const { report } = select({ scored: [], shape: makeShape(), locks: [], seed: 1 });
    expect(report.candidateCount).toBe(0);
  });

  it('takes the whole pool when the target is larger than it', () => {
    const { chosen } = select({
      scored: scoreOf(pool),
      shape: makeShape({ target: { kind: 'count', count: 500 }, maxPerArtist: 99 }),
      locks: [],
      seed: 1,
    });
    expect(chosen.length).toBe(pool.length);
  });

  it('blames the pool when the target is larger than it', () => {
    const { report } = select({
      scored: scoreOf(pool),
      shape: makeShape({ target: { kind: 'count', count: 500 }, maxPerArtist: 99 }),
      locks: [],
      seed: 1,
    });
    expect(report.shortfall?.reason).toBe('poolExhausted');
  });

  it('measures the shortfall in tracks', () => {
    const { report } = select({
      scored: scoreOf(pool),
      shape: makeShape({ target: { kind: 'count', count: 500 }, maxPerArtist: 99 }),
      locks: [],
      seed: 1,
    });
    expect(report.shortfall?.shortBy).toBe(500 - pool.length);
  });
});

describe('dials steer selection', () => {
  it('prefers strangers when familiarity is at zero', () => {
    const known = pool.slice(0, 40).map((track) => track.id);
    const familiar = makeContext({ topTrackIds: known });
    const scored = score({
      tracks: pool,
      shape: makeShape({ familiarity: dial(0) }),
      context: familiar,
    });
    const { chosen } = select({
      scored,
      shape: makeShape({ target: { kind: 'count', count: 20 }, maxPerArtist: 99 }),
      locks: [],
      seed: 12,
    });
    expect(chosen.every((track) => !known.includes(track.id))).toBe(true);
  });

  it('prefers the known when familiarity is at one', () => {
    const known = pool.slice(0, 40).map((track) => track.id);
    const familiar = makeContext({ topTrackIds: known });
    const scored = score({
      tracks: pool,
      shape: makeShape({ familiarity: dial(1) }),
      context: familiar,
    });
    const { chosen } = select({
      scored,
      shape: makeShape({ target: { kind: 'count', count: 20 }, maxPerArtist: 99 }),
      locks: [],
      seed: 12,
    });
    expect(chosen.every((track) => known.includes(track.id))).toBe(true);
  });

  const meanTrackNumber = (setting: number, seed: number): number => {
    const scored = score({ tracks: pool, shape: makeShape({ depth: dial(setting) }), context });
    const { chosen } = select({
      scored,
      shape: makeShape({ target: { kind: 'count', count: 20 }, maxPerArtist: 99 }),
      locks: [],
      seed,
    });
    return chosen.reduce((total, track) => total + track.trackNumber, 0) / chosen.length;
  };

  it('leans toward openers when depth is at one', () => {
    expect(meanTrackNumber(1, 8)).toBeLessThan(meanTrackNumber(0.5, 8));
  });

  it('leans toward closers when depth is at zero', () => {
    expect(meanTrackNumber(0, 8)).toBeGreaterThan(meanTrackNumber(0.5, 8));
  });

  it('separates the two extremes', () => {
    expect(meanTrackNumber(1, 8)).toBeLessThan(meanTrackNumber(0, 8));
  });
});
