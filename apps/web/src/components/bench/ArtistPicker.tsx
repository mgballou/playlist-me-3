'use client';

/**
 * Picking an artist — an overlay, which is the right depth for it (§2.9).
 *
 * There is no artist-search call on `SpotifyClient`, so the candidates come out of a track
 * search and are counted by how many results credited them. That is a virtue rather than a
 * workaround: the picker can only offer acts the resolver could actually reach.
 */

import type { ArtistId } from '@pm/core';

import { findArtists } from '@/lib/actions/catalog';
import { useLookup } from '@/lib/workbench/use-lookup';
import { Overlay } from '@/components/primitives/Overlay';

export type ArtistPickerProps = {
  readonly title: string;
  readonly onPick: (choice: { readonly id: ArtistId; readonly name: string }) => void;
  readonly onClose: () => void;
};

export function ArtistPicker({ title, onPick, onClose }: ArtistPickerProps) {
  const lookup = useLookup(findArtists);

  return (
    <Overlay title={title} onClose={onClose}>
      <label className="field">
        <span className="field__label label">Search for an act</span>
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
        nothing="No act in the catalog matched those words. Try fewer of them."
      >
        <ul className="picker__list">
          {lookup.items.map((artist) => (
            <li key={artist.id}>
              <button
                type="button"
                className="picker__choice"
                onClick={() => {
                  onPick({ id: artist.id, name: artist.name });
                }}
              >
                <span className="picker__name">{artist.name}</span>
                <span className="picker__meta numeric muted">{String(artist.hits)} in results</span>
              </button>
            </li>
          ))}
        </ul>
      </PickerResults>
    </Overlay>
  );
}

/**
 * The three states a lookup can be in, each of which names what happens next (§2.7). Shared
 * by all three pickers so they cannot disagree about what "nothing found" looks like.
 */
export function PickerResults({
  query,
  looking,
  message,
  count,
  nothing,
  children,
}: {
  readonly query: string;
  readonly looking: boolean;
  readonly message: string | null;
  readonly count: number;
  readonly nothing: string;
  readonly children: React.ReactNode;
}) {
  if (message !== null) {
    return (
      <p className="picker__state" role="alert">
        {message}
      </p>
    );
  }
  if (query.trim().length === 0) {
    return <p className="picker__state muted">Type a few words to see what turns up.</p>;
  }
  if (looking) {
    return (
      <ul className="picker__list" aria-label="Searching">
        {Array.from({ length: 4 }, (_, index) => (
          <li key={index} className="picker__placeholder" />
        ))}
      </ul>
    );
  }
  if (count === 0) {
    return <p className="picker__state muted">{nothing}</p>;
  }
  return <>{children}</>;
}
