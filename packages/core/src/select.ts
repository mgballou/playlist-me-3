/**
 * The third pass: weighted sampling without replacement. Spec §3.2, §3.3.
 *
 * Locked tracks take their slots before anything is sampled, because locks are build
 * input rather than post-processing (§3.3). That is what lets re-roll, single-slot
 * re-roll and restore all be the same call with a different seed and a longer lock list
 * — one selection path, so there is no second one to get wrong.
 */

import type { Lock, Track } from './domain';
import { unreachable } from './errors';
import { createRng } from './rng';
import type { ScoredTrack } from './score';
import type { Shape, Target } from './recipe';

/** Why the build fell short of the target. */
export type ShortfallReason =
  /** Nothing survived the exclusions. */
  | 'emptyPool'
  /** Every candidate was used and the target was still not met. */
  | 'poolExhausted'
  /** Candidates remained, but every one of them would have broken `maxPerArtist`. */
  | 'maxPerArtist'
  /** `maxPerArtist` is below 1, so no track can be chosen at all. */
  | 'maxPerArtistBelowOne';

export type Shortfall = {
  readonly reason: ShortfallReason;
  /** Tracks for a count target, milliseconds for a duration target. */
  readonly shortBy: number;
};

export type SelectReport = {
  readonly target: Target;
  readonly candidateCount: number;
  readonly chosenCount: number;
  readonly totalDurationMs: number;
  /** Locks whose track survived rejection and fitted the target. */
  readonly locksApplied: readonly Lock[];
  /** Locks whose track was excluded, rejected or absent from the pool. */
  readonly locksDropped: readonly Lock[];
  readonly canReachTarget: boolean;
  readonly shortfall: Shortfall | null;
};

export type SelectInput = {
  readonly scored: readonly ScoredTrack[];
  readonly shape: Shape;
  readonly locks: readonly Lock[];
  readonly seed: number;
};

export type SelectOutput = {
  /** Locked tracks first, in lock order, then the sampled ones in the order drawn. */
  readonly chosen: readonly Track[];
  readonly report: SelectReport;
};

function isTargetMet(target: Target, chosenCount: number, durationMs: number): boolean {
  switch (target.kind) {
    case 'count':
      return chosenCount >= target.count;
    case 'duration':
      return durationMs >= target.ms;
    default:
      return unreachable(target);
  }
}

function shortfallAmount(target: Target, chosenCount: number, durationMs: number): number {
  switch (target.kind) {
    case 'count':
      return Math.max(0, target.count - chosenCount);
    case 'duration':
      return Math.max(0, target.ms - durationMs);
    default:
      return unreachable(target);
  }
}

/**
 * A track credited to two artists counts against both artists' allowances. A collab is
 * as much of that artist's presence on the playlist as a solo track is.
 */
function creditArtists(track: Track, counts: Map<string, number>): void {
  for (const artist of track.artists) {
    counts.set(artist.id, (counts.get(artist.id) ?? 0) + 1);
  }
}

function hasRoomForArtists(track: Track, counts: Map<string, number>, max: number): boolean {
  return track.artists.every((artist) => (counts.get(artist.id) ?? 0) < max);
}

export function select({ scored, shape, locks, seed }: SelectInput): SelectOutput {
  const rng = createRng(seed);
  const byId = new Map(scored.map((entry) => [entry.track.id, entry]));
  const { target, maxPerArtist } = shape;

  const orderedLocks = [...locks].sort((a, b) => a.index - b.index);
  const lockedTracks: Track[] = [];
  const locksApplied: Lock[] = [];
  const locksDropped: Lock[] = [];
  const seenLockIds = new Set<string>();
  const artistCounts = new Map<string, number>();

  let durationMs = 0;

  for (const lock of orderedLocks) {
    const entry = byId.get(lock.trackId);
    const overCount = target.kind === 'count' && lockedTracks.length >= target.count;
    if (entry === undefined || seenLockIds.has(lock.trackId) || overCount) {
      locksDropped.push(lock);
      continue;
    }
    seenLockIds.add(lock.trackId);
    lockedTracks.push(entry.track);
    locksApplied.push(lock);
    creditArtists(entry.track, artistCounts);
    durationMs += entry.track.durationMs;
  }

  const candidates = scored.filter((entry) => !seenLockIds.has(entry.track.id));
  const chosen: Track[] = [...lockedTracks];

  let remaining = candidates;
  let blockedByMaxPerArtist = false;

  if (maxPerArtist >= 1) {
    while (remaining.length > 0 && !isTargetMet(target, chosen.length, durationMs)) {
      const eligible = remaining.filter((entry) =>
        hasRoomForArtists(entry.track, artistCounts, maxPerArtist),
      );
      if (eligible.length === 0) {
        blockedByMaxPerArtist = true;
        break;
      }
      const picked = rng.weightedPick(
        eligible,
        eligible.map((entry) => entry.weight),
      );
      chosen.push(picked.track);
      creditArtists(picked.track, artistCounts);
      durationMs += picked.track.durationMs;
      remaining = remaining.filter((entry) => entry.track.id !== picked.track.id);
    }
  }

  const met = isTargetMet(target, chosen.length, durationMs);
  const shortBy = shortfallAmount(target, chosen.length, durationMs);

  const reason: ShortfallReason =
    maxPerArtist < 1
      ? 'maxPerArtistBelowOne'
      : scored.length === 0
        ? 'emptyPool'
        : blockedByMaxPerArtist
          ? 'maxPerArtist'
          : 'poolExhausted';

  return {
    chosen,
    report: {
      target,
      candidateCount: scored.length,
      chosenCount: chosen.length,
      totalDurationMs: durationMs,
      locksApplied,
      locksDropped,
      canReachTarget: met,
      shortfall: met ? null : { reason, shortBy },
    },
  };
}
