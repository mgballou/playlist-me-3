/**
 * The deck's cursor. ui-sensibility §2.5: **a cursor keys on identity, never on position.**
 *
 * A re-roll replaces most of the deck and keeps the locked slots. A cursor holding an index
 * would jump to a different track for no reason the person can see; a cursor holding a
 * `TrackId` stays on the track it was on, and only moves when that track is gone.
 *
 * When it is gone — rejected, or re-rolled away — the cursor **clamps rather than resets**
 * (§2.5). It lands on whatever now occupies the slot it was looking at, which is the nearest
 * thing to "where I was" that survives the track itself leaving.
 */

import type { Track, TrackId } from '@pm/core';

export type CursorInput = {
  readonly cursor: TrackId | null;
  /** Where the cursor was standing before the deck changed, for the clamp. */
  readonly previousIndex: number;
  readonly tracks: readonly Track[];
};

export type CursorPosition = {
  readonly trackId: TrackId | null;
  readonly index: number;
};

export function nextCursor({ cursor, previousIndex, tracks }: CursorInput): CursorPosition {
  if (tracks.length === 0) return { trackId: null, index: -1 };

  if (cursor !== null) {
    const held = tracks.findIndex((track) => track.id === cursor);
    if (held !== -1) return { trackId: cursor, index: held };
  }

  const clamped = Math.min(Math.max(previousIndex, 0), tracks.length - 1);
  const track = tracks[clamped];
  return track === undefined ? { trackId: null, index: -1 } : { trackId: track.id, index: clamped };
}

export function indexOfCursor(tracks: readonly Track[], cursor: TrackId | null): number {
  if (cursor === null) return -1;
  return tracks.findIndex((track) => track.id === cursor);
}
