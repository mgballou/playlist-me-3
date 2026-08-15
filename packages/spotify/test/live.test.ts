import { albumId, artistId, playlistId, trackId } from '@pm/core';
import { describe, expect, it } from 'vitest';

import type { FetchInit, FetchLike, FetchResponse, LiveSpotifyClientOptions } from '../src/index';
import {
  AuthFailed,
  InvalidRequest,
  LiveSpotifyClient,
  MalformedResponse,
  NotFound,
  QuotaExceeded,
  RateLimited,
  RequestFailed,
} from '../src/index';
import {
  albumPayload,
  artistPayload,
  pagePayload,
  trackPayload,
  userPlaylistPayload,
} from './payloads';

type Reply = {
  readonly status?: number;
  readonly json?: unknown;
  readonly headers?: Record<string, string>;
  readonly throws?: Error;
  readonly badJson?: boolean;
};

type Call = { readonly url: string; readonly init: FetchInit };

type Harness = {
  readonly client: LiveSpotifyClient;
  readonly calls: readonly Call[];
  readonly naps: readonly number[];
};

function harness(
  handler: (url: string, index: number) => Reply,
  options: Partial<LiveSpotifyClientOptions> = {},
): Harness {
  const calls: Call[] = [];
  const naps: number[] = [];

  const fetchImpl: FetchLike = (url, init) => {
    const reply = handler(url, calls.length);
    calls.push({ url, init });
    if (reply.throws !== undefined) return Promise.reject(reply.throws);

    const response: FetchResponse = {
      ok: (reply.status ?? 200) < 400,
      status: reply.status ?? 200,
      headers: { get: (name) => reply.headers?.[name.toLowerCase()] ?? null },
      json: () =>
        reply.badJson === true
          ? Promise.reject(new Error('not json'))
          : Promise.resolve(reply.json ?? {}),
      text: () => Promise.resolve(JSON.stringify(reply.json ?? {})),
    };
    return Promise.resolve(response);
  };

  const client = new LiveSpotifyClient({
    getToken: () => 'token-abc',
    fetch: fetchImpl,
    baseUrl: 'https://api.test/v1',
    sleep: (ms) => {
      naps.push(ms);
      return Promise.resolve();
    },
    ...options,
  });

  return { client, calls, naps };
}

const okArtist: Reply = { json: artistPayload() };

function queryOf(url: string | undefined): string {
  return url === undefined ? '' : (new URL(url).searchParams.get('q') ?? '');
}

describe('requests', () => {
  it('sends the token the provider hands over', async () => {
    const test = harness(() => okArtist);
    await test.client.getArtist(artistId('ar-101'));
    expect(test.calls[0]?.init.headers.Authorization).toBe('Bearer token-abc');
  });

  it('asks the provider again on the next request', async () => {
    const tokens = ['first', 'second'];
    const test = harness(() => okArtist, { getToken: () => tokens.shift() ?? 'exhausted' });
    await test.client.getArtist(artistId('ar-101'));
    await test.client.getArtist(artistId('ar-102'));
    expect(test.calls[1]?.init.headers.Authorization).toBe('Bearer second');
  });

  it('refuses to send an empty token', async () => {
    const test = harness(() => okArtist, { getToken: () => '' });
    await expect(test.client.getArtist(artistId('ar-101'))).rejects.toBeInstanceOf(AuthFailed);
  });

  it('builds the url from the base and the path', async () => {
    const test = harness(() => okArtist);
    await test.client.getArtist(artistId('ar-101'));
    expect(test.calls[0]?.url).toBe('https://api.test/v1/artists/ar-101');
  });
});

describe('rate limiting', () => {
  it('waits exactly as long as Retry-After says', async () => {
    const test = harness((_url, index) =>
      index === 0 ? { status: 429, headers: { 'retry-after': '3' } } : okArtist,
    );
    await test.client.getArtist(artistId('ar-101'));
    expect(test.naps).toEqual([3000]);
  });

  it('succeeds after the wait', async () => {
    const test = harness((_url, index) =>
      index === 0 ? { status: 429, headers: { 'retry-after': '1' } } : okArtist,
    );
    await expect(test.client.getArtist(artistId('ar-101'))).resolves.toHaveProperty(
      'name',
      'Velvet Kettle',
    );
  });

  it('defaults to a second when Retry-After is missing', async () => {
    const test = harness((_url, index) => (index === 0 ? { status: 429 } : okArtist));
    await test.client.getArtist(artistId('ar-101'));
    expect(test.naps).toEqual([1000]);
  });

  it('gives up after the retry budget', async () => {
    const test = harness(() => ({ status: 429, headers: { 'retry-after': '1' } }));
    await expect(test.client.getArtist(artistId('ar-101'))).rejects.toBeInstanceOf(RateLimited);
  });

  it('reports rather than sleeps through an unreasonable Retry-After', async () => {
    const test = harness(() => ({ status: 429, headers: { 'retry-after': '900' } }));
    await expect(test.client.getArtist(artistId('ar-101'))).rejects.toBeInstanceOf(RateLimited);
  });

  it('does not sleep at all when the wait is unreasonable', async () => {
    const test = harness(() => ({ status: 429, headers: { 'retry-after': '900' } }));
    await test.client.getArtist(artistId('ar-101')).catch(() => undefined);
    expect(test.naps).toEqual([]);
  });

  it('carries the wait on the error', async () => {
    const test = harness(() => ({ status: 429, headers: { 'retry-after': '42' } }));
    const error = await test.client.getArtist(artistId('ar-101')).catch((cause: unknown) => cause);
    expect(error instanceof RateLimited ? error.retryAfterSeconds : 0).toBe(42);
  });
});

describe('quota', () => {
  it('surfaces its own error for a 429 that names a spent quota', async () => {
    const test = harness(() => ({
      status: 429,
      json: { error: { status: 429, message: 'no', reason: 'QUOTA_EXCEEDED' } },
    }));
    await expect(test.client.getArtist(artistId('ar-101'))).rejects.toBeInstanceOf(QuotaExceeded);
  });

  it('does not retry a spent quota', async () => {
    const test = harness(() => ({
      status: 429,
      headers: { 'retry-after': '1' },
      json: { error: { status: 429, reason: 'QUOTA_EXCEEDED' } },
    }));
    await test.client.getArtist(artistId('ar-101')).catch(() => undefined);
    expect(test.calls).toHaveLength(1);
  });

  it('does not sleep on a spent quota', async () => {
    const test = harness(() => ({
      status: 429,
      headers: { 'retry-after': '1' },
      json: { error: { status: 429, reason: 'QUOTA_EXCEEDED' } },
    }));
    await test.client.getArtist(artistId('ar-101')).catch(() => undefined);
    expect(test.naps).toEqual([]);
  });

  it('recognises a spent quota behind a 403 too', async () => {
    const test = harness(() => ({
      status: 403,
      json: { error: { status: 403, reason: 'QUOTA_EXCEEDED' } },
    }));
    await expect(test.client.getArtist(artistId('ar-101'))).rejects.toBeInstanceOf(QuotaExceeded);
  });

  it('says it is not retryable', async () => {
    const test = harness(() => ({ status: 429, json: { error: { reason: 'QUOTA_EXCEEDED' } } }));
    const error = await test.client.getArtist(artistId('ar-101')).catch((cause: unknown) => cause);
    expect(error instanceof QuotaExceeded ? error.retryable : true).toBe(false);
  });
});

describe('other failures', () => {
  it('reports a rejected token', async () => {
    const test = harness(() => ({ status: 401 }));
    await expect(test.client.getArtist(artistId('ar-101'))).rejects.toBeInstanceOf(AuthFailed);
  });

  it('reports a missing entity', async () => {
    const test = harness(() => ({ status: 404 }));
    await expect(test.client.getArtist(artistId('ar-999'))).rejects.toBeInstanceOf(NotFound);
  });

  it('retries a server error', async () => {
    const test = harness((_url, index) => (index === 0 ? { status: 503 } : okArtist));
    await test.client.getArtist(artistId('ar-101'));
    expect(test.calls).toHaveLength(2);
  });

  it('gives up on a server error that will not clear', async () => {
    const test = harness(() => ({ status: 503 }));
    await expect(test.client.getArtist(artistId('ar-101'))).rejects.toBeInstanceOf(RequestFailed);
  });

  it('retries a transport failure', async () => {
    const test = harness((_url, index) =>
      index === 0 ? { throws: new Error('socket hang up') } : okArtist,
    );
    await test.client.getArtist(artistId('ar-101'));
    expect(test.calls).toHaveLength(2);
  });

  it('reports a body that is not json', async () => {
    const test = harness(() => ({ badJson: true }));
    await expect(test.client.getArtist(artistId('ar-101'))).rejects.toBeInstanceOf(
      MalformedResponse,
    );
  });

  it('reports a body that does not match the schema', async () => {
    const test = harness(() => ({ json: { name: 'Velvet Kettle' } }));
    await expect(test.client.getArtist(artistId('ar-101'))).rejects.toBeInstanceOf(
      MalformedResponse,
    );
  });

  it('refuses an aborted request before spending anything', async () => {
    const controller = new AbortController();
    controller.abort();
    const test = harness(() => okArtist);
    await expect(
      test.client.getArtist(artistId('ar-101'), { signal: controller.signal }),
    ).rejects.toBeInstanceOf(RequestFailed);
  });

  it('makes no request for an aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const test = harness(() => okArtist);
    await test.client
      .getArtist(artistId('ar-101'), { signal: controller.signal })
      .catch(() => undefined);
    expect(test.calls).toEqual([]);
  });
});

describe('request accounting', () => {
  it('counts a successful request', async () => {
    const test = harness(() => okArtist);
    await test.client.getArtist(artistId('ar-101'));
    expect(test.client.requests.snapshot().total).toBe(1);
  });

  it('counts a retry, because a retry costs quota too', async () => {
    const test = harness((_url, index) => (index === 0 ? { status: 503 } : okArtist));
    await test.client.getArtist(artistId('ar-101'));
    expect(test.client.requests.snapshot().total).toBe(2);
  });

  it('groups by endpoint rather than by url', async () => {
    const test = harness(() => okArtist);
    await test.client.getArtist(artistId('ar-101'));
    await test.client.getArtist(artistId('ar-102'));
    expect(test.client.requests.snapshot().byEndpoint.get('GET /artists/{id}')).toBe(2);
  });
});

describe('caching', () => {
  it('fetches an artist once', async () => {
    const test = harness(() => okArtist);
    await test.client.getArtist(artistId('ar-101'));
    await test.client.getArtist(artistId('ar-101'));
    expect(test.calls).toHaveLength(1);
  });

  it('counts the second read as a cache hit', async () => {
    const test = harness(() => okArtist);
    await test.client.getArtist(artistId('ar-101'));
    await test.client.getArtist(artistId('ar-101'));
    expect(test.client.requests.snapshot().cacheHits).toBe(1);
  });

  it('still fetches a different artist', async () => {
    const test = harness(() => okArtist);
    await test.client.getArtist(artistId('ar-101'));
    await test.client.getArtist(artistId('ar-102'));
    expect(test.calls).toHaveLength(2);
  });

  it('fetches an album once', async () => {
    const test = harness(() => ({ json: albumPayload() }));
    await test.client.getAlbum(albumId('al-201'));
    await test.client.getAlbum(albumId('al-201'));
    expect(test.calls).toHaveLength(1);
  });

  it('fills the album cache from an artist discography walk', async () => {
    const test = harness((url) =>
      url.includes('/albums?') || url.includes('/artists/ar-101/albums')
        ? { json: pagePayload([albumPayload()]) }
        : { json: albumPayload() },
    );
    await test.client.getArtistAlbums(artistId('ar-101'), { depth: 'albums' });
    await test.client.getAlbum(albumId('al-201'));
    expect(test.calls).toHaveLength(1);
  });

  it('learns a catalog size from the discography walk', async () => {
    const test = harness((url) =>
      url.includes('/artists/ar-101/albums')
        ? { json: pagePayload([albumPayload(), albumPayload({ id: 'al-202' })]) }
        : okArtist,
    );
    await test.client.getArtistAlbums(artistId('ar-101'), { depth: 'albums' });
    const artist = await test.client.getArtist(artistId('ar-101'));
    expect(artist.catalogSize).toBe(2);
  });

  it('reuses the cached album when fetching its tracks', async () => {
    const test = harness((url) =>
      url.includes('/tracks')
        ? { json: pagePayload([{ ...trackPayload(), album: undefined }]) }
        : { json: albumPayload() },
    );
    await test.client.getAlbum(albumId('al-201'));
    await test.client.getAlbumTracks(albumId('al-201'));
    expect(test.calls).toHaveLength(2);
  });

  it('serves a second read of album tracks from the cache', async () => {
    const test = harness((url) =>
      url.includes('/tracks') ? { json: pagePayload([trackPayload()]) } : { json: albumPayload() },
    );
    await test.client.getAlbumTracks(albumId('al-201'));
    await test.client.getAlbumTracks(albumId('al-201'));
    expect(test.calls).toHaveLength(2);
  });
});

describe('concurrency', () => {
  it('never has more requests in flight than the limit allows', async () => {
    let inFlight = 0;
    let peak = 0;
    const gates: (() => void)[] = [];

    const fetchImpl: FetchLike = () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      return new Promise<FetchResponse>((resolve) => {
        gates.push(() => {
          inFlight -= 1;
          resolve({
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: () => Promise.resolve(trackPayload()),
            text: () => Promise.resolve(''),
          });
        });
      });
    };

    const client = new LiveSpotifyClient({
      getToken: () => 'token-abc',
      fetch: fetchImpl,
      baseUrl: 'https://api.test/v1',
      concurrency: 2,
    });

    const running = Promise.all(
      Array.from({ length: 8 }, (_, index) => client.getTrack(trackId(`tr-${String(index)}`))),
    );

    const drain = async (): Promise<void> => {
      for (let settled = 0; settled < 8; settled += 1) {
        while (gates.length === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        gates.shift()?.();
      }
    };
    await Promise.all([running, drain()]);

    expect(peak).toBe(2);
  });
});

describe('search', () => {
  it('asks for tracks when searching tracks', async () => {
    const test = harness(() => ({ json: { tracks: pagePayload([trackPayload()]) } }));
    await test.client.searchTracks({ terms: 'dub', limit: 10, offset: 0 });
    expect(test.calls[0]?.url).toContain('type=track');
  });

  it('sends the genre filter on a track search', async () => {
    const test = harness(() => ({ json: { tracks: pagePayload([]) } }));
    await test.client.searchTracks({ terms: 'dub', genre: 'harbour dub', limit: 10, offset: 0 });
    expect(queryOf(test.calls[0]?.url)).toBe('dub genre:"harbour dub"');
  });

  it('asks for albums when searching albums', async () => {
    const test = harness(() => ({ json: { albums: pagePayload([albumPayload()]) } }));
    await test.client.searchAlbums({ terms: 'dub', tag: 'hipster', limit: 10, offset: 0 });
    expect(test.calls[0]?.url).toContain('type=album');
  });

  it('sends the hipster tag on an album search', async () => {
    const test = harness(() => ({ json: { albums: pagePayload([]) } }));
    await test.client.searchAlbums({ terms: 'dub', tag: 'hipster', limit: 10, offset: 0 });
    expect(queryOf(test.calls[0]?.url)).toBe('dub tag:hipster');
  });

  it('refuses a page larger than search allows', async () => {
    const test = harness(() => ({ json: {} }));
    await expect(
      test.client.searchTracks({ terms: 'dub', limit: 50, offset: 0 }),
    ).rejects.toBeInstanceOf(InvalidRequest);
  });

  it('spends nothing on a request search would refuse', async () => {
    const test = harness(() => ({ json: {} }));
    await test.client.searchTracks({ terms: 'dub', limit: 50, offset: 0 }).catch(() => undefined);
    expect(test.calls).toEqual([]);
  });

  it('reports the next offset after a full page', async () => {
    const items = Array.from({ length: 10 }, (_, index) =>
      trackPayload({ id: `tr-${String(index)}` }),
    );
    const test = harness(() => ({ json: { tracks: pagePayload(items) } }));
    const page = await test.client.searchTracks({ terms: 'dub', limit: 10, offset: 0 });
    expect(page.nextOffset).toBe(10);
  });

  it('reports the end after a short page', async () => {
    const test = harness(() => ({ json: { tracks: pagePayload([trackPayload()]) } }));
    const page = await test.client.searchTracks({ terms: 'dub', limit: 10, offset: 0 });
    expect(page.nextOffset).toBeNull();
  });

  it('treats a response with no tracks half as empty', async () => {
    const test = harness(() => ({ json: {} }));
    const page = await test.client.searchTracks({ terms: 'dub', limit: 10, offset: 0 });
    expect(page.items).toEqual([]);
  });
});

describe('paging', () => {
  it('asks for another page while the last one was full', async () => {
    const full = Array.from({ length: 50 }, (_, index) =>
      trackPayload({ id: `tr-${String(index)}` }),
    );
    const test = harness((_url, index) =>
      index === 0
        ? { json: pagePayload(full.map((track) => ({ track }))) }
        : { json: pagePayload([{ track: trackPayload({ id: 'tr-last' }) }]) },
    );
    const tracks = await test.client.getSavedTracks();
    expect(tracks).toHaveLength(51);
  });

  it('stops asking once a page comes back short', async () => {
    const test = harness(() => ({ json: pagePayload([{ track: trackPayload() }]) }));
    await test.client.getSavedTracks();
    expect(test.calls).toHaveLength(1);
  });

  it('stops at the ceiling the caller set', async () => {
    const full = Array.from({ length: 50 }, (_, index) =>
      trackPayload({ id: `tr-${String(index)}` }),
    );
    const test = harness(() => ({ json: pagePayload(full.map((track) => ({ track }))) }));
    const tracks = await test.client.getSavedTracks({ maxItems: 20 });
    expect(tracks).toHaveLength(20);
  });

  it('sends the time range for top tracks', async () => {
    const test = harness(() => ({ json: pagePayload([trackPayload()]) }));
    await test.client.getTopTracks('mediumTerm');
    expect(test.calls[0]?.url).toContain('time_range=medium_term');
  });

  it('reads playlist items from the renamed path', async () => {
    const test = harness(() => ({ json: pagePayload([{ track: trackPayload() }]) }));
    await test.client.getPlaylistTracks(playlistId('pl-1'));
    expect(test.calls[0]?.url).toContain('/playlists/pl-1/items');
  });

  it('drops the holes in a playlist', async () => {
    const test = harness(() => ({
      json: pagePayload([{ track: trackPayload() }, { track: null }]),
    }));
    const tracks = await test.client.getPlaylistTracks(playlistId('pl-1'));
    expect(tracks).toHaveLength(1);
  });

  it('keeps paging past a hole in a playlist', async () => {
    const full = Array.from({ length: 50 }, (_, index) => ({
      track: trackPayload({ id: `tr-${String(index)}` }),
    }));
    const test = harness((_url, index) =>
      index === 0
        ? { json: pagePayload([...full.slice(1), { track: null }]) }
        : { json: pagePayload([{ track: trackPayload({ id: 'tr-last' }) }]) },
    );
    const tracks = await test.client.getPlaylistTracks(playlistId('pl-1'));
    expect(tracks).toHaveLength(50);
  });

  it('follows the cursor for followed artists', async () => {
    const test = harness((_url, index) =>
      index === 0
        ? { json: { artists: { items: [artistPayload()], cursors: { after: 'ar-101' } } } }
        : { json: { artists: { items: [artistPayload({ id: 'ar-102' })], cursors: {} } } },
    );
    const artists = await test.client.getFollowedArtists();
    expect(artists).toHaveLength(2);
  });
});

describe('listing the playlists', () => {
  const fullPage = () =>
    Array.from({ length: 50 }, (_, index) => userPlaylistPayload({ id: `pl-${String(index)}` }));

  it('reads them from the current-user path', async () => {
    const test = harness(() => ({ json: pagePayload([userPlaylistPayload()]) }));
    await test.client.getUserPlaylists();
    expect(test.calls[0]?.url).toContain('/me/playlists');
  });

  it('asks for the largest page the endpoint allows', async () => {
    const test = harness(() => ({ json: pagePayload([userPlaylistPayload()]) }));
    await test.client.getUserPlaylists();
    expect(test.calls[0]?.url).toContain('limit=50');
  });

  it('names each one', async () => {
    const test = harness(() => ({ json: pagePayload([userPlaylistPayload()]) }));
    const lists = await test.client.getUserPlaylists();
    expect(lists[0]?.name).toBe('Kids Jams');
  });

  it('takes the track count Spotify already knows', async () => {
    const test = harness(() => ({ json: pagePayload([userPlaylistPayload()]) }));
    const lists = await test.client.getUserPlaylists();
    expect(lists[0]?.trackCount).toBe(40);
  });

  it('counts a playlist with no track total as empty', async () => {
    const test = harness(() => ({
      json: pagePayload([userPlaylistPayload({ tracks: undefined })]),
    }));
    const lists = await test.client.getUserPlaylists();
    expect(lists[0]?.trackCount).toBe(0);
  });

  it('asks for another page while the last one was full', async () => {
    const test = harness((_url, index) =>
      index === 0
        ? { json: pagePayload(fullPage()) }
        : { json: pagePayload([userPlaylistPayload({ id: 'pl-last' })]) },
    );
    const lists = await test.client.getUserPlaylists();
    expect(lists).toHaveLength(51);
  });

  it('offsets the second page by a full page', async () => {
    const test = harness((_url, index) =>
      index === 0 ? { json: pagePayload(fullPage()) } : { json: pagePayload([]) },
    );
    await test.client.getUserPlaylists();
    expect(test.calls[1]?.url).toContain('offset=50');
  });

  it('stops asking once a page comes back short', async () => {
    const test = harness(() => ({ json: pagePayload([userPlaylistPayload()]) }));
    await test.client.getUserPlaylists();
    expect(test.calls).toHaveLength(1);
  });

  it('stops at the ceiling the caller set', async () => {
    const test = harness(() => ({ json: pagePayload(fullPage()) }));
    const lists = await test.client.getUserPlaylists({ maxItems: 20 });
    expect(lists).toHaveLength(20);
  });

  it('drops a playlist that came back as a hole', async () => {
    const test = harness(() => ({ json: pagePayload([userPlaylistPayload(), null]) }));
    const lists = await test.client.getUserPlaylists();
    expect(lists).toHaveLength(1);
  });

  it('keeps paging past a hole rather than stopping at it', async () => {
    const test = harness((_url, index) =>
      index === 0
        ? { json: pagePayload([...fullPage().slice(1), null]) }
        : { json: pagePayload([userPlaylistPayload({ id: 'pl-last' })]) },
    );
    const lists = await test.client.getUserPlaylists();
    expect(lists).toHaveLength(50);
  });

  it('counts the requests it spent', async () => {
    const test = harness((_url, index) =>
      index === 0 ? { json: pagePayload(fullPage()) } : { json: pagePayload([]) },
    );
    await test.client.getUserPlaylists();
    expect(test.client.requests.snapshot().byEndpoint.get('GET /me/playlists')).toBe(2);
  });

  it('drops an entry it cannot read rather than failing the page', async () => {
    const test = harness(() => ({
      json: pagePayload([userPlaylistPayload(), { name: 'no id at all' }]),
    }));
    const lists = await test.client.getUserPlaylists();
    expect(lists).toHaveLength(1);
  });

  it('reports a body with no page in it', async () => {
    const test = harness(() => ({ json: { playlists: [] } }));
    await expect(test.client.getUserPlaylists()).rejects.toBeInstanceOf(MalformedResponse);
  });

  it('reports items that are not a list', async () => {
    const test = harness(() => ({ json: { items: 'Kids Jams' } }));
    await expect(test.client.getUserPlaylists()).rejects.toBeInstanceOf(MalformedResponse);
  });
});

describe('writing a playlist', () => {
  it('creates through the current-user path', async () => {
    const test = harness(() => ({ json: { id: 'pl-new', name: 'Kitchen Fires' } }));
    await test.client.createPlaylist({ name: 'Kitchen Fires', isPublic: false });
    expect(test.calls[0]?.url).toBe('https://api.test/v1/me/playlists');
  });

  it('returns the new playlist id', async () => {
    const test = harness(() => ({ json: { id: 'pl-new', name: 'Kitchen Fires' } }));
    const id = await test.client.createPlaylist({ name: 'Kitchen Fires', isPublic: false });
    expect(id).toBe('pl-new');
  });

  it('adds items as track uris', async () => {
    const test = harness(() => ({ json: { snapshot_id: 'snap' } }));
    await test.client.addPlaylistTracks({
      playlistId: playlistId('pl-new'),
      trackIds: [trackId('tr-1'), trackId('tr-2')],
    });
    expect(test.calls[0]?.init.body).toBe(
      JSON.stringify({ uris: ['spotify:track:tr-1', 'spotify:track:tr-2'] }),
    );
  });

  it('refuses more than a hundred uris in one request', async () => {
    const test = harness(() => ({ json: { snapshot_id: 'snap' } }));
    const trackIds = Array.from({ length: 101 }, (_, index) => trackId(`tr-${String(index)}`));
    await expect(
      test.client.addPlaylistTracks({ playlistId: playlistId('pl-new'), trackIds }),
    ).rejects.toBeInstanceOf(InvalidRequest);
  });

  it('uploads a cover as jpeg', async () => {
    const test = harness(() => ({ status: 202 }));
    await test.client.uploadPlaylistCover({
      playlistId: playlistId('pl-new'),
      base64Jpeg: 'abc',
    });
    expect(test.calls[0]?.init.headers['Content-Type']).toBe('image/jpeg');
  });

  it('puts the cover rather than posting it', async () => {
    const test = harness(() => ({ status: 202 }));
    await test.client.uploadPlaylistCover({ playlistId: playlistId('pl-new'), base64Jpeg: 'abc' });
    expect(test.calls[0]?.init.method).toBe('PUT');
  });

  it('refuses a cover over the size limit', async () => {
    const test = harness(() => ({ status: 202 }));
    await expect(
      test.client.uploadPlaylistCover({
        playlistId: playlistId('pl-new'),
        base64Jpeg: 'x'.repeat(300_000),
      }),
    ).rejects.toBeInstanceOf(InvalidRequest);
  });
});
