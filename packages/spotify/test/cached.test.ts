import { playlistId } from '@pm/core';
import { beforeEach, describe, expect, it } from 'vitest';

import type { CacheFactory, EntityCache, SpotifyClient } from '../src/index';
import {
  CachedSpotifyClient,
  FakeSpotifyClient,
  createMemoryCache,
  demoCatalog,
  memoryCacheFactory,
} from '../src/index';

/** One factory whose named stores outlive the client, which is what a session hands in. */
function sharedFactory(): CacheFactory {
  const stores = new Map<string, unknown>();
  return <T>(name: string): EntityCache<T> => {
    const held = stores.get(name);
    // The name decides the type at every call site, and no map signature can say so.
    if (held !== undefined) return held as EntityCache<T>;
    const made = createMemoryCache<T>();
    stores.set(name, made);
    return made;
  };
}

const LIBRARY = demoCatalog.savedTrackIds.length;
const OVER_THE_LIBRARY = LIBRARY + 100;

describe('reading the person twice', () => {
  let inner: FakeSpotifyClient;
  let client: SpotifyClient;

  beforeEach(() => {
    inner = new FakeSpotifyClient();
    client = new CachedSpotifyClient({ client: inner, caches: sharedFactory() });
  });

  it('asks Spotify once for the library', async () => {
    await client.getSavedTracks({ maxItems: OVER_THE_LIBRARY });
    await client.getSavedTracks({ maxItems: OVER_THE_LIBRARY });

    expect(inner.calls.filter((call) => call.method === 'getSavedTracks')).toHaveLength(1);
  });

  it('hands back the same library the second time', async () => {
    const once = await client.getSavedTracks({ maxItems: OVER_THE_LIBRARY });
    const twice = await client.getSavedTracks({ maxItems: OVER_THE_LIBRARY });

    expect(twice).toEqual(once);
  });

  it('counts the second read as a cache hit rather than a request', async () => {
    await client.getSavedTracks({ maxItems: OVER_THE_LIBRARY });
    await client.getSavedTracks({ maxItems: OVER_THE_LIBRARY });

    expect(inner.requests.snapshot().cacheHits).toBe(1);
  });

  it('keeps each top-tracks range apart', async () => {
    await client.getTopTracks('shortTerm', { maxItems: 10_000 });
    await client.getTopTracks('longTerm', { maxItems: 10_000 });

    expect(inner.calls.filter((call) => call.method === 'getTopTracks')).toHaveLength(2);
  });

  it('keeps each blocked playlist apart', async () => {
    const [first, second] = demoCatalog.playlists;
    if (first === undefined || second === undefined) throw new Error('too few playlists');
    await client.getPlaylistTracks(first.id, { maxItems: 10_000 });
    await client.getPlaylistTracks(second.id, { maxItems: 10_000 });

    expect(inner.calls.filter((call) => call.method === 'getPlaylistTracks')).toHaveLength(2);
  });

  it('asks once who the token belongs to', async () => {
    await client.currentUser();
    await client.currentUser();

    expect(inner.calls.filter((call) => call.method === 'currentUser')).toHaveLength(1);
  });

  it('forgets the playlist list once a new playlist exists', async () => {
    await client.getUserPlaylists({ maxItems: 10_000 });
    await client.createPlaylist({ name: 'Wednesday', isPublic: false });
    await client.getUserPlaylists({ maxItems: 10_000 });

    expect(inner.calls.filter((call) => call.method === 'getUserPlaylists')).toHaveLength(2);
  });
});

describe('what is never held', () => {
  let inner: FakeSpotifyClient;
  let client: SpotifyClient;

  beforeEach(() => {
    inner = new FakeSpotifyClient();
    client = new CachedSpotifyClient({ client: inner, caches: sharedFactory() });
  });

  it('reads a clipped library again', async () => {
    await client.getSavedTracks({ maxItems: 2 });
    await client.getSavedTracks({ maxItems: 2 });

    expect(inner.calls.filter((call) => call.method === 'getSavedTracks')).toHaveLength(2);
  });

  it('reads a list again when no ceiling was named', async () => {
    await client.getSavedTracks();
    await client.getSavedTracks();

    expect(inner.calls.filter((call) => call.method === 'getSavedTracks')).toHaveLength(2);
  });

  it('reads a failed playlist again', async () => {
    const missing = playlistId('pl-nothing-here');
    await expect(client.getPlaylistTracks(missing, { maxItems: 400 })).rejects.toThrow();
    await expect(client.getPlaylistTracks(missing, { maxItems: 400 })).rejects.toThrow();

    expect(inner.calls.filter((call) => call.method === 'getPlaylistTracks')).toHaveLength(2);
  });

  it('searches again every time', async () => {
    await client.searchTracks({ terms: 'kettle', limit: 10, offset: 0 });
    await client.searchTracks({ terms: 'kettle', limit: 10, offset: 0 });

    expect(inner.calls.filter((call) => call.method === 'searchTracks')).toHaveLength(2);
  });
});

describe('a store that does not outlive the client', () => {
  it('reads the library again, which is the behavior it replaces', async () => {
    const inner = new FakeSpotifyClient();
    const caches = memoryCacheFactory();
    const first = new CachedSpotifyClient({ client: inner, caches });
    const second = new CachedSpotifyClient({ client: inner, caches });

    await first.getSavedTracks({ maxItems: OVER_THE_LIBRARY });
    await second.getSavedTracks({ maxItems: OVER_THE_LIBRARY });

    expect(inner.calls.filter((call) => call.method === 'getSavedTracks')).toHaveLength(2);
  });
});
