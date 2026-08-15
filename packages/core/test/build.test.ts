import { describe, expect, it } from 'vitest';

import type { Exclusion, Lock, Track } from '../src/index';
import { build, canReachTarget, dial, trackId } from '../src/index';
import {
  artistAt,
  makeContext,
  makePool,
  makeRecipe,
  makeShape,
  makeSingleArtistPool,
} from './fixtures/index';

const pool = makePool();
const context = makeContext();
const ids = (tracks: readonly Track[]) => tracks.map((track) => track.id);

const run = (options: {
  readonly seed: number;
  readonly count?: number;
  readonly maxPerArtist?: number;
  readonly exclusions?: readonly Exclusion[];
  readonly locks?: readonly Lock[];
  readonly rejects?: ReadonlySet<string>;
  readonly pool?: readonly Track[];
}) =>
  build({
    pool: options.pool ?? pool,
    recipe: makeRecipe({
      exclusions: options.exclusions ?? [],
      shape: makeShape({
        target: { kind: 'count', count: options.count ?? 12 },
        maxPerArtist: options.maxPerArtist ?? 3,
      }),
    }),
    seed: options.seed,
    context,
    locks: options.locks ?? [],
    rejects: new Set([...(options.rejects ?? [])].map(trackId)),
  });

describe('determinism', () => {
  it('produces an identical playlist for the same seed', () => {
    expect(ids(run({ seed: 1234 }).tracks)).toEqual(ids(run({ seed: 1234 }).tracks));
  });

  it('produces the same report for the same seed', () => {
    expect(run({ seed: 1234 }).report).toEqual(run({ seed: 1234 }).report);
  });

  it('produces different playlists across seeds', () => {
    const signatures = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => ids(run({ seed }).tracks).join('|')),
    );
    expect(signatures.size).toBeGreaterThan(1);
  });

  it('records the seed it used', () => {
    expect(run({ seed: 99 }).report.seed).toBe(99);
  });
});

describe('shape constraints', () => {
  it('never exceeds maxPerArtist', () => {
    const counts = new Map<string, number>();
    for (const track of run({ seed: 7, count: 40, maxPerArtist: 2 }).tracks) {
      for (const artist of track.artists) {
        counts.set(artist.id, (counts.get(artist.id) ?? 0) + 1);
      }
    }
    expect([...counts.values()].every((count) => count <= 2)).toBe(true);
  });

  it('hits the requested count', () => {
    expect(run({ seed: 7, count: 15 }).tracks.length).toBe(15);
  });

  it('never repeats a track', () => {
    const tracks = run({ seed: 7, count: 20, maxPerArtist: 5 }).tracks;
    expect(new Set(ids(tracks)).size).toBe(tracks.length);
  });
});

describe('exclusions', () => {
  it('never lets an excluded artist through', () => {
    const exclusions: readonly Exclusion[] = [{ kind: 'artist', artistId: artistAt(0).id }];
    const seeds = [1, 2, 3, 4, 5];
    const appeared = seeds.some((seed) =>
      run({ seed, count: 24, maxPerArtist: 9, exclusions }).tracks.some((track) =>
        track.artists.some((artist) => artist.id === artistAt(0).id),
      ),
    );
    expect(appeared).toBe(false);
  });

  it('reports what each exclusion removed', () => {
    const exclusions: readonly Exclusion[] = [{ kind: 'explicit' }, { kind: 'liveOrRemix' }];
    const { report } = run({ seed: 1, exclusions });
    expect(report.reject.removals.map((entry) => entry.kind)).toEqual(['explicit', 'liveOrRemix']);
  });

  it('counts the pool before anything was removed', () => {
    const { report } = run({ seed: 1, exclusions: [{ kind: 'explicit' }] });
    expect(report.poolSize).toBe(pool.length);
  });
});

describe('rejects', () => {
  it('never returns a banished track', () => {
    const banished = new Set(['tr-000', 'tr-001', 'tr-002', 'tr-003']);
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    const returned = seeds.some((seed) =>
      run({ seed, count: 30, maxPerArtist: 9, rejects: banished }).tracks.some((track) =>
        banished.has(track.id),
      ),
    );
    expect(returned).toBe(false);
  });

  it('counts what it banished', () => {
    const { report } = run({ seed: 1, rejects: new Set(['tr-000', 'tr-001']) });
    expect(report.banishedCount).toBe(2);
  });
});

describe('locks', () => {
  const locks: readonly Lock[] = [
    { index: 0, trackId: trackId('tr-005') },
    { index: 3, trackId: trackId('tr-042') },
  ];

  it('holds a locked track at its exact index across re-rolls', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const held = seeds.every((seed) => run({ seed, count: 12, locks }).tracks[3]?.id === 'tr-042');
    expect(held).toBe(true);
  });

  it('holds the first lock at its index too', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const held = seeds.every((seed) => run({ seed, count: 12, locks }).tracks[0]?.id === 'tr-005');
    expect(held).toBe(true);
  });

  it('still fills the rest of the playlist', () => {
    expect(run({ seed: 3, count: 12, locks }).tracks.length).toBe(12);
  });

  it('re-rolls the unlocked slots', () => {
    const first = ids(run({ seed: 3, count: 12, locks }).tracks);
    const second = ids(run({ seed: 4, count: 12, locks }).tracks);
    expect(first).not.toEqual(second);
  });

  it('drops a lock on a track the exclusions removed', () => {
    const exclusions: readonly Exclusion[] = [{ kind: 'artist', artistId: artistAt(0).id }];
    const { report } = run({ seed: 3, count: 12, locks, exclusions });
    expect(report.select.locksDropped.map((lock) => lock.trackId)).toEqual(['tr-005']);
  });

  it('never returns a locked track that was also banished', () => {
    const { tracks } = run({ seed: 3, count: 12, locks, rejects: new Set(['tr-042']) });
    expect(ids(tracks)).not.toContain('tr-042');
  });

  it('keeps a lock past the end on the last slot', () => {
    const far: readonly Lock[] = [{ index: 40, trackId: trackId('tr-005') }];
    const { tracks } = run({ seed: 3, count: 6, locks: far });
    expect(tracks[5]?.id).toBe('tr-005');
  });
});

describe('order strategies inside build', () => {
  it('applies byRelease', () => {
    const result = build({
      pool,
      recipe: makeRecipe({
        shape: makeShape({ target: { kind: 'count', count: 12 }, order: 'byRelease' }),
      }),
      seed: 1,
      context,
    });
    const years = result.tracks.map((track) => track.releaseYear);
    expect(years.every((year, index) => index === 0 || year >= (years[index - 1] ?? year))).toBe(
      true,
    );
  });

  it('keeps a lock in place even under byRelease', () => {
    const result = build({
      pool,
      recipe: makeRecipe({
        shape: makeShape({ target: { kind: 'count', count: 12 }, order: 'byRelease' }),
      }),
      seed: 1,
      context,
      locks: [{ index: 2, trackId: trackId('tr-042') }],
    });
    expect(result.tracks[2]?.id).toBe('tr-042');
  });
});

describe('duration target', () => {
  const durationRun = (seed: number, ms: number) =>
    build({
      pool,
      recipe: makeRecipe({
        shape: makeShape({ target: { kind: 'duration', ms }, maxPerArtist: 9 }),
      }),
      seed,
      context,
    });

  it('reaches the target', () => {
    expect(durationRun(11, 2_400_000).report.totalDurationMs).toBeGreaterThanOrEqual(2_400_000);
  });

  it('lands within one track of the target', () => {
    const result = durationRun(11, 2_400_000);
    const longest = Math.max(...result.tracks.map((track) => track.durationMs));
    expect(result.report.totalDurationMs - 2_400_000).toBeLessThan(longest);
  });

  it('reports reaching it', () => {
    expect(canReachTarget(durationRun(11, 2_400_000))).toBe(true);
  });
});

describe('source contributions', () => {
  it('reports one row per recipe source', () => {
    expect(run({ seed: 1 }).report.sourceContributions.length).toBe(3);
  });

  it('names each source kind', () => {
    const kinds = run({ seed: 1 }).report.sourceContributions.map((entry) => entry.kind);
    expect(kinds).toEqual(['artist', 'library', 'topTracks']);
  });

  it('sums pooled counts back to the pool size', () => {
    const summed = run({ seed: 1 }).report.sourceContributions.reduce(
      (total, entry) => total + entry.pooled,
      0,
    );
    expect(summed).toBe(pool.length);
  });

  it('sums chosen counts back to the playlist length', () => {
    const result = run({ seed: 1, count: 12 });
    const summed = result.report.sourceContributions.reduce(
      (total, entry) => total + entry.chosen,
      0,
    );
    expect(summed).toBe(result.tracks.length);
  });

  it('reports a source that contributed nothing', () => {
    const exclusions: readonly Exclusion[] = [{ kind: 'artist', artistId: artistAt(0).id }];
    const rows = run({ seed: 1, exclusions }).report.sourceContributions;
    expect(rows.some((entry) => entry.kept < entry.pooled)).toBe(true);
  });
});

describe('coherent reports rather than throws', () => {
  it('returns no tracks for an empty pool', () => {
    expect(run({ seed: 1, pool: [] }).tracks).toEqual([]);
  });

  it('says an empty pool could not reach the target', () => {
    expect(run({ seed: 1, pool: [] }).report.canReachTarget).toBe(false);
  });

  it('names the empty pool as the reason', () => {
    expect(run({ seed: 1, pool: [] }).report.select.shortfall?.reason).toBe('emptyPool');
  });

  it('returns no tracks when every exclusion applies', () => {
    const exclusions: readonly Exclusion[] = [{ kind: 'years', range: { from: 0, to: 3000 } }];
    expect(run({ seed: 1, exclusions }).tracks).toEqual([]);
  });

  it('explains an over-constrained recipe through the reject report', () => {
    const exclusions: readonly Exclusion[] = [{ kind: 'years', range: { from: 0, to: 3000 } }];
    expect(run({ seed: 1, exclusions }).report.reject.removedCount).toBe(pool.length);
  });

  it('returns what it could when the target exceeds the pool', () => {
    expect(run({ seed: 1, count: 500, maxPerArtist: 99 }).tracks.length).toBe(pool.length);
  });

  it('says the oversized target was out of reach', () => {
    expect(run({ seed: 1, count: 500, maxPerArtist: 99 }).report.canReachTarget).toBe(false);
  });

  it('blames the artist cap when that is what bound it', () => {
    const singleArtist = makeSingleArtistPool(40);
    const result = run({ seed: 1, count: 30, maxPerArtist: 2, pool: singleArtist });
    expect(result.report.select.shortfall?.reason).toBe('maxPerArtist');
  });

  it('reports a zero total duration for an empty result', () => {
    expect(run({ seed: 1, pool: [] }).report.totalDurationMs).toBe(0);
  });
});

describe('report totals', () => {
  it('counts the tracks it returned', () => {
    const result = run({ seed: 5, count: 14 });
    expect(result.report.trackCount).toBe(result.tracks.length);
  });

  it('sums the duration it returned', () => {
    const result = run({ seed: 5, count: 14 });
    const summed = result.tracks.reduce((total, track) => total + track.durationMs, 0);
    expect(result.report.totalDurationMs).toBe(summed);
  });

  it('names the recipe it ran', () => {
    expect(run({ seed: 5 }).report.recipeId).toBe('rc-fixture');
  });
});

describe('dials reach through build', () => {
  const knownIds = pool.slice(0, 40).map((track) => track.id);
  const familiarContext = makeContext({ topTrackIds: knownIds });

  const dialRun = (familiarity: number) =>
    build({
      pool,
      recipe: makeRecipe({
        shape: makeShape({
          target: { kind: 'count', count: 20 },
          maxPerArtist: 99,
          familiarity: dial(familiarity),
        }),
      }),
      seed: 21,
      context: familiarContext,
    });

  it('builds only from strangers at familiarity zero', () => {
    expect(dialRun(0).tracks.every((track) => !knownIds.includes(track.id))).toBe(true);
  });

  it('builds only from the known at familiarity one', () => {
    expect(dialRun(1).tracks.every((track) => knownIds.includes(track.id))).toBe(true);
  });

  it('draws from both at neutral', () => {
    const chosen = dialRun(0.5).tracks;
    const known = chosen.filter((track) => knownIds.includes(track.id)).length;
    expect(known > 0 && known < chosen.length).toBe(true);
  });
});
