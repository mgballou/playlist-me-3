import { albumId, artistId } from '@pm/core';
import { describe, expect, it } from 'vitest';

import {
  UNKNOWN_RELEASE_YEAR,
  mapAlbum,
  mapAlbumTrack,
  mapArtist,
  mapTrack,
  parseReleaseYear,
  toAlbumRef,
  toArtistRef,
  withArtistGenres,
  withSourceIndex,
} from '../src/index';
import { albumSchema, artistSchema, simplifiedTrackSchema, trackSchema } from '../src/schemas';
import { albumPayload, artistPayload, simplifiedTrackPayload, trackPayload } from './payloads';

const artist = artistSchema.parse(artistPayload());
const album = albumSchema.parse(albumPayload());
const track = trackSchema.parse(trackPayload());

describe('parseReleaseYear', () => {
  it('reads a year-only date', () => {
    expect(parseReleaseYear('1974')).toBe(1974);
  });

  it('reads a year-month date', () => {
    expect(parseReleaseYear('1974-03')).toBe(1974);
  });

  it('reads a year-month-day date', () => {
    expect(parseReleaseYear('1974-03-11')).toBe(1974);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseReleaseYear(' 2019 ')).toBe(2019);
  });

  it('falls back for an empty date', () => {
    expect(parseReleaseYear('')).toBe(UNKNOWN_RELEASE_YEAR);
  });

  it('falls back for a zero date', () => {
    expect(parseReleaseYear('0000')).toBe(UNKNOWN_RELEASE_YEAR);
  });

  it('falls back for a date it cannot read', () => {
    expect(parseReleaseYear('spring 1974')).toBe(UNKNOWN_RELEASE_YEAR);
  });
});

describe('mapArtist', () => {
  it('keeps the genres it was given', () => {
    expect(mapArtist(artist).genres).toEqual(['glasshouse pop']);
  });

  it('maps an artist with no genres to an empty array', () => {
    const unclassified = artistSchema.parse(artistPayload({ genres: [] }));
    expect(mapArtist(unclassified).genres).toEqual([]);
  });

  it('maps an artist whose genres field is absent to an empty array', () => {
    const deprecated = artistSchema.parse({ id: 'ar-102', name: 'Bramblewire' });
    expect(mapArtist(deprecated).genres).toEqual([]);
  });

  it('defaults catalogSize to zero until someone walks the discography', () => {
    expect(mapArtist(artist).catalogSize).toBe(0);
  });

  it('takes a catalog size when one is known', () => {
    expect(mapArtist(artist, 7).catalogSize).toBe(7);
  });
});

describe('mapAlbum', () => {
  it('maps the title', () => {
    expect(mapAlbum(album).title).toBe('Neon Tide');
  });

  it('maps the release year', () => {
    expect(mapAlbum(album).releaseYear).toBe(1974);
  });

  it('maps the track count', () => {
    expect(mapAlbum(album).trackCount).toBe(9);
  });

  it('maps the credited artists', () => {
    expect(mapAlbum(album).artists).toEqual([{ id: artistId('ar-101'), name: 'Velvet Kettle' }]);
  });
});

describe('mapTrack', () => {
  it('maps the id', () => {
    expect(mapTrack(track).id).toBe('tr-301');
  });

  it('takes its release year from the album', () => {
    expect(mapTrack(track).releaseYear).toBe(1974);
  });

  it('carries the track number for the depth proxy', () => {
    expect(mapTrack(track).trackNumber).toBe(4);
  });

  it('carries the album track count for the depth proxy', () => {
    expect(mapTrack(track).albumTrackCount).toBe(9);
  });

  it('leaves artist genres for the resolver to fill in', () => {
    expect(mapTrack(track).artistGenres).toEqual([]);
  });

  it('maps a track whose album has only a year', () => {
    const yearOnly = trackSchema.parse(
      trackPayload({
        album: albumPayload({ release_date: '1968', release_date_precision: 'year' }),
      }),
    );
    expect(mapTrack(yearOnly).releaseYear).toBe(1968);
  });
});

describe('mapAlbumTrack', () => {
  const simplified = simplifiedTrackSchema.parse(simplifiedTrackPayload());
  const mapped = mapAlbum(album);

  it('takes the album reference from the album', () => {
    expect(mapAlbumTrack(simplified, mapped).album).toEqual({
      id: albumId('al-201'),
      title: 'Neon Tide',
    });
  });

  it('takes the release year from the album', () => {
    expect(mapAlbumTrack(simplified, mapped).releaseYear).toBe(1974);
  });

  it('takes the album track count from the album', () => {
    expect(mapAlbumTrack(simplified, mapped).albumTrackCount).toBe(9);
  });

  it('never reports fewer album tracks than the position it is mapping', () => {
    const short = { ...mapped, trackCount: 2 };
    expect(mapAlbumTrack(simplified, short).albumTrackCount).toBe(4);
  });
});

describe('withArtistGenres', () => {
  const mapped = mapTrack(
    trackSchema.parse(
      trackPayload({
        artists: [
          { id: 'ar-101', name: 'Velvet Kettle' },
          { id: 'ar-102', name: 'Bramblewire' },
        ],
      }),
    ),
  );

  it('unions the credited artists genres', () => {
    const genres = new Map([
      ['ar-101', ['glasshouse pop']],
      ['ar-102', ['porch folk']],
    ]);
    expect(withArtistGenres(mapped, genres).artistGenres).toEqual(['glasshouse pop', 'porch folk']);
  });

  it('dedupes a genre two credited artists share', () => {
    const genres = new Map([
      ['ar-101', ['harbour dub']],
      ['ar-102', ['harbour dub']],
    ]);
    expect(withArtistGenres(mapped, genres).artistGenres).toEqual(['harbour dub']);
  });

  it('leaves the track alone when no artist was looked up', () => {
    expect(withArtistGenres(mapped, new Map()).artistGenres).toEqual([]);
  });

  it('leaves the track alone when every artist came back unclassified', () => {
    const genres = new Map([['ar-101', []]]);
    expect(withArtistGenres(mapped, genres).artistGenres).toEqual([]);
  });
});

describe('withSourceIndex', () => {
  it('stamps provenance onto a catalog track', () => {
    expect(withSourceIndex(mapTrack(track), 3).sourceIndex).toBe(3);
  });
});

describe('toArtistRef and toAlbumRef', () => {
  it('narrows an artist to a credit', () => {
    expect(toArtistRef({ id: 'ar-101', name: 'Velvet Kettle' })).toEqual({
      id: artistId('ar-101'),
      name: 'Velvet Kettle',
    });
  });

  it('narrows an album to a line', () => {
    expect(toAlbumRef(album)).toEqual({ id: albumId('al-201'), title: 'Neon Tide' });
  });
});
