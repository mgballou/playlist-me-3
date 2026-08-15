/**
 * The fourth pass: arrange the chosen set. Spec §2.4, §3.2.
 *
 * Ordering never adds, drops or duplicates a track — it is a permutation and the tests
 * hold it to that. Every strategy is deterministic for a given seed, including the ones
 * that never consult the generator.
 */

import type { Track } from './domain';
import { unreachable } from './errors';
import type { OrderStrategy } from './recipe';
import { createRng } from './rng';

export type OrderInput = {
  readonly tracks: readonly Track[];
  readonly strategy: OrderStrategy;
  readonly seed: number;
};

/** Oldest first, then album, then position on that album. Ties break on id, never on input order. */
function byRelease(tracks: readonly Track[]): readonly Track[] {
  return [...tracks].sort((a, b) => {
    if (a.releaseYear !== b.releaseYear) return a.releaseYear - b.releaseYear;
    if (a.album.title !== b.album.title) return a.album.title < b.album.title ? -1 : 1;
    if (a.trackNumber !== b.trackNumber) return a.trackNumber - b.trackNumber;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Groups on the first credited artist so a run of one artist plays together, then
 * shuffles the run order. Within a run the selection order stands — the point of the
 * strategy is adjacency, not a second shuffle.
 */
function artistClustered(tracks: readonly Track[], seed: number): readonly Track[] {
  const clusters = new Map<string, Track[]>();
  for (const track of tracks) {
    const key = track.artists[0]?.id ?? '';
    const cluster = clusters.get(key);
    if (cluster === undefined) clusters.set(key, [track]);
    else cluster.push(track);
  }
  const rng = createRng(seed);
  return rng.shuffle([...clusters.values()]).flat();
}

/**
 * Round-robin across the recipe's sources, so a playlist built from three sources reads
 * as a mix rather than three blocks. Buckets run in source order and a bucket that runs
 * out simply stops taking turns.
 */
function sourceInterleaved(tracks: readonly Track[]): readonly Track[] {
  const buckets = new Map<number, Track[]>();
  for (const track of tracks) {
    const bucket = buckets.get(track.sourceIndex);
    if (bucket === undefined) buckets.set(track.sourceIndex, [track]);
    else bucket.push(track);
  }
  const ordered = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([, value]) => value);

  const out: Track[] = [];
  const deepest = ordered.reduce((max, bucket) => Math.max(max, bucket.length), 0);
  for (let round = 0; round < deepest; round += 1) {
    for (const bucket of ordered) {
      const track = bucket[round];
      if (track !== undefined) out.push(track);
    }
  }
  return out;
}

export function order({ tracks, strategy, seed }: OrderInput): readonly Track[] {
  switch (strategy) {
    case 'shuffle':
      return createRng(seed).shuffle(tracks);
    case 'byRelease':
      return byRelease(tracks);
    case 'artistClustered':
      return artistClustered(tracks, seed);
    case 'sourceInterleaved':
      return sourceInterleaved(tracks);
    default:
      return unreachable(strategy);
  }
}
