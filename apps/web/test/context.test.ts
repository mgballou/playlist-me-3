import type { PlaylistId, TrackId } from '@pm/core';
import { reject } from '@pm/core';
import type { DemoCatalog } from '@pm/spotify';
import { FakeSpotifyClient, KIDS_PLAYLIST_ID, demoCatalog } from '@pm/spotify';
import { describe, expect, it } from 'vitest';

import { CONTEXT_LIMITS, resolveContext } from '@/lib/workbench/context';
import { toEngineContext } from '@/lib/workbench/resolve-request';

const allTrackIds: readonly TrackId[] = demoCatalog.albums.flatMap((album) =>
  album.tracks.map((track) => track.id),
);

const BLOCKED = allTrackIds.slice(0, 900);

function catalogWithBigKidsPlaylist(): DemoCatalog {
  return {
    ...demoCatalog,
    playlists: demoCatalog.playlists.map((list) =>
      list.id === KIDS_PLAYLIST_ID ? { ...list, trackIds: BLOCKED } : list,
    ),
  };
}

function poolOf(ids: readonly TrackId[]) {
  const byId = new Map(
    demoCatalog.albums.flatMap((album) =>
      album.tracks.map((track) => [track.id, { album, track }]),
    ),
  );
  return ids.flatMap((id) => {
    const held = byId.get(id);
    if (held === undefined) return [];
    return [
      {
        id: held.track.id,
        title: held.track.title,
        artists: held.track.artistIds.map((artist) => ({ id: artist, name: artist })),
        album: { id: held.album.id, title: held.album.title },
        releaseYear: held.album.releaseYear,
        durationMs: held.track.durationMs,
        explicit: held.track.explicit,
        trackNumber: held.track.trackNumber,
        albumTrackCount: held.album.tracks.length,
        artistGenres: [],
        sourceIndex: 0,
      },
    ];
  });
}

const request = { sources: [], excludedPlaylistIds: [KIDS_PLAYLIST_ID] as readonly PlaylistId[] };

describe('a blocked playlist longer than the ceiling', () => {
  const client = () => new FakeSpotifyClient({ catalog: catalogWithBigKidsPlaylist() });

  it('reads only as far as the ceiling', async () => {
    const payload = await resolveContext(client(), request);
    expect(payload.playlists[0]?.trackIds).toHaveLength(CONTEXT_LIMITS.playlistTracks);
  });

  it('says the read was clipped, and against what', async () => {
    const payload = await resolveContext(client(), request);
    expect(payload.playlists[0]?.coverage).toEqual({ kind: 'clipped', read: 400, total: 900 });
  });

  it('still lets every track past the ceiling onto the deck', async () => {
    const payload = await resolveContext(client(), request);
    const { kept } = reject({
      pool: poolOf(BLOCKED),
      exclusions: [{ kind: 'playlist', playlistId: KIDS_PLAYLIST_ID }],
      context: toEngineContext(payload),
    });
    expect(kept).toHaveLength(500);
  });

  it('carries the shortfall onto the removal the deck reports', async () => {
    const payload = await resolveContext(client(), request);
    const { report } = reject({
      pool: poolOf(BLOCKED),
      exclusions: [{ kind: 'playlist', playlistId: KIDS_PLAYLIST_ID }],
      context: toEngineContext(payload),
    });
    expect(report.removals[0]?.coverage).toEqual({ kind: 'clipped', read: 400, total: 900 });
  });
});

describe('a playlist that could not be read', () => {
  const missing = 'pl-gone' as PlaylistId;

  it('is unread rather than empty', async () => {
    const payload = await resolveContext(new FakeSpotifyClient(), {
      sources: [],
      excludedPlaylistIds: [missing],
    });
    expect(payload.playlists[0]?.coverage).toEqual({ kind: 'unread' });
  });

  it('reaches the removal as a failed read, not as a clean pass', async () => {
    const payload = await resolveContext(new FakeSpotifyClient(), {
      sources: [],
      excludedPlaylistIds: [missing],
    });
    const { report } = reject({
      pool: poolOf(BLOCKED),
      exclusions: [{ kind: 'playlist', playlistId: missing }],
      context: toEngineContext(payload),
    });
    expect(report.removals[0]?.coverage).toEqual({ kind: 'unread' });
  });
});

describe('the four sets read off the person', () => {
  it('reports the library against its true length', async () => {
    const catalog: DemoCatalog = { ...demoCatalog, savedTrackIds: allTrackIds.slice(0, 600) };
    const payload = await resolveContext(new FakeSpotifyClient({ catalog }), {
      sources: [],
      excludedPlaylistIds: [],
    });
    expect(payload.coverage.libraryTrackIds).toEqual({
      kind: 'clipped',
      read: CONTEXT_LIMITS.savedTracks,
      total: 600,
    });
  });

  it('calls a library shorter than its ceiling whole', async () => {
    const catalog: DemoCatalog = { ...demoCatalog, savedTrackIds: allTrackIds.slice(0, 12) };
    const payload = await resolveContext(new FakeSpotifyClient({ catalog }), {
      sources: [],
      excludedPlaylistIds: [],
    });
    expect(payload.coverage.libraryTrackIds).toEqual({ kind: 'whole', read: 12 });
  });

  it('leaves recently played unmeasured when it fills the ceiling', async () => {
    const catalog: DemoCatalog = {
      ...demoCatalog,
      recentlyPlayedTrackIds: allTrackIds.slice(0, 120),
    };
    const payload = await resolveContext(new FakeSpotifyClient({ catalog }), {
      sources: [],
      excludedPlaylistIds: [],
    });
    expect(payload.coverage.recentlyHeardTrackIds).toEqual({
      kind: 'unmeasured',
      read: CONTEXT_LIMITS.recentlyPlayed,
    });
  });
});
