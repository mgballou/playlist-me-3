import type { PlaylistId, TrackId } from '@pm/core';
import { artistId, reject } from '@pm/core';
import type { CatalogTrack, DemoCatalog, ListOptions, ListSlice } from '@pm/spotify';
import { FakeSpotifyClient, KIDS_PLAYLIST_ID, demoCatalog } from '@pm/spotify';
import { describe, expect, it } from 'vitest';

import { CONTEXT_LIMITS, resolveContext } from '@/lib/workbench/context';
import { toEngineContext } from '@/lib/workbench/resolve-request';

const allTrackIds: readonly TrackId[] = demoCatalog.albums.flatMap((album) =>
  album.tracks.map((track) => track.id),
);

const BLOCKED = allTrackIds.slice(0, 1_100);

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
    expect(payload.playlists[0]?.coverage).toEqual({
      kind: 'clipped',
      read: CONTEXT_LIMITS.playlistTracks,
      total: BLOCKED.length,
    });
  });

  it('still lets every track past the ceiling onto the deck', async () => {
    const payload = await resolveContext(client(), request);
    const { kept } = reject({
      pool: poolOf(BLOCKED),
      exclusions: [{ kind: 'playlist', playlistId: KIDS_PLAYLIST_ID }],
      context: toEngineContext(payload),
    });
    expect(kept).toHaveLength(BLOCKED.length - CONTEXT_LIMITS.playlistTracks);
  });

  it('carries the shortfall onto the removal the deck reports', async () => {
    const payload = await resolveContext(client(), request);
    const { report } = reject({
      pool: poolOf(BLOCKED),
      exclusions: [{ kind: 'playlist', playlistId: KIDS_PLAYLIST_ID }],
      context: toEngineContext(payload),
    });
    expect(report.removals[0]?.coverage).toEqual({
      kind: 'clipped',
      read: CONTEXT_LIMITS.playlistTracks,
      total: BLOCKED.length,
    });
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
    const catalog: DemoCatalog = { ...demoCatalog, savedTrackIds: allTrackIds.slice(0, 1_100) };
    const payload = await resolveContext(new FakeSpotifyClient({ catalog }), {
      sources: [],
      excludedPlaylistIds: [],
    });
    expect(payload.coverage.libraryTrackIds).toEqual({
      kind: 'clipped',
      read: CONTEXT_LIMITS.savedTracks,
      total: 1_100,
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

const nobodyBlocked = { sources: [], excludedPlaylistIds: [] as readonly PlaylistId[] };

describe('where the ceilings sit', () => {
  it('reads a nine-hundred track blocked playlist whole', async () => {
    const catalog: DemoCatalog = {
      ...demoCatalog,
      playlists: demoCatalog.playlists.map((list) =>
        list.id === KIDS_PLAYLIST_ID ? { ...list, trackIds: allTrackIds.slice(0, 900) } : list,
      ),
    };
    const payload = await resolveContext(new FakeSpotifyClient({ catalog }), request);
    expect(payload.playlists[0]?.coverage).toEqual({ kind: 'whole', read: 900 });
  });

  it('stops a blocked playlist at a thousand tracks', async () => {
    const payload = await resolveContext(
      new FakeSpotifyClient({ catalog: catalogWithBigKidsPlaylist() }),
      request,
    );
    expect(payload.playlists[0]?.trackIds).toHaveLength(1_000);
  });

  it('stops the library at a thousand tracks', async () => {
    const catalog: DemoCatalog = { ...demoCatalog, savedTrackIds: allTrackIds.slice(0, 1_100) };
    const payload = await resolveContext(new FakeSpotifyClient({ catalog }), nobodyBlocked);
    expect(payload.libraryTrackIds).toHaveLength(1_000);
  });

  it('stops the follows at a thousand acts', async () => {
    const catalog: DemoCatalog = {
      ...demoCatalog,
      followedArtistIds: Array.from({ length: 1_100 }, (_, at) => artistId(`ar-follow-${at}`)),
    };
    const payload = await resolveContext(new FakeSpotifyClient({ catalog }), nobodyBlocked);
    expect(payload.coverage.followedArtistIds).toEqual({
      kind: 'clipped',
      read: 1_000,
      total: 1_100,
    });
  });

  it('spends twenty requests on a set that reaches its ceiling', async () => {
    const catalog: DemoCatalog = { ...demoCatalog, savedTrackIds: allTrackIds.slice(0, 1_100) };
    const client = new FakeSpotifyClient({ catalog });
    await resolveContext(client, nobodyBlocked);
    expect(client.requests.snapshot().byEndpoint.get('getSavedTracks')).toBe(20);
  });

  it('spends no more than it did on a library under the old ceiling', async () => {
    const catalog: DemoCatalog = { ...demoCatalog, savedTrackIds: allTrackIds.slice(0, 150) };
    const client = new FakeSpotifyClient({ catalog });
    await resolveContext(client, nobodyBlocked);
    expect(client.requests.snapshot().byEndpoint.get('getSavedTracks')).toBe(3);
  });
});

describe('the wait a resolve pays for the person', () => {
  it('starts a blocked playlist before the library has finished', async () => {
    const events: string[] = [];

    class SlowLibraryClient extends FakeSpotifyClient {
      override async getSavedTracks(options?: ListOptions): Promise<ListSlice<CatalogTrack>> {
        await new Promise((resolve) => setTimeout(resolve, 0));
        const read = await super.getSavedTracks(options);
        events.push('library read');
        return read;
      }

      override async getPlaylistTracks(
        id: PlaylistId,
        options?: ListOptions,
      ): Promise<ListSlice<CatalogTrack>> {
        events.push('playlist asked for');
        return super.getPlaylistTracks(id, options);
      }
    }

    await resolveContext(new SlowLibraryClient(), request);
    expect(events).toEqual(['playlist asked for', 'library read']);
  });
});
