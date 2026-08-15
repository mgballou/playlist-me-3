'use server';

/**
 * The pickers' half of the network. Turning a person's words into an id the recipe can hold
 * is impure and holds a token, so it lives here beside `resolve` rather than in a component.
 *
 * **The playlist picker lists, and takes a link as well.** `getUserPlaylists` (spec §5.1)
 * answers `GET /me/playlists` in a live session and the seeded catalog in demo mode, so the
 * headline exclusion — never anything off Kids Jams — is one click away either way (§2.3).
 * The paste path stays because listing only reaches the playlists a person owns or follows,
 * and a public list they do neither with is a fair thing to exclude.
 *
 * Artists and tracks have no dedicated search endpoint on this client, so both are derived
 * from `searchTracks` — which is what the resolver uses, so a picker can never offer an
 * artist the resolver could not then reach.
 */

import type { ArtistId, PlaylistId } from '@pm/core';
import { playlistId } from '@pm/core';
import { SEARCH_MAX_LIMIT, SpotifyError, demoCatalog } from '@pm/spotify';

import { getSpotifyHandle } from '../spotify/server';
import type {
  ArtistChoice,
  CatalogLookup,
  PlaylistChoice,
  TrackChoice,
} from '../workbench/catalog';

/** Two pages of ten is enough to name a thing without spending the budget on a picker. */
const PICKER_PAGES = 2;

function failed(cause: unknown): { readonly ok: false; readonly message: string } {
  return {
    ok: false,
    message: cause instanceof SpotifyError ? cause.message : 'That lookup did not reach Spotify.',
  };
}

export async function findArtists(query: string): Promise<CatalogLookup<ArtistChoice>> {
  const terms = query.trim();
  if (terms.length === 0) return { ok: true, items: [] };

  try {
    const handle = await getSpotifyHandle();
    const counts = new Map<ArtistId, { readonly name: string; hits: number }>();

    for (let page = 0; page < PICKER_PAGES; page += 1) {
      const found = await handle.client.searchTracks({
        terms,
        limit: SEARCH_MAX_LIMIT,
        offset: page * SEARCH_MAX_LIMIT,
      });
      for (const track of found.items) {
        for (const artist of track.artists) {
          const held = counts.get(artist.id);
          if (held === undefined) counts.set(artist.id, { name: artist.name, hits: 1 });
          else held.hits += 1;
        }
      }
      if (found.nextOffset === null) break;
    }

    const items = [...counts.entries()]
      .map(([id, entry]) => ({ id, name: entry.name, hits: entry.hits }))
      .sort((a, b) => b.hits - a.hits || a.name.localeCompare(b.name));

    return { ok: true, items };
  } catch (cause) {
    return failed(cause);
  }
}

export async function findTracks(query: string): Promise<CatalogLookup<TrackChoice>> {
  const terms = query.trim();
  if (terms.length === 0) return { ok: true, items: [] };

  try {
    const handle = await getSpotifyHandle();
    const found = await handle.client.searchTracks({
      terms,
      limit: SEARCH_MAX_LIMIT,
      offset: 0,
    });
    return {
      ok: true,
      items: found.items.map((track) => ({
        id: track.id,
        title: track.title,
        artist: track.artists.map((artist) => artist.name).join(', '),
        year: track.releaseYear,
      })),
    };
  } catch (cause) {
    return failed(cause);
  }
}

/**
 * Naming a playlist costs nothing — `tracks.total` comes back with the name, and reading the
 * tracks themselves is the request the exclusion pays for later (§3.1). One ceiling, because
 * a person with four hundred playlists should not spend eight requests opening a picker.
 */
const PICKER_PLAYLISTS = 200;

/** Everything the person owns or follows. Demo mode answers from the seeded catalog. */
export async function listMyPlaylists(): Promise<CatalogLookup<PlaylistChoice>> {
  try {
    const handle = await getSpotifyHandle();
    const lists = await handle.client.getUserPlaylists({ maxItems: PICKER_PLAYLISTS });
    return { ok: true, items: lists };
  } catch (cause) {
    return failed(cause);
  }
}

/**
 * A link, a URI or a bare id, confirmed by reading the thing. The read costs a request and
 * it is the same one the source or the exclusion would have spent anyway (§3.1).
 */
export async function lookupPlaylist(reference: string): Promise<CatalogLookup<PlaylistChoice>> {
  const id = parsePlaylistReference(reference);
  if (id === null) {
    return { ok: false, message: 'That is not a playlist link, URI or id.' };
  }

  try {
    const handle = await getSpotifyHandle();
    const tracks = await handle.client.getPlaylistTracks(id, { maxItems: 400 });
    const known = demoCatalog.playlists.find((list) => list.id === id);
    return {
      ok: true,
      items: [{ id, name: known?.name ?? id, trackCount: tracks.length }],
    };
  } catch (cause) {
    return failed(cause);
  }
}

/**
 * `https://open.spotify.com/playlist/{id}`, `spotify:playlist:{id}`, or the id itself.
 * Validated and normalized at the boundary, and the field that failed is named (§10).
 */
function parsePlaylistReference(reference: string): PlaylistId | null {
  const trimmed = reference.trim();
  if (trimmed.length === 0) return null;

  const uri = /^spotify:playlist:([A-Za-z0-9-]+)$/.exec(trimmed);
  if (uri?.[1] !== undefined) return playlistId(uri[1]);

  const url = /playlist\/([A-Za-z0-9-]+)/.exec(trimmed);
  if (url?.[1] !== undefined) return playlistId(url[1]);

  return /^[A-Za-z0-9-]+$/.test(trimmed) ? playlistId(trimmed) : null;
}
