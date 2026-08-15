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
 *
 * **A held slot lights an LED** (§5 rule 4) — the bright accent, because held is the one
 * state on this deck that is *armed* rather than merely reported. It is never the only
 * carrier: the lamp lights, the word HELD appears beside it, and the padlock on the key
 * turns. Its width is reserved, so lighting it moves nothing (§14).
 */

import type { Track, TrackId } from '@pm/core';
import { format } from '@pm/core';

import { Led } from '@/components/primitives/Led';

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
          {/* The lamp sits against the key it reports on, and only when it is lit — a lamp on
              every slot saying "not held" is thirty rows of nothing, and thirty screen-reader
              announcements of nothing. Its width is reserved either way, so lighting it moves
              no neighbour (§14). The word beside it is what a screen reader hears; the solid
              key face beside that is what everyone else sees. §5 rule 4 */}
          <span className="slot__state">
            {locked ? <Led lit tone="held" label="Held" quiet /> : null}
          </span>

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
            {/* Geometric rather than a padlock emoji: an emoji arrives as colour art the
                stylesheet cannot tint, and a yellow blob on this desk fights the one amber
                that means something. A filled key face is engaged and a hollow one is not,
                which is a difference in luminance rather than in hue. */}
            <span className="slot__latch" aria-hidden="true">
              {locked ? '▣' : '▢'}
            </span>
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
