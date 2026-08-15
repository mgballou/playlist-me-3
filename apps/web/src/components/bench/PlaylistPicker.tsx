'use client';

/**
 * Picking a playlist. This one backs the headline feature — *never anything off Kids Jams*
 * (spec §2.3) — so it is the picker that most has to work.
 *
 * It lists first. `getUserPlaylists` reads `GET /me/playlists` in a live session and the
 * seeded catalog in demo mode, so the thing a person wants to exclude is almost always one
 * click away rather than a link they have to go and fetch.
 *
 * Pasting a link stays underneath it, because listing only reaches what a person owns or
 * follows and a public playlist they do neither with is a fair thing to exclude. It is also
 * the way out when the listing fails, so it is offered even then rather than leaving the
 * overlay with nothing in it (§2.7).
 *
 * Reading a playlist costs a request either way — that is the one exclusion that is not
 * free, and §3.1 says the UI states it rather than hiding it.
 */

import type { PlaylistId } from '@pm/core';
import { format } from '@pm/core';
import { useEffect, useState } from 'react';

import { listMyPlaylists, lookupPlaylist } from '@/lib/actions/catalog';
import type { PlaylistChoice } from '@/lib/workbench/catalog';
import { Overlay } from '@/components/primitives/Overlay';

export type PlaylistPickerProps = {
  readonly title: string;
  readonly onPick: (choice: { readonly id: PlaylistId; readonly name: string }) => void;
  readonly onClose: () => void;
};

export function PlaylistPicker({ title, onPick, onClose }: PlaylistPickerProps) {
  const [items, setItems] = useState<readonly PlaylistChoice[] | null>(null);
  const [reference, setReference] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listMyPlaylists().then((listed) => {
      if (cancelled) return;
      setItems(listed.ok ? listed.items : []);
      if (!listed.ok) setMessage(listed.message);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const confirm = (): void => {
    setLooking(true);
    setMessage(null);
    void lookupPlaylist(reference).then((found) => {
      setLooking(false);
      if (!found.ok) {
        setMessage(found.message);
        return;
      }
      const first = found.items[0];
      if (first === undefined) {
        setMessage('That playlist has nothing on it.');
        return;
      }
      onPick({ id: first.id, name: first.name });
    });
  };

  return (
    <Overlay title={title} onClose={onClose}>
      <p className="picker__note muted">
        Reading a playlist is the one thing here that costs a request. It is the only way to answer
        “never anything off this list”.
      </p>

      {items === null ? (
        <ul className="picker__list" aria-label="Loading playlists">
          {Array.from({ length: 3 }, (_, index) => (
            <li key={index} className="picker__placeholder" />
          ))}
        </ul>
      ) : items.length === 0 ? (
        <p className="picker__state muted">
          Nothing to list. Paste a link to any playlist you can open in Spotify.
        </p>
      ) : (
        <ul className="picker__list" aria-label="Your playlists">
          {items.map((list) => (
            <li key={list.id}>
              <button
                type="button"
                className="picker__choice"
                onClick={() => {
                  onPick({ id: list.id, name: list.name });
                }}
              >
                <span className="picker__name">{list.name}</span>
                <span className="picker__meta numeric muted">
                  {format({ kind: 'trackCount', count: list.trackCount })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="picker__form picker__fallback"
        onSubmit={(event) => {
          event.preventDefault();
          confirm();
        }}
      >
        <label className="field">
          <span className="field__label label">Or a playlist link, URI or id</span>
          <input
            className="field__input"
            type="text"
            value={reference}
            autoComplete="off"
            placeholder="https://open.spotify.com/playlist/…"
            onChange={(event) => {
              setReference(event.currentTarget.value);
            }}
          />
        </label>
        <p className="picker__note muted">
          For a playlist somebody else keeps — the list above holds only what you own or follow.
        </p>
        <button type="submit" className="act--secondary" disabled={looking}>
          {looking ? 'Reading…' : 'Use this playlist'}
        </button>
      </form>

      {message === null ? null : (
        <p className="picker__state" role="alert">
          {message}
        </p>
      )}
    </Overlay>
  );
}
