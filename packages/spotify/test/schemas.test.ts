import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { MalformedResponse } from '../src/index';
import { captureError } from './capture';
import {
  albumSchema,
  artistSchema,
  errorResponseSchema,
  parseResponse,
  playlistItemsPageSchema,
  savedTracksPageSchema,
  searchResponseSchema,
  trackSchema,
  userPlaylistsPageSchema,
} from '../src/schemas';
import {
  albumPayload,
  artistPayload,
  pagePayload,
  trackPayload,
  userPlaylistPayload,
} from './payloads';

describe('parseResponse', () => {
  it('returns the parsed value for a good payload', () => {
    expect(parseResponse(artistSchema, artistPayload(), 'GET /artists/{id}').name).toBe(
      'Velvet Kettle',
    );
  });

  it('throws a typed error for a bad payload', () => {
    const thrown = captureError(() => parseResponse(artistSchema, { name: 42 }, 'GET /artists'));
    expect(thrown).toBeInstanceOf(MalformedResponse);
  });

  it('never lets a raw zod error reach the caller', () => {
    const thrown = captureError(() => parseResponse(artistSchema, { name: 42 }, 'GET /artists'));
    expect(thrown).not.toBeInstanceOf(ZodError);
  });

  it('names the endpoint that misbehaved', () => {
    try {
      parseResponse(artistSchema, {}, 'GET /artists/{id}');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(MalformedResponse);
    }
  });

  it('names the field that misbehaved', () => {
    try {
      parseResponse(albumSchema, albumPayload({ total_tracks: 'nine' }), 'GET /albums/{id}');
      expect.unreachable();
    } catch (error) {
      expect(error instanceof MalformedResponse ? error.path : '').toBe('total_tracks');
    }
  });

  it('carries a stable code', () => {
    try {
      parseResponse(artistSchema, {}, 'GET /artists/{id}');
      expect.unreachable();
    } catch (error) {
      expect(error instanceof MalformedResponse ? error.code : '').toBe('malformedResponse');
    }
  });
});

describe('artistSchema', () => {
  it('accepts an artist with no genres field at all', () => {
    expect(artistSchema.parse({ id: 'ar-1', name: 'Copper Kestrel' }).genres).toEqual([]);
  });

  it('accepts an artist Spotify has not classified', () => {
    expect(artistSchema.parse(artistPayload({ genres: [] })).genres).toEqual([]);
  });

  it('rejects an artist with no id', () => {
    expect(artistSchema.safeParse({ name: 'Copper Kestrel' }).success).toBe(false);
  });

  it('rejects an artist with a blank id', () => {
    expect(artistSchema.safeParse({ id: '', name: 'Copper Kestrel' }).success).toBe(false);
  });

  it('ignores fields that were removed for development-mode apps', () => {
    const parsed = artistSchema.parse(artistPayload({ popularity: 61, followers: { total: 900 } }));
    expect(Object.keys(parsed).sort()).toEqual(['genres', 'id', 'name']);
  });
});

describe('albumSchema', () => {
  it('accepts a year-only release date', () => {
    expect(
      albumSchema.parse(albumPayload({ release_date: '1974', release_date_precision: 'year' }))
        .release_date,
    ).toBe('1974');
  });

  it('accepts an album with no precision field', () => {
    const payload = albumPayload();
    delete payload.release_date_precision;
    expect(albumSchema.safeParse(payload).success).toBe(true);
  });

  it('rejects a negative track count', () => {
    expect(albumSchema.safeParse(albumPayload({ total_tracks: -1 })).success).toBe(false);
  });
});

describe('trackSchema', () => {
  it('requires an album', () => {
    const payload = trackPayload();
    delete payload.album;
    expect(trackSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects a track numbered from zero', () => {
    expect(trackSchema.safeParse(trackPayload({ track_number: 0 })).success).toBe(false);
  });

  it('accepts a track with no preview url', () => {
    expect(trackSchema.safeParse(trackPayload({ preview_url: null })).success).toBe(true);
  });
});

describe('playlistItemsPageSchema', () => {
  it('keeps a real track', () => {
    const page = playlistItemsPageSchema.parse(pagePayload([{ track: trackPayload() }]));
    expect(page.items[0]?.track?.id).toBe('tr-301');
  });

  it('turns a removed track into a hole rather than failing the page', () => {
    const page = playlistItemsPageSchema.parse(pagePayload([{ track: null }]));
    expect(page.items[0]?.track).toBeNull();
  });

  it('turns a podcast episode into a hole rather than failing the page', () => {
    const page = playlistItemsPageSchema.parse(
      pagePayload([{ track: { id: 'ep-1', type: 'episode' } }]),
    );
    expect(page.items[0]?.track).toBeNull();
  });

  it('keeps the good items in a page that holds one bad one', () => {
    const page = playlistItemsPageSchema.parse(
      pagePayload([{ track: trackPayload() }, { track: null }, { track: trackPayload() }]),
    );
    expect(page.items.filter((item) => item.track !== null)).toHaveLength(2);
  });
});

describe('userPlaylistsPageSchema', () => {
  it('keeps a real playlist', () => {
    const page = userPlaylistsPageSchema.parse(pagePayload([userPlaylistPayload()]));
    expect(page.items[0]?.id).toBe('pl-401');
  });

  it('reads the track total off it', () => {
    const page = userPlaylistsPageSchema.parse(pagePayload([userPlaylistPayload()]));
    expect(page.items[0]?.tracks?.total).toBe(40);
  });

  it('accepts a playlist with no track object', () => {
    const page = userPlaylistsPageSchema.parse(
      pagePayload([userPlaylistPayload({ tracks: undefined })]),
    );
    expect(page.items[0]?.tracks).toBeUndefined();
  });

  it('turns a deleted playlist into a hole rather than failing the page', () => {
    const page = userPlaylistsPageSchema.parse(pagePayload([null]));
    expect(page.items[0]).toBeNull();
  });

  it('keeps the good items in a page that holds one bad one', () => {
    const page = userPlaylistsPageSchema.parse(
      pagePayload([userPlaylistPayload(), { name: 'no id' }, userPlaylistPayload()]),
    );
    expect(page.items.filter((item) => item !== null)).toHaveLength(2);
  });
});

describe('savedTracksPageSchema', () => {
  it('reads the track off each saved item', () => {
    const page = savedTracksPageSchema.parse(pagePayload([{ track: trackPayload() }]));
    expect(page.items[0]?.track.name).toBe('Copper Hallway');
  });

  it('rejects a saved item with no track', () => {
    expect(savedTracksPageSchema.safeParse(pagePayload([{ track: null }])).success).toBe(false);
  });
});

describe('searchResponseSchema', () => {
  it('accepts a response with only tracks', () => {
    const parsed = searchResponseSchema.parse({ tracks: pagePayload([trackPayload()]) });
    expect(parsed.albums).toBeUndefined();
  });

  it('accepts a response with only albums', () => {
    const parsed = searchResponseSchema.parse({ albums: pagePayload([albumPayload()]) });
    expect(parsed.tracks).toBeUndefined();
  });

  it('accepts an empty response', () => {
    expect(searchResponseSchema.parse({})).toEqual({});
  });
});

describe('errorResponseSchema', () => {
  it('reads the reason that separates a quota from a rate limit', () => {
    const parsed = errorResponseSchema.parse({
      error: { status: 429, message: 'Too many', reason: 'QUOTA_EXCEEDED' },
    });
    expect(parsed.error.reason).toBe('QUOTA_EXCEEDED');
  });

  it('accepts an error body with no reason', () => {
    expect(errorResponseSchema.parse({ error: { status: 500 } }).error.reason).toBeUndefined();
  });
});
