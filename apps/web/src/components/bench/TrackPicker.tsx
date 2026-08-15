'use client';

/** Picking a track, for the `track` source — the seed a recipe reaches out from (§2.2). */

import type { TrackId } from '@pm/core';

import { findTracks } from '@/lib/actions/catalog';
import { useLookup } from '@/lib/workbench/use-lookup';
import { Overlay } from '@/components/primitives/Overlay';
import { PickerResults } from './ArtistPicker';

export type TrackPickerProps = {
  readonly title: string;
  readonly onPick: (choice: { readonly id: TrackId; readonly name: string }) => void;
  readonly onClose: () => void;
};

export function TrackPicker({ title, onPick, onClose }: TrackPickerProps) {
  const lookup = useLookup(findTracks);

  return (
    <Overlay title={title} onClose={onClose}>
      <label className="field">
        <span className="field__label label">Search for a track</span>
        <input
          className="field__input"
          type="search"
          value={lookup.query}
          autoComplete="off"
          onChange={(event) => {
            lookup.setQuery(event.currentTarget.value);
          }}
        />
      </label>

      <PickerResults
        query={lookup.query}
        looking={lookup.looking}
        message={lookup.message}
        count={lookup.items.length}
        nothing="Nothing matched. Search takes ten results a page, so fewer words go further."
      >
        <ul className="picker__list">
          {lookup.items.map((track) => (
            <li key={track.id}>
              <button
                type="button"
                className="picker__choice"
                onClick={() => {
                  onPick({ id: track.id, name: `${track.title} — ${track.artist}` });
                }}
              >
                <span className="picker__name">{track.title}</span>
                <span className="picker__meta muted">
                  {track.artist} <span className="numeric">{String(track.year)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PickerResults>
    </Overlay>
  );
}
