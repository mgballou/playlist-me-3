import type { Source } from '@pm/core';
import { artistId, playlistId, trackId } from '@pm/core';
import { describe, expect, it } from 'vitest';

import type { FakeCall } from '../src/index';
import {
  FakeSpotifyClient,
  KIDS_PLAYLIST_ID,
  QuotaExceeded,
  demoCatalog,
  resolveSources,
} from '../src/index';

const firstArtist = demoCatalog.artists[0]?.id ?? artistId('ar-001');

const collaboration = demoCatalog.albums
  .flatMap((album) => album.tracks.map((track) => ({ album, track })))
  .find(({ track }) => track.artistIds.length > 1);

const soloTrack = demoCatalog.albums[0]?.tracks[0]?.id ?? trackId('tr-00001');

const cheap = { maxArtistGenreLookups: 0 } as const;

function searchCalls(calls: readonly FakeCall[], method: 'searchTracks' | 'searchAlbums') {
  return calls.filter((call) => call.method === method);
}

describe('artist sources', () => {
  const source: Source = { kind: 'artist', artistId: firstArtist, depth: 'albumsAndSingles' };

  it('walks the discography rather than asking for top tracks', async () => {
    const client = new FakeSpotifyClient();
    await resolveSources({ client, sources: [source], limits: cheap });
    expect(client.calls.some((call) => call.method === 'getArtistAlbums')).toBe(true);
  });

  it('fetches the tracks of each album it found', async () => {
    const client = new FakeSpotifyClient();
    await resolveSources({ client, sources: [source], limits: cheap });
    expect(client.calls.filter((call) => call.method === 'getAlbumTracks').length).toBeGreaterThan(
      0,
    );
  });

  it('fills the pool', async () => {
    const client = new FakeSpotifyClient();
    const { pool } = await resolveSources({ client, sources: [source], limits: cheap });
    expect(pool.length).toBeGreaterThan(0);
  });

  it('credits everything it found to its own source index', async () => {
    const client = new FakeSpotifyClient();
    const { pool } = await resolveSources({ client, sources: [source], limits: cheap });
    expect(pool.filter((track) => track.sourceIndex !== 0)).toEqual([]);
  });

  it('passes the depth through to the request', async () => {
    const client = new FakeSpotifyClient();
    await resolveSources({ client, sources: [source], limits: cheap });
    const walk = client.calls.find((call) => call.method === 'getArtistAlbums');
    expect(walk?.method === 'getArtistAlbums' ? walk.depth : null).toBe('albumsAndSingles');
  });

  it('honors a ceiling on albums per artist', async () => {
    const client = new FakeSpotifyClient();
    await resolveSources({
      client,
      sources: [source],
      limits: { ...cheap, maxAlbumsPerArtist: 1 },
    });
    expect(client.calls.filter((call) => call.method === 'getAlbumTracks')).toHaveLength(1);
  });
});

describe('track sources', () => {
  it('reaches the album when asked to expand to it', async () => {
    const client = new FakeSpotifyClient();
    const sources: readonly Source[] = [{ kind: 'track', trackId: soloTrack, expand: 'album' }];
    const { pool } = await resolveSources({ client, sources, limits: cheap });
    expect(pool.length).toBeGreaterThan(1);
  });

  it('includes the seed track itself', async () => {
    const client = new FakeSpotifyClient();
    const sources: readonly Source[] = [{ kind: 'track', trackId: soloTrack, expand: 'album' }];
    const { pool } = await resolveSources({ client, sources, limits: cheap });
    expect(pool.some((track) => track.id === soloTrack)).toBe(true);
  });

  it('walks the collaborators, the only similarity signal left', async () => {
    const client = new FakeSpotifyClient();
    const seed = collaboration?.track.id ?? soloTrack;
    const sources: readonly Source[] = [{ kind: 'track', trackId: seed, expand: 'collaborators' }];
    await resolveSources({ client, sources, limits: cheap });
    const walks = client.calls.filter((call) => call.method === 'getArtistAlbums');
    expect(walks.length).toBeGreaterThanOrEqual(2);
  });

  it('reaches both edges when asked for both', async () => {
    const client = new FakeSpotifyClient();
    const seed = collaboration?.track.id ?? soloTrack;
    const sources: readonly Source[] = [{ kind: 'track', trackId: seed, expand: 'both' }];
    const { pool } = await resolveSources({ client, sources, limits: cheap });
    expect(pool.length).toBeGreaterThan(1);
  });

  it('makes no discography walk for an album-only expansion', async () => {
    const client = new FakeSpotifyClient();
    const sources: readonly Source[] = [{ kind: 'track', trackId: soloTrack, expand: 'album' }];
    await resolveSources({ client, sources, limits: cheap });
    expect(client.calls.filter((call) => call.method === 'getArtistAlbums')).toEqual([]);
  });
});

describe('search sources branch on obscurity', () => {
  const ordinary: Source = {
    kind: 'search',
    query: 'harbour',
    genre: 'harbour dub',
    obscurity: 'any',
  };

  const obscure: Source = {
    kind: 'search',
    query: 'harbour',
    genre: 'harbour dub',
    obscurity: 'obscure',
  };

  it('asks for tracks at ordinary obscurity', async () => {
    const client = new FakeSpotifyClient();
    await resolveSources({ client, sources: [ordinary], limits: cheap });
    expect(searchCalls(client.calls, 'searchTracks').length).toBeGreaterThan(0);
  });

  it('never asks for albums at ordinary obscurity', async () => {
    const client = new FakeSpotifyClient();
    await resolveSources({ client, sources: [ordinary], limits: cheap });
    expect(searchCalls(client.calls, 'searchAlbums')).toEqual([]);
  });

  it('sends the genre filter at ordinary obscurity', async () => {
    const client = new FakeSpotifyClient();
    await resolveSources({ client, sources: [ordinary], limits: cheap });
    const call = client.calls[0];
    expect(call?.method === 'searchTracks' ? call.query.genre : null).toBe('harbour dub');
  });

  it('asks for albums at high obscurity', async () => {
    const client = new FakeSpotifyClient();
    await resolveSources({ client, sources: [obscure], limits: cheap });
    expect(searchCalls(client.calls, 'searchAlbums').length).toBeGreaterThan(0);
  });

  it('never asks for tracks at high obscurity', async () => {
    const client = new FakeSpotifyClient();
    await resolveSources({ client, sources: [obscure], limits: cheap });
    expect(searchCalls(client.calls, 'searchTracks')).toEqual([]);
  });

  it('tags the album search as hipster', async () => {
    const client = new FakeSpotifyClient();
    await resolveSources({ client, sources: [obscure], limits: cheap });
    const call = client.calls[0];
    expect(call?.method === 'searchAlbums' ? call.query.tag : null).toBe('hipster');
  });

  it('never sends a genre filter on an album search, which would return nothing', async () => {
    const client = new FakeSpotifyClient();
    await resolveSources({ client, sources: [obscure], limits: cheap });
    const call = client.calls[0];
    expect(call?.method === 'searchAlbums' ? 'genre' in call.query : true).toBe(false);
  });

  it('keeps the genre as free text on the album search instead', async () => {
    const client = new FakeSpotifyClient();
    await resolveSources({ client, sources: [obscure], limits: cheap });
    const call = client.calls[0];
    expect(call?.method === 'searchAlbums' ? call.query.terms : '').toBe('harbour harbour dub');
  });

  it('fetches the tracks of each obscure album it found', async () => {
    const client = new FakeSpotifyClient();
    await resolveSources({ client, sources: [obscure], limits: cheap });
    expect(client.calls.filter((call) => call.method === 'getAlbumTracks').length).toBeGreaterThan(
      0,
    );
  });

  it('passes a year range through to the search', async () => {
    const client = new FakeSpotifyClient();
    const source: Source = {
      kind: 'search',
      query: 'harbour',
      years: { from: 1990, to: 1999 },
      obscurity: 'any',
    };
    await resolveSources({ client, sources: [source], limits: cheap });
    const call = client.calls[0];
    expect(call?.method === 'searchTracks' ? call.query.years : null).toEqual({
      from: 1990,
      to: 1999,
    });
  });

  it('never asks for a page larger than search allows', async () => {
    const client = new FakeSpotifyClient();
    await resolveSources({ client, sources: [ordinary], limits: cheap });
    const oversized = client.calls.filter(
      (call) => call.method === 'searchTracks' && call.query.limit > 10,
    );
    expect(oversized).toEqual([]);
  });
});

describe('new releases', () => {
  it('is a tag:new album search, because the browse endpoint is gone', async () => {
    const client = new FakeSpotifyClient();
    const sources: readonly Source[] = [{ kind: 'newReleases' }];
    await resolveSources({ client, sources, limits: cheap });
    const call = client.calls[0];
    expect(call?.method === 'searchAlbums' ? call.query.tag : null).toBe('new');
  });

  it('finds something', async () => {
    const client = new FakeSpotifyClient();
    const sources: readonly Source[] = [{ kind: 'newReleases' }];
    const { pool } = await resolveSources({ client, sources, limits: cheap });
    expect(pool.length).toBeGreaterThan(0);
  });

  it('carries a genre as free text rather than as a filter', async () => {
    const client = new FakeSpotifyClient();
    const sources: readonly Source[] = [{ kind: 'newReleases', genre: 'kettle techno' }];
    await resolveSources({ client, sources, limits: cheap });
    const call = client.calls[0];
    expect(call?.method === 'searchAlbums' ? call.query.terms : '').toBe('kettle techno');
  });
});

describe('the person as a source', () => {
  it('resolves the library', async () => {
    const client = new FakeSpotifyClient();
    const { pool } = await resolveSources({
      client,
      sources: [{ kind: 'library' }],
      limits: cheap,
    });
    expect(pool.length).toBeGreaterThan(0);
  });

  it('resolves top tracks for the range it was given', async () => {
    const client = new FakeSpotifyClient();
    const sources: readonly Source[] = [{ kind: 'topTracks', range: 'longTerm' }];
    await resolveSources({ client, sources, limits: cheap });
    const call = client.calls[0];
    expect(call?.method === 'getTopTracks' ? call.range : null).toBe('longTerm');
  });

  it('resolves a playlist', async () => {
    const client = new FakeSpotifyClient();
    const sources: readonly Source[] = [{ kind: 'playlist', playlistId: KIDS_PLAYLIST_ID }];
    const { pool } = await resolveSources({ client, sources, limits: cheap });
    expect(pool.length).toBeGreaterThanOrEqual(20);
  });

  it('walks every followed artist', async () => {
    const client = new FakeSpotifyClient();
    const sources: readonly Source[] = [{ kind: 'followedArtists', depth: 'albums' }];
    await resolveSources({ client, sources, limits: { ...cheap, maxArtistsPerSource: 3 } });
    expect(client.calls.filter((call) => call.method === 'getArtistAlbums')).toHaveLength(3);
  });

  it('fills a pool from followed artists', async () => {
    const client = new FakeSpotifyClient();
    const sources: readonly Source[] = [{ kind: 'followedArtists', depth: 'albums' }];
    const { pool } = await resolveSources({
      client,
      sources,
      limits: { ...cheap, maxArtistsPerSource: 3 },
    });
    expect(pool.length).toBeGreaterThan(0);
  });
});

describe('dedupe and attribution', () => {
  const twice: readonly Source[] = [
    { kind: 'artist', artistId: firstArtist, depth: 'albums' },
    { kind: 'artist', artistId: firstArtist, depth: 'albums' },
  ];

  it('never emits the same track twice', async () => {
    const client = new FakeSpotifyClient();
    const { pool } = await resolveSources({ client, sources: twice, limits: cheap });
    expect(new Set(pool.map((track) => track.id)).size).toBe(pool.length);
  });

  it('credits every shared track to the first source', async () => {
    const client = new FakeSpotifyClient();
    const { pool } = await resolveSources({ client, sources: twice, limits: cheap });
    expect(pool.filter((track) => track.sourceIndex === 1)).toEqual([]);
  });

  it('reports the second source as contributing nothing', async () => {
    const client = new FakeSpotifyClient();
    const { report } = await resolveSources({ client, sources: twice, limits: cheap });
    expect(report.sources[1]?.contributed).toBe(0);
  });

  it('reports what the second source found before dedupe', async () => {
    const client = new FakeSpotifyClient();
    const { report } = await resolveSources({ client, sources: twice, limits: cheap });
    expect(report.sources[1]?.found).toBe(report.sources[0]?.found);
  });

  it('counts the duplicates it dropped', async () => {
    const client = new FakeSpotifyClient();
    const { report } = await resolveSources({ client, sources: twice, limits: cheap });
    expect(report.sources[1]?.duplicates).toBe(report.sources[1]?.found);
  });
});

describe('the report', () => {
  it('names each source kind', async () => {
    const client = new FakeSpotifyClient();
    const sources: readonly Source[] = [
      { kind: 'library' },
      { kind: 'topTracks', range: 'shortTerm' },
    ];
    const { report } = await resolveSources({ client, sources, limits: cheap });
    expect(report.sources.map((entry) => entry.kind)).toEqual(['library', 'topTracks']);
  });

  it('reports the pool size', async () => {
    const client = new FakeSpotifyClient();
    const { pool, report } = await resolveSources({
      client,
      sources: [{ kind: 'library' }],
      limits: cheap,
    });
    expect(report.poolSize).toBe(pool.length);
  });

  it('reports what the whole resolve cost', async () => {
    const client = new FakeSpotifyClient();
    const { report } = await resolveSources({
      client,
      sources: [{ kind: 'library' }],
      limits: cheap,
    });
    expect(report.requests).toBe(client.requests.snapshot().total);
  });

  it('reports what each source cost', async () => {
    const client = new FakeSpotifyClient();
    const { report } = await resolveSources({
      client,
      sources: [{ kind: 'library' }],
      limits: cheap,
    });
    expect(report.sources[0]?.requests).toBeGreaterThan(0);
  });

  it('says when a source returned nothing', async () => {
    const client = new FakeSpotifyClient();
    const sources: readonly Source[] = [{ kind: 'search', query: 'zzzzqqq', obscurity: 'any' }];
    const { report } = await resolveSources({ client, sources, limits: cheap });
    expect(report.sources[0]?.empty).toBe(true);
  });

  it('does not call a source that found something empty', async () => {
    const client = new FakeSpotifyClient();
    const { report } = await resolveSources({
      client,
      sources: [{ kind: 'library' }],
      limits: cheap,
    });
    expect(report.sources[0]?.empty).toBe(false);
  });

  it('says when a source stopped at the offset ceiling', async () => {
    const client = new FakeSpotifyClient();
    const sources: readonly Source[] = [{ kind: 'search', query: '', obscurity: 'any' }];
    const { report } = await resolveSources({
      client,
      sources,
      limits: { ...cheap, maxSearchPages: 200, maxTracksPerSource: 5000 },
    });
    expect(report.sources[0]?.hitOffsetCeiling).toBe(true);
  });

  it('says when a source stopped at its own track ceiling', async () => {
    const client = new FakeSpotifyClient();
    const sources: readonly Source[] = [{ kind: 'search', query: '', obscurity: 'any' }];
    const { report } = await resolveSources({
      client,
      sources,
      limits: { ...cheap, maxTracksPerSource: 20 },
    });
    expect(report.sources[0]?.hitTrackLimit).toBe(true);
  });

  it('blames the ceiling only when the ceiling was the reason', async () => {
    const client = new FakeSpotifyClient();
    const sources: readonly Source[] = [{ kind: 'search', query: 'harbour', obscurity: 'any' }];
    const { report } = await resolveSources({ client, sources, limits: cheap });
    expect(report.sources[0]?.hitOffsetCeiling).toBe(false);
  });
});

describe('failure', () => {
  it('records a source that failed', async () => {
    const client = new FakeSpotifyClient();
    const sources: readonly Source[] = [
      { kind: 'playlist', playlistId: playlistId('pl-gone') },
      { kind: 'library' },
    ];
    const { report } = await resolveSources({ client, sources, limits: cheap });
    expect(report.sources[0]?.failure).not.toBeNull();
  });

  it('lets the other sources carry on', async () => {
    const client = new FakeSpotifyClient();
    const sources: readonly Source[] = [
      { kind: 'playlist', playlistId: playlistId('pl-gone') },
      { kind: 'library' },
    ];
    const { report } = await resolveSources({ client, sources, limits: cheap });
    expect(report.sources[1]?.contributed).toBeGreaterThan(0);
  });

  it('does not call a failed source empty', async () => {
    const client = new FakeSpotifyClient();
    const sources: readonly Source[] = [{ kind: 'playlist', playlistId: playlistId('pl-gone') }];
    const { report } = await resolveSources({ client, sources, limits: cheap });
    expect(report.sources[0]?.empty).toBe(false);
  });

  it('stops everything when the quota is spent', async () => {
    class SpentClient extends FakeSpotifyClient {
      override getArtistAlbums(): Promise<never> {
        return Promise.reject(QuotaExceeded.developerQuota());
      }
    }
    const client = new SpentClient();
    const sources: readonly Source[] = [
      { kind: 'artist', artistId: firstArtist, depth: 'albums' },
      { kind: 'library' },
    ];
    await expect(resolveSources({ client, sources, limits: cheap })).rejects.toBeInstanceOf(
      QuotaExceeded,
    );
  });

  it('refuses to start when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const client = new FakeSpotifyClient();
    await expect(
      resolveSources({
        client,
        sources: [{ kind: 'library' }],
        signal: controller.signal,
        limits: cheap,
      }),
    ).rejects.toBeInstanceOf(Error);
  });
});

describe('artist genres', () => {
  const sources: readonly Source[] = [{ kind: 'artist', artistId: firstArtist, depth: 'albums' }];

  it('fills them in from the artist endpoint', async () => {
    const client = new FakeSpotifyClient();
    const { pool } = await resolveSources({ client, sources });
    expect(pool.every((track) => track.artistGenres.length > 0)).toBe(true);
  });

  it('reports that genres were available', async () => {
    const client = new FakeSpotifyClient();
    const { report } = await resolveSources({ client, sources });
    expect(report.genresAvailable).toBe(true);
  });

  it('counts the artists it looked up', async () => {
    const client = new FakeSpotifyClient();
    const { report } = await resolveSources({ client, sources });
    expect(report.artistsLookedUp).toBeGreaterThan(0);
  });

  it('looks up each artist once', async () => {
    const client = new FakeSpotifyClient();
    await resolveSources({ client, sources });
    const looked = client.calls.filter((call) => call.method === 'getArtist');
    const ids = looked.map((call) => (call.method === 'getArtist' ? call.artistId : ''));
    expect(new Set(ids).size).toBe(looked.length);
  });

  it('honors the ceiling on genre lookups', async () => {
    const client = new FakeSpotifyClient();
    await resolveSources({ client, sources, limits: { maxArtistGenreLookups: 1 } });
    expect(client.calls.filter((call) => call.method === 'getArtist')).toHaveLength(1);
  });

  it('still resolves a pool when no artist has any genres', async () => {
    const stripped = {
      ...demoCatalog,
      artists: demoCatalog.artists.map((artist) => ({ ...artist, genres: [] })),
    };
    const client = new FakeSpotifyClient({ catalog: stripped });
    const { pool } = await resolveSources({ client, sources });
    expect(pool.length).toBeGreaterThan(0);
  });

  it('says genres were unavailable when every artist came back unclassified', async () => {
    const stripped = {
      ...demoCatalog,
      artists: demoCatalog.artists.map((artist) => ({ ...artist, genres: [] })),
    };
    const client = new FakeSpotifyClient({ catalog: stripped });
    const { report } = await resolveSources({ client, sources });
    expect(report.genresAvailable).toBe(false);
  });

  it('leaves tracks with empty genres rather than failing', async () => {
    const stripped = {
      ...demoCatalog,
      artists: demoCatalog.artists.map((artist) => ({ ...artist, genres: [] })),
    };
    const client = new FakeSpotifyClient({ catalog: stripped });
    const { pool } = await resolveSources({ client, sources });
    expect(pool.every((track) => track.artistGenres.length === 0)).toBe(true);
  });
});

describe('an empty recipe', () => {
  it('resolves to an empty pool', async () => {
    const client = new FakeSpotifyClient();
    const { pool } = await resolveSources({ client, sources: [] });
    expect(pool).toEqual([]);
  });

  it('spends nothing', async () => {
    const client = new FakeSpotifyClient();
    const { report } = await resolveSources({ client, sources: [] });
    expect(report.requests).toBe(0);
  });
});
