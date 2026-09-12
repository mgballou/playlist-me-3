/**
 * The demo catalog, served in Spotify's own JSON shapes over a stubbed `fetch`.
 *
 * `FakeSpotifyClient` answers the client *interface*; this answers the *wire*, so the whole
 * live path runs — paging, the schemas, the caches, the limiter — against invented data and
 * no network. It is what lets a request count be measured on the code the app actually runs
 * in a live session, which the fake cannot do because it never makes a request.
 *
 * Every call is recorded. Nothing here is real: the catalog is `@pm/spotify`'s synthetic one.
 */

import { artistId } from '@pm/core';
import type { FetchLike, FetchResponse, FixtureAlbum } from '@pm/spotify';
import { PAGE_MAX_LIMIT, demoCatalog } from '@pm/spotify';

const BASE = 'https://api.stub/v1';

type Json = Record<string, unknown>;

const artistsById = new Map(demoCatalog.artists.map((artist) => [artist.id as string, artist]));
const albumsById = new Map(demoCatalog.albums.map((album) => [album.id as string, album]));

const albumByTrackId = new Map<string, FixtureAlbum>();
for (const album of demoCatalog.albums) {
  for (const track of album.tracks) albumByTrackId.set(track.id, album);
}

function artistRefs(ids: readonly string[]): readonly Json[] {
  return ids.flatMap((id) => {
    const artist = artistsById.get(id);
    return artist === undefined ? [] : [{ id: artist.id, name: artist.name }];
  });
}

function albumJson(album: FixtureAlbum): Json {
  return {
    id: album.id,
    name: album.title,
    release_date: album.releaseDate,
    total_tracks: album.tracks.length,
    artists: artistRefs(album.artistIds),
    album_type: album.group,
  };
}

function simplifiedTrackJson(album: FixtureAlbum, index: number): Json {
  const track = album.tracks[index];
  if (track === undefined) throw new Error(`no track ${String(index)} on ${album.id}`);
  return {
    id: track.id,
    name: track.title,
    artists: artistRefs(track.artistIds),
    duration_ms: track.durationMs,
    explicit: track.explicit,
    track_number: track.trackNumber,
  };
}

function trackJson(id: string): Json | null {
  const album = albumByTrackId.get(id);
  if (album === undefined) return null;
  const index = album.tracks.findIndex((track) => track.id === id);
  return { ...simplifiedTrackJson(album, index), album: albumJson(album) };
}

function tracksJson(ids: readonly string[]): readonly Json[] {
  return ids.flatMap((id) => {
    const track = trackJson(id);
    return track === null ? [] : [track];
  });
}

/** One page of a list, with the `total` Spotify sends alongside it. */
function page(items: readonly Json[], limit: number, offset: number, total: number): Json {
  return { items: items.slice(offset, offset + limit), limit, offset, total, next: null };
}

/** The groups each `include_groups` value asks for, and whether guest credits count. */
function albumsForArtist(raw: string, includeGroups: string): readonly FixtureAlbum[] {
  const id = artistId(raw);
  const groups = new Set(includeGroups.split(','));
  const own = demoCatalog.albums.filter(
    (album) => album.artistIds.includes(id) && groups.has(album.group),
  );
  if (!groups.has('appears_on')) return own;

  const guested = demoCatalog.albums.filter(
    (album) =>
      !album.artistIds.includes(id) && album.tracks.some((track) => track.artistIds.includes(id)),
  );
  return [...own, ...guested];
}

export type SpotifyStub = {
  readonly fetchImpl: FetchLike;
  readonly baseUrl: string;
  /** Every request the stub answered, newest last. */
  readonly calls: readonly string[];
};

export function spotifyStub(): SpotifyStub {
  const calls: string[] = [];

  const fetchImpl: FetchLike = (raw: string) => {
    calls.push(raw);
    const url = new URL(raw);
    const path = url.pathname.replace('/v1', '');
    const limit = Number(url.searchParams.get('limit') ?? String(PAGE_MAX_LIMIT));
    const offset = Number(url.searchParams.get('offset') ?? '0');

    const response: FetchResponse = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: () => Promise.resolve(body(path, url, limit, offset)),
      text: () => Promise.resolve(''),
    };
    return Promise.resolve(response);
  };

  return { fetchImpl, baseUrl: BASE, calls };
}

function body(path: string, url: URL, limit: number, offset: number): Json {
  const albums = /^\/artists\/([^/]+)\/albums$/.exec(path);
  if (albums?.[1] !== undefined) {
    const found = albumsForArtist(albums[1], url.searchParams.get('include_groups') ?? 'album');
    return page(found.map(albumJson), limit, offset, found.length);
  }

  const artist = /^\/artists\/([^/]+)$/.exec(path);
  if (artist?.[1] !== undefined) {
    const found = artistsById.get(artist[1]);
    if (found === undefined) return { id: artist[1], name: 'Unknown', genres: [] };
    return { id: found.id, name: found.name, genres: [...found.genres] };
  }

  const albumTracks = /^\/albums\/([^/]+)\/tracks$/.exec(path);
  if (albumTracks?.[1] !== undefined) {
    const found = albumsById.get(albumTracks[1]);
    if (found === undefined) return page([], limit, offset, 0);
    const items = found.tracks.map((_track, index) => simplifiedTrackJson(found, index));
    return page(items, limit, offset, items.length);
  }

  const album = /^\/albums\/([^/]+)$/.exec(path);
  if (album?.[1] !== undefined) {
    const found = albumsById.get(album[1]);
    return found === undefined ? {} : albumJson(found);
  }

  const playlistItems = /^\/playlists\/([^/]+)\/items$/.exec(path);
  if (playlistItems?.[1] !== undefined) {
    const found = demoCatalog.playlists.find((list) => list.id === playlistItems[1]);
    const items = tracksJson(found?.trackIds ?? []).map((track) => ({ track }));
    return page(items, limit, offset, items.length);
  }

  if (path === '/me/tracks') {
    const items = tracksJson(demoCatalog.savedTrackIds).map((track) => ({ track }));
    return page(items, limit, offset, items.length);
  }

  if (path === '/me/top/tracks') {
    const items = tracksJson(demoCatalog.topTrackIds.mediumTerm);
    return page(items, limit, offset, items.length);
  }

  if (path === '/me/player/recently-played') {
    return { items: tracksJson(demoCatalog.recentlyPlayedTrackIds).map((track) => ({ track })) };
  }

  if (path === '/me/following') {
    const after = url.searchParams.get('after');
    const ids = demoCatalog.followedArtistIds;
    const start = after === null ? 0 : ids.indexOf(after as (typeof ids)[number]) + 1;
    const slice = ids.slice(start, start + limit);
    const last = slice.at(-1);
    return {
      artists: {
        items: slice.flatMap((id) => {
          const found = artistsById.get(id);
          return found === undefined ? [] : [{ id, name: found.name, genres: [...found.genres] }];
        }),
        cursors: { after: start + slice.length >= ids.length ? null : last },
      },
    };
  }

  if (path === '/me/playlists') {
    const items = demoCatalog.playlists.map((list) => ({
      id: list.id,
      name: list.name,
      tracks: { total: list.trackIds.length },
    }));
    return page(items, limit, offset, items.length);
  }

  if (path === '/me') {
    return { id: demoCatalog.user.id, display_name: demoCatalog.user.displayName };
  }

  throw new Error(`the stub has no answer for ${path}`);
}
