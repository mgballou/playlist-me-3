/**
 * The second pass: one weight per track. Spec §3.5.
 *
 * Both signals v2 leaned on are gone — `popularity` and audio features were removed in
 * 2026-02 (§1.2). What is left splits cleanly in two, and the split matters:
 *
 * **Familiarity is measured.** It comes from the person's own library, top tracks and
 * follows. Those endpoints survive and set membership is exact, so a track either is in
 * the library or is not.
 *
 * **Depth is estimated.** With `popularity` gone, "obvious" cannot be read off the API,
 * so track position within its album stands in for prominence: openers and singles skew
 * obvious, track 9 of 14 skews deep cut. This is a genuine proxy and a lossy one. It is
 * wrong about a closer that became the hit, wrong about a deep cut that got a sync
 * placement, and wrong about any album sequenced against convention. §9.1 states the
 * limit in the README and the UI labels the dial as an approximation. Never write copy
 * here or upstream that implies depth is measured.
 */

import type { EngineContext, Track } from './domain';
import type { Dial, Shape } from './recipe';

/**
 * Familiarity by strongest evidence. A track in the person's top list is known better
 * than one merely saved; a track by a followed artist is barely known at all.
 */
export const FAMILIARITY_WEIGHTS = {
  top: 1,
  library: 0.8,
  recentlyHeard: 0.6,
  followedArtist: 0.35,
  unknown: 0,
} as const;

/**
 * The smallest weight a track can carry. A dial at an extreme suppresses the far end of
 * the pool to zero, and a pool of zeroes has no proportion left to sample by. The floor
 * keeps a target reachable when every candidate is on the wrong side of a dial, and it
 * is small enough that any track on the right side outranks all of them together at any
 * realistic pool size.
 */
export const MIN_WEIGHT = 1e-6;

export type ScoredTrack = {
  readonly track: Track;
  /** 0..1, measured from set membership. §3.5 */
  readonly familiarity: number;
  /** 0..1, estimated from track position. 1 is "obvious". §3.5, §9.1 */
  readonly prominence: number;
  /** What `select` samples in proportion to. Always greater than zero. */
  readonly weight: number;
};

export type ScoreInput = {
  readonly tracks: readonly Track[];
  readonly shape: Shape;
  readonly context: EngineContext;
};

/** Exact, from set membership. Strongest applicable signal wins. §3.5 */
export function familiarityOf(track: Track, context: EngineContext): number {
  if (context.topTrackIds.has(track.id)) return FAMILIARITY_WEIGHTS.top;
  if (context.libraryTrackIds.has(track.id)) return FAMILIARITY_WEIGHTS.library;
  if (context.recentlyHeardTrackIds.has(track.id)) return FAMILIARITY_WEIGHTS.recentlyHeard;
  if (track.artists.some((artist) => context.followedArtistIds.has(artist.id))) {
    return FAMILIARITY_WEIGHTS.followedArtist;
  }
  return FAMILIARITY_WEIGHTS.unknown;
}

/**
 * The depth proxy, and the whole of it: 1 for an opener or a standalone single, falling
 * linearly to 0 for the last track on a long album. Estimated, not measured. §3.5, §9.1
 */
export function prominenceOf(track: Track): number {
  const total = Math.max(1, Math.trunc(track.albumTrackCount));
  if (total <= 1) return 1;
  const position = Math.min(Math.max(Math.trunc(track.trackNumber), 1), total);
  return 1 - (position - 1) / (total - 1);
}

/**
 * Interpolation, not thresholding. At 0.5 the multiplier is 1 for every track, so a
 * neutral dial expresses no preference rather than a preference for middling values. At
 * 1 it runs 0..2 with the signal; at 0 it runs 2..0 against it.
 */
export function dialWeight(signal: number, setting: Dial): number {
  return 1 + (2 * setting - 1) * (2 * signal - 1);
}

export function score({ tracks, shape, context }: ScoreInput): readonly ScoredTrack[] {
  return tracks.map((track) => {
    const familiarity = familiarityOf(track, context);
    const prominence = prominenceOf(track);
    const raw = dialWeight(familiarity, shape.familiarity) * dialWeight(prominence, shape.depth);
    return {
      track,
      familiarity,
      prominence,
      weight: Math.max(MIN_WEIGHT, raw),
    };
  });
}
