/**
 * The first pass: drop anything excluded. Spec §2.3, §3.2.
 *
 * `playlist` and `inLibrary` are the headline exclusions — the two things Spotify's own
 * generator has never offered. Everything the pass needs about the person arrives as
 * plain sets, so the pass does no I/O (§3.1).
 */

import type { EngineContext, Track } from './domain';
import { unreachable } from './errors';
import type { Exclusion, ExclusionKind } from './recipe';

/**
 * The vocabulary the `liveOrRemix` exclusion looks for. Spec §3.4.
 *
 * These are matched against a title's **suffix segments only** — never the whole title.
 * See `isLiveOrRemix`. Matching anywhere in the title would throw away "Live and Let
 * Die", "Live Forever", "Live Wire" and "Long Live", and a person who ticks this box and
 * silently loses studio tracks is worse off than one who never had the filter.
 *
 * The list lives in one exported constant so it is testable and correctable — a new
 * marker ("Demo", "Acoustic", "Edit") is one line here and nothing else.
 */
export const LIVE_OR_REMIX_PATTERNS = [
  /\blive\b/i,
  /\bremix(?:es|ed)?\b/i,
  /\bremaster(?:ed|s)?\b/i,
  /\bkaraoke\b/i,
  /\binstrumental\b/i,
  /\bradio edit\b/i,
] as const;

/** A parenthesised or bracketed group: "Song (Live)", "Song [Instrumental]". */
const BRACKETED_SEGMENT = /[([]([^)\]]*)[)\]]?/g;

/** Spotify's suffix separator: "Song - 2011 Remaster". En and em dashes count too. */
const SUFFIX_SEPARATOR = /\s[-–—]\s/;

/**
 * The parts of a title where a release marker legitimately lives. Spotify is consistent
 * about this: a marker sits inside brackets or after a spaced dash, never mid-sentence.
 */
function suffixSegments(title: string): readonly string[] {
  const segments: string[] = [];

  for (const match of title.matchAll(BRACKETED_SEGMENT)) {
    const inner = match[1];
    if (inner !== undefined && inner.length > 0) segments.push(inner);
  }

  const separator = SUFFIX_SEPARATOR.exec(title);
  if (separator !== null) segments.push(title.slice(separator.index + separator[0].length));

  return segments;
}

/**
 * Best effort, per §3.4, and the UI says so rather than implying certainty.
 *
 * Requiring suffix context means the heuristic now **under-catches**: it misses a live
 * album whose tracks carry no marker in the title, which is the dominant real failure and
 * one no title heuristic can fix. That is the better direction to be wrong in. A missed
 * live track is one odd entry in a playlist; a wrongly excluded studio track is a person
 * wondering why a song they asked for never appears.
 */
export function isLiveOrRemix(title: string): boolean {
  return suffixSegments(title).some((segment) =>
    LIVE_OR_REMIX_PATTERNS.some((pattern) => pattern.test(segment)),
  );
}

/** What one exclusion took out of the pool. */
export type ExclusionRemoval = {
  readonly kind: ExclusionKind;
  /** Position in `Recipe.exclusions`, so the UI can point at the control that did it. */
  readonly exclusionIndex: number;
  readonly removed: number;
};

/**
 * Why the pool shrank. The UI shows this — a generator that cannot say why it chose is a
 * black box (§3.2).
 *
 * A track can offend more than one exclusion. Credit goes to the first one that catches
 * it, in recipe order, so `removals` always sums to `removedCount`.
 */
export type RejectReport = {
  readonly poolSize: number;
  readonly keptCount: number;
  readonly removedCount: number;
  readonly removals: readonly ExclusionRemoval[];
};

export type RejectInput = {
  readonly pool: readonly Track[];
  readonly exclusions: readonly Exclusion[];
  readonly context: EngineContext;
};

export type RejectOutput = {
  readonly kept: readonly Track[];
  readonly report: RejectReport;
};

/** True when this one exclusion catches this one track. */
export function isExcluded(track: Track, exclusion: Exclusion, context: EngineContext): boolean {
  switch (exclusion.kind) {
    case 'artist':
      return track.artists.some((artist) => artist.id === exclusion.artistId);
    case 'playlist':
      return context.playlistTrackIds.get(exclusion.playlistId)?.has(track.id) ?? false;
    case 'inLibrary':
      return context.libraryTrackIds.has(track.id);
    case 'heardRecently':
      return context.recentlyHeardTrackIds.has(track.id);
    case 'years':
      return track.releaseYear >= exclusion.range.from && track.releaseYear <= exclusion.range.to;
    case 'duration':
      return track.durationMs >= exclusion.range.minMs && track.durationMs <= exclusion.range.maxMs;
    case 'explicit':
      return track.explicit;
    case 'liveOrRemix':
      return isLiveOrRemix(track.title);
    default:
      return unreachable(exclusion);
  }
}

export function reject({ pool, exclusions, context }: RejectInput): RejectOutput {
  const removed = new Array<number>(exclusions.length).fill(0);
  const kept: Track[] = [];

  for (const track of pool) {
    const offendedAt = exclusions.findIndex((exclusion) => isExcluded(track, exclusion, context));
    if (offendedAt === -1) {
      kept.push(track);
      continue;
    }
    removed[offendedAt] = (removed[offendedAt] ?? 0) + 1;
  }

  const removals = exclusions.map((exclusion, exclusionIndex) => ({
    kind: exclusion.kind,
    exclusionIndex,
    removed: removed[exclusionIndex] ?? 0,
  }));

  return {
    kept,
    report: {
      poolSize: pool.length,
      keptCount: kept.length,
      removedCount: pool.length - kept.length,
      removals,
    },
  };
}
