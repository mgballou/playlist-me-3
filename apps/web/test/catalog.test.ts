import type { TrackId } from '@pm/core';
import type { DemoCatalog } from '@pm/spotify';
import { FakeSpotifyClient, KIDS_PLAYLIST_ID, demoCatalog } from '@pm/spotify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { lookupPlaylist } from '@/lib/actions/catalog';
import type { SpotifyHandle } from '@/lib/spotify/factory';

const held = vi.hoisted(() => {
  const state: { handle: SpotifyHandle | null } = { handle: null };
  return state;
});

vi.mock('@/lib/spotify/server', () => ({
  getSpotifyHandle: () => Promise.resolve(held.handle),
}));

const allTrackIds: readonly TrackId[] = demoCatalog.albums.flatMap((album) =>
  album.tracks.map((track) => track.id),
);

function clientWithKidsPlaylistOf(length: number): FakeSpotifyClient {
  const catalog: DemoCatalog = {
    ...demoCatalog,
    playlists: demoCatalog.playlists.map((list) =>
      list.id === KIDS_PLAYLIST_ID ? { ...list, trackIds: allTrackIds.slice(0, length) } : list,
    ),
  };
  return new FakeSpotifyClient({ catalog });
}

describe('a pasted playlist link', () => {
  let client: FakeSpotifyClient;

  beforeEach(() => {
    client = clientWithKidsPlaylistOf(900);
    held.handle = { mode: 'live', client };
  });

  it('names the whole length of a long list', async () => {
    const found = await lookupPlaylist(KIDS_PLAYLIST_ID);
    expect(found.ok ? found.items[0]?.trackCount : null).toBe(900);
  });

  it('learns that length from one request', async () => {
    await lookupPlaylist(KIDS_PLAYLIST_ID);
    expect(client.requests.snapshot().total).toBe(1);
  });
});
