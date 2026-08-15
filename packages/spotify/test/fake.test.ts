import { albumId, artistId, playlistId, trackId } from '@pm/core';
import { describe, expect, it } from 'vitest';

import {
  FakeSpotifyClient,
  InvalidRequest,
  KIDS_PLAYLIST_ID,
  NotFound,
  SEARCH_MAX_OFFSET,
  demoCatalog,
} from '../src/index';

const firstArtist = demoCatalog.artists[0]?.id ?? artistId('ar-001');
const firstAlbum = demoCatalog.albums[0]?.id ?? albumId('al-0001');

function client(): FakeSpotifyClient {
  return new FakeSpotifyClient();
}

describe('catalog reads', () => {
  it('returns an artist with genres', async () => {
    const artist = await client().getArtist(firstArtist);
    expect(artist.genres.length).toBeGreaterThan(0);
  });

  it('reports a catalog size from the discography', async () => {
    const artist = await client().getArtist(firstArtist);
    expect(artist.catalogSize).toBeGreaterThan(0);
  });

  it('reports a missing artist', async () => {
    await expect(client().getArtist(artistId('ar-nope'))).rejects.toBeInstanceOf(NotFound);
  });

  it('reports a missing album', async () => {
    await expect(client().getAlbum(albumId('al-nope'))).rejects.toBeInstanceOf(NotFound);
  });

  it('reports a missing track', async () => {
    await expect(client().getTrack(trackId('tr-nope'))).rejects.toBeInstanceOf(NotFound);
  });

  it('returns album tracks numbered from one', async () => {
    const tracks = await client().getAlbumTracks(firstAlbum);
    expect(tracks[0]?.trackNumber).toBe(1);
  });

  it('gives every album track the album total for the depth proxy', async () => {
    const tracks = await client().getAlbumTracks(firstAlbum);
    expect(new Set(tracks.map((track) => track.albumTrackCount)).size).toBe(1);
  });

  it('leaves artist genres off a track, exactly as the live client would', async () => {
    const tracks = await client().getAlbumTracks(firstAlbum);
    expect(tracks[0]?.artistGenres).toEqual([]);
  });
});

describe('catalog depth', () => {
  const walked = async (depth: 'albums' | 'albumsAndSingles' | 'everything') => {
    const fake = client();
    const albums = await fake.getArtistAlbums(firstArtist, { depth });
    return albums.map((album) => album.id);
  };

  it('returns only albums at the shallowest depth', async () => {
    const ids = new Set(await walked('albums'));
    const wrong = demoCatalog.albums.filter(
      (album) => ids.has(album.id) && album.group !== 'album',
    );
    expect(wrong).toEqual([]);
  });

  it('reaches singles one step deeper', async () => {
    const shallow = await walked('albums');
    const deeper = await walked('albumsAndSingles');
    expect(deeper.length).toBeGreaterThanOrEqual(shallow.length);
  });

  it('reaches everything at the deepest', async () => {
    const deeper = await walked('albumsAndSingles');
    const everything = await walked('everything');
    expect(everything.length).toBeGreaterThanOrEqual(deeper.length);
  });

  it('reaches records the artist only guests on', async () => {
    const fake = client();
    const guest = demoCatalog.albums
      .flatMap((album) => album.tracks.map((track) => ({ album, track })))
      .find(
        ({ album, track }) =>
          track.artistIds.length > 1 &&
          !album.artistIds.includes(track.artistIds[1] ?? artistId('x')),
      );
    const guestId = guest?.track.artistIds[1] ?? firstArtist;
    const albums = await fake.getArtistAlbums(guestId, { depth: 'everything' });
    expect(albums.some((album) => album.id === guest?.album.id)).toBe(true);
  });

  it('honors a ceiling on how many albums to walk', async () => {
    const albums = await client().getArtistAlbums(firstArtist, {
      depth: 'everything',
      maxItems: 1,
    });
    expect(albums).toHaveLength(1);
  });
});

describe('track search', () => {
  it('refuses a page bigger than search allows', async () => {
    await expect(
      client().searchTracks({ terms: 'a', limit: 11, offset: 0 }),
    ).rejects.toBeInstanceOf(InvalidRequest);
  });

  it('refuses an offset past the ceiling', async () => {
    await expect(
      client().searchTracks({ terms: 'a', limit: 10, offset: SEARCH_MAX_OFFSET + 10 }),
    ).rejects.toBeInstanceOf(InvalidRequest);
  });

  it('returns at most a page', async () => {
    const page = await client().searchTracks({ terms: '', limit: 10, offset: 0 });
    expect(page.items).toHaveLength(10);
  });

  it('moves with the offset', async () => {
    const fake = client();
    const first = await fake.searchTracks({ terms: '', limit: 10, offset: 0 });
    const second = await fake.searchTracks({ terms: '', limit: 10, offset: 10 });
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
  });

  it('offers the next offset while there is more', async () => {
    const page = await client().searchTracks({ terms: '', limit: 10, offset: 0 });
    expect(page.nextOffset).toBe(10);
  });

  it('stops at the offset ceiling', async () => {
    const page = await client().searchTracks({ terms: '', limit: 10, offset: SEARCH_MAX_OFFSET });
    expect(page.nextOffset).toBeNull();
  });

  it('says when it stopped at the ceiling', async () => {
    const page = await client().searchTracks({ terms: '', limit: 10, offset: SEARCH_MAX_OFFSET });
    expect(page.atOffsetCeiling).toBe(true);
  });

  it('applies the genre filter, which track search accepts', async () => {
    const genre = 'harbour dub';
    const page = await client().searchTracks({ terms: '', genre, limit: 10, offset: 0 });
    const artists = new Map(demoCatalog.artists.map((artist) => [artist.id, artist]));
    const wrong = page.items.filter(
      (track) =>
        !track.artists.some((credit) => artists.get(credit.id)?.genres.includes(genre) === true),
    );
    expect(wrong).toEqual([]);
  });

  it('applies the year filter', async () => {
    const page = await client().searchTracks({
      terms: '',
      years: { from: 1968, to: 1975 },
      limit: 10,
      offset: 0,
    });
    expect(page.items.filter((track) => track.releaseYear > 1975)).toEqual([]);
  });

  it('matches free text against titles and credits', async () => {
    const page = await client().searchTracks({ terms: 'velvet kettle', limit: 10, offset: 0 });
    expect(page.items.length).toBeGreaterThan(0);
  });

  it('returns nothing for terms nobody used', async () => {
    const page = await client().searchTracks({ terms: 'zzzzqqq', limit: 10, offset: 0 });
    expect(page.items).toEqual([]);
  });
});

describe('album search', () => {
  it('returns only hipster albums for the hipster tag', async () => {
    const page = await client().searchAlbums({ terms: '', tag: 'hipster', limit: 10, offset: 0 });
    const hipster = new Set(
      demoCatalog.albums.filter((album) => album.hipster).map((album) => album.id),
    );
    expect(page.items.filter((album) => !hipster.has(album.id))).toEqual([]);
  });

  it('returns only new albums for the new tag', async () => {
    const page = await client().searchAlbums({ terms: '', tag: 'new', limit: 10, offset: 0 });
    const fresh = new Set(
      demoCatalog.albums.filter((album) => album.isNew).map((album) => album.id),
    );
    expect(page.items.filter((album) => !fresh.has(album.id))).toEqual([]);
  });

  it('finds something for the hipster tag at all', async () => {
    const page = await client().searchAlbums({ terms: '', tag: 'hipster', limit: 10, offset: 0 });
    expect(page.items.length).toBeGreaterThan(0);
  });

  it('applies the year filter', async () => {
    const page = await client().searchAlbums({
      terms: '',
      years: { from: 2000, to: 2005 },
      limit: 10,
      offset: 0,
    });
    expect(page.items.filter((album) => album.releaseYear < 2000)).toEqual([]);
  });

  it('treats a genre word as free text, since album search has no genre filter', async () => {
    const page = await client().searchAlbums({ terms: 'harbour dub', limit: 10, offset: 0 });
    expect(page.items.length).toBeGreaterThan(0);
  });

  it('refuses a page bigger than search allows', async () => {
    await expect(client().searchAlbums({ terms: '', limit: 20, offset: 0 })).rejects.toBeInstanceOf(
      InvalidRequest,
    );
  });
});

describe('the person', () => {
  it('returns a library', async () => {
    const tracks = await client().getSavedTracks();
    expect(tracks.length).toBeGreaterThan(0);
  });

  it('honors a ceiling on the library', async () => {
    const tracks = await client().getSavedTracks({ maxItems: 5 });
    expect(tracks).toHaveLength(5);
  });

  it('returns different top tracks per range', async () => {
    const fake = client();
    const short = await fake.getTopTracks('shortTerm');
    const long = await fake.getTopTracks('longTerm');
    expect(short[0]?.id).not.toBe(long[0]?.id);
  });

  it('returns followed artists', async () => {
    const artists = await client().getFollowedArtists();
    expect(artists.length).toBeGreaterThan(0);
  });

  it('returns recently played tracks', async () => {
    const tracks = await client().getRecentlyPlayed();
    expect(tracks.length).toBeGreaterThan(0);
  });

  it('returns the kids playlist the demo is built around', async () => {
    const tracks = await client().getPlaylistTracks(KIDS_PLAYLIST_ID);
    expect(tracks.length).toBeGreaterThanOrEqual(20);
  });

  it('reports a playlist that does not exist', async () => {
    await expect(client().getPlaylistTracks(playlistId('pl-nope'))).rejects.toBeInstanceOf(
      NotFound,
    );
  });

  it('lists the seeded playlists', async () => {
    const lists = await client().getUserPlaylists();
    expect(lists.map((list) => list.id)).toEqual(demoCatalog.playlists.map((list) => list.id));
  });

  it('names the one the demo is built around', async () => {
    const lists = await client().getUserPlaylists();
    expect(lists.find((list) => list.id === KIDS_PLAYLIST_ID)?.name).toBe('Kids Jams (demo)');
  });

  it('counts what is on each without reading it', async () => {
    const lists = await client().getUserPlaylists();
    const kids = demoCatalog.playlists.find((list) => list.id === KIDS_PLAYLIST_ID);
    expect(lists.find((list) => list.id === KIDS_PLAYLIST_ID)?.trackCount).toBe(
      kids?.trackIds.length,
    );
  });

  it('honors a ceiling on the listing', async () => {
    const lists = await client().getUserPlaylists({ maxItems: 2 });
    expect(lists).toHaveLength(2);
  });

  it('lists a playlist this session created, the way /me/playlists would', async () => {
    const fake = client();
    await fake.createPlaylist({ name: 'Kitchen Fires', isPublic: false });
    const lists = await fake.getUserPlaylists();
    expect(lists.at(-1)?.name).toBe('Kitchen Fires');
  });

  it('names the demo listener', async () => {
    expect((await client().currentUser()).displayName).toBe('Demo Listener');
  });
});

describe('writing a playlist', () => {
  it('creates one', async () => {
    const fake = client();
    const id = await fake.createPlaylist({ name: 'Late Shift', isPublic: false });
    expect(fake.playlistName(id)).toBe('Late Shift');
  });

  it('adds tracks to it', async () => {
    const fake = client();
    const id = await fake.createPlaylist({ name: 'Late Shift', isPublic: false });
    await fake.addPlaylistTracks({ playlistId: id, trackIds: [trackId('tr-00001')] });
    expect(fake.playlistContents(id)).toEqual(['tr-00001']);
  });

  it('refuses more than a hundred uris at once', async () => {
    const fake = client();
    const id = await fake.createPlaylist({ name: 'Late Shift', isPublic: false });
    const trackIds = Array.from({ length: 101 }, (_, index) => trackId(`tr-${String(index)}`));
    await expect(fake.addPlaylistTracks({ playlistId: id, trackIds })).rejects.toBeInstanceOf(
      InvalidRequest,
    );
  });

  it('refuses an empty batch', async () => {
    const fake = client();
    const id = await fake.createPlaylist({ name: 'Late Shift', isPublic: false });
    await expect(fake.addPlaylistTracks({ playlistId: id, trackIds: [] })).rejects.toBeInstanceOf(
      InvalidRequest,
    );
  });

  it('accepts a cover within the size limit', async () => {
    const fake = client();
    const id = await fake.createPlaylist({ name: 'Late Shift', isPublic: false });
    await fake.uploadPlaylistCover({ playlistId: id, base64Jpeg: 'abc' });
    expect(fake.coverUploads).toBe(1);
  });

  it('refuses a cover over the size limit', async () => {
    const fake = client();
    const id = await fake.createPlaylist({ name: 'Late Shift', isPublic: false });
    await expect(
      fake.uploadPlaylistCover({ playlistId: id, base64Jpeg: 'x'.repeat(300_000) }),
    ).rejects.toBeInstanceOf(InvalidRequest);
  });
});

describe('accounting and call log', () => {
  it('counts a request', async () => {
    const fake = client();
    await fake.getArtist(firstArtist);
    expect(fake.requests.snapshot().total).toBe(1);
  });

  it('counts a long list as more than one request, the way the live client would', async () => {
    const fake = client();
    await fake.getSavedTracks();
    expect(fake.requests.snapshot().total).toBeGreaterThan(1);
  });

  it('records the shape of a search, not only that one happened', async () => {
    const fake = client();
    await fake.searchTracks({ terms: 'dub', genre: 'harbour dub', limit: 10, offset: 0 });
    expect(fake.calls[0]).toEqual({
      method: 'searchTracks',
      query: { terms: 'dub', genre: 'harbour dub', limit: 10, offset: 0 },
    });
  });

  it('records calls in order', async () => {
    const fake = client();
    await fake.getArtist(firstArtist);
    await fake.getAlbum(firstAlbum);
    expect(fake.calls.map((call) => call.method)).toEqual(['getArtist', 'getAlbum']);
  });
});

describe('cancellation', () => {
  it('refuses an aborted read', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      client().getArtist(firstArtist, { signal: controller.signal }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('records nothing for an aborted read', async () => {
    const controller = new AbortController();
    controller.abort();
    const fake = client();
    await fake.getArtist(firstArtist, { signal: controller.signal }).catch(() => undefined);
    expect(fake.calls).toEqual([]);
  });
});
