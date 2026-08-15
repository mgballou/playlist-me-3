import { describe, expect, it } from 'vitest';

import type { Track } from '../src/index';
import { order } from '../src/index';
import { artistAt, makePool, makeTrack } from './fixtures/index';

const pool = makePool();
const sample = pool.slice(0, 24);
const ids = (tracks: readonly Track[]) => tracks.map((track) => track.id);
const sorted = (tracks: readonly Track[]) => [...ids(tracks)].sort();

describe('every strategy', () => {
  const strategies = ['shuffle', 'byRelease', 'artistClustered', 'sourceInterleaved'] as const;

  it.each(strategies)('%s keeps every track', (strategy) => {
    expect(sorted(order({ tracks: sample, strategy, seed: 5 }))).toEqual(sorted(sample));
  });

  it.each(strategies)('%s repeats for the same seed', (strategy) => {
    const first = order({ tracks: sample, strategy, seed: 5 });
    const second = order({ tracks: sample, strategy, seed: 5 });
    expect(ids(first)).toEqual(ids(second));
  });

  it.each(strategies)('%s handles an empty list', (strategy) => {
    expect(order({ tracks: [], strategy, seed: 5 })).toEqual([]);
  });
});

describe('shuffle', () => {
  it('changes the arrangement', () => {
    expect(ids(order({ tracks: sample, strategy: 'shuffle', seed: 5 }))).not.toEqual(ids(sample));
  });

  it('differs across seeds', () => {
    const first = order({ tracks: sample, strategy: 'shuffle', seed: 5 });
    const second = order({ tracks: sample, strategy: 'shuffle', seed: 6 });
    expect(ids(first)).not.toEqual(ids(second));
  });
});

describe('byRelease', () => {
  it('runs oldest first', () => {
    const ordered = order({ tracks: sample, strategy: 'byRelease', seed: 5 });
    const years = ordered.map((track) => track.releaseYear);
    expect(years.every((year, index) => index === 0 || year >= (years[index - 1] ?? year))).toBe(
      true,
    );
  });

  it('ignores the seed', () => {
    const first = order({ tracks: sample, strategy: 'byRelease', seed: 1 });
    const second = order({ tracks: sample, strategy: 'byRelease', seed: 999 });
    expect(ids(first)).toEqual(ids(second));
  });

  it('keeps an album in track order', () => {
    const album = { id: 'al-00', title: 'Low Season' };
    const tracks: readonly Track[] = [
      makeTrack({ id: 'b', album, releaseYear: 1999, trackNumber: 2 }),
      makeTrack({ id: 'a', album, releaseYear: 1999, trackNumber: 1 }),
    ];
    expect(ids(order({ tracks, strategy: 'byRelease', seed: 1 }))).toEqual(['a', 'b']);
  });
});

describe('artistClustered', () => {
  it('keeps each artist in one contiguous run', () => {
    const ordered = order({ tracks: sample, strategy: 'artistClustered', seed: 5 });
    const runs = ordered.map((track) => track.artists[0]?.id ?? '');
    const starts = runs.filter((id, index) => id !== runs[index - 1]);
    expect(new Set(starts).size).toBe(starts.length);
  });

  it('keeps the selection order inside a run', () => {
    const tracks: readonly Track[] = [
      makeTrack({ id: 'x1', artists: [artistAt(0)] }),
      makeTrack({ id: 'y1', artists: [artistAt(1)] }),
      makeTrack({ id: 'x2', artists: [artistAt(0)] }),
    ];
    const ordered = order({ tracks, strategy: 'artistClustered', seed: 5 });
    const xs = ids(ordered).filter((id) => id.startsWith('x'));
    expect(xs).toEqual(['x1', 'x2']);
  });

  it('varies the run order across seeds', () => {
    const arrangements = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed) =>
        ids(order({ tracks: sample, strategy: 'artistClustered', seed })).join('|'),
      ),
    );
    expect(arrangements.size).toBeGreaterThan(1);
  });
});

describe('sourceInterleaved', () => {
  const mixed: readonly Track[] = [
    makeTrack({ id: 'a0', sourceIndex: 0 }),
    makeTrack({ id: 'a1', sourceIndex: 0 }),
    makeTrack({ id: 'a2', sourceIndex: 0 }),
    makeTrack({ id: 'b0', sourceIndex: 1 }),
    makeTrack({ id: 'b1', sourceIndex: 1 }),
    makeTrack({ id: 'c0', sourceIndex: 2 }),
  ];

  it('takes one from each source in turn', () => {
    const ordered = order({ tracks: mixed, strategy: 'sourceInterleaved', seed: 1 });
    expect(ids(ordered)).toEqual(['a0', 'b0', 'c0', 'a1', 'b1', 'a2']);
  });

  it('ignores the seed', () => {
    const first = order({ tracks: mixed, strategy: 'sourceInterleaved', seed: 1 });
    const second = order({ tracks: mixed, strategy: 'sourceInterleaved', seed: 42 });
    expect(ids(first)).toEqual(ids(second));
  });

  it('handles a single source', () => {
    const single = mixed.filter((track) => track.sourceIndex === 0);
    const ordered = order({ tracks: single, strategy: 'sourceInterleaved', seed: 1 });
    expect(ids(ordered)).toEqual(['a0', 'a1', 'a2']);
  });

  it('opens with one track from every source present', () => {
    const ordered = order({ tracks: sample, strategy: 'sourceInterleaved', seed: 1 });
    const sources = new Set(sample.map((track) => track.sourceIndex));
    const opening = ordered.slice(0, sources.size).map((track) => track.sourceIndex);
    expect(new Set(opening).size).toBe(sources.size);
  });
});
