'use client';

/**
 * One slot on the deck.
 *
 * **Lock and reject live on the track, not in a menu** (§2.4) — they are the two most-used
 * controls in the app after re-roll, and a menu would put a click in front of both. They sit
 * next to each other, which is exactly the case §13's 2.5.8 is about: a mis-tap there is
 * destructive, so both targets clear the minimum with room to spare.
 *
 * **The turn is the motion that matters** (§8). The `<li>` is keyed on its index and stays
 * put; the content inside is keyed on the track, so a slot whose track changed remounts and
 * plays `slot-turn`, and a locked slot — whose track did not change — does not move at all.
 * That is determinism taught without a word of copy, and it costs one `key`.
 *
 * Under reduced motion the turn becomes a cross-fade, in the stylesheet, so nothing visible
 * goes missing (§8).
 */

import type { Track, TrackId } from '@pm/core';
import { format } from '@pm/core';

export type TrackSlotProps = {
  readonly track: Track;
  readonly index: number;
  readonly locked: boolean;
  readonly focused: boolean;
  readonly onLock: () => void;
  readonly onUnlock: () => void;
  readonly onReject: (trackId: TrackId) => void;
  readonly onFocus: () => void;
};

export function TrackSlot({
  track,
  index,
  locked,
  focused,
  onLock,
  onUnlock,
  onReject,
  onFocus,
}: TrackSlotProps) {
  const artists = track.artists.map((artist) => artist.name).join(', ');

  return (
    <li
      className="slot"
      data-locked={locked ? 'true' : 'false'}
      data-focused={focused ? 'true' : 'false'}
      onFocus={onFocus}
    >
      {/* Keyed on the track: a slot whose track changed remounts and turns; a locked slot
          holds perfectly still, because its key did not change. §8 */}
      <div className="slot__face" key={track.id}>
        <span className="slot__index numeric" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>

        <span className="slot__text">
          <span className="slot__title">{track.title}</span>
          <span className="slot__artist muted">{artists}</span>
        </span>

        <span className="slot__time numeric muted">
          {format({ kind: 'trackDuration', ms: track.durationMs })}
        </span>

        <span className="slot__acts">
          <button
            type="button"
            className="slot__act"
            aria-pressed={locked}
            onClick={locked ? onUnlock : onLock}
            aria-label={
              locked
                ? `Unlock ${track.title}, slot ${String(index + 1)}`
                : `Lock ${track.title} to slot ${String(index + 1)}`
            }
          >
            <span aria-hidden="true">{locked ? '🔒' : '🔓'}</span>
          </button>

          <button
            type="button"
            className="slot__act slot__act--reject"
            onClick={() => {
              onReject(track.id);
            }}
            aria-label={`Reject ${track.title}`}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </span>
      </div>
    </li>
  );
}
