import { trackId } from '@pm/core';
import { describe, expect, it } from 'vitest';

import { captureError } from './capture';

import {
  ADD_ITEMS_MAX_URIS,
  COVER_MAX_BYTES,
  INCLUDE_GROUPS,
  InvalidRequest,
  SEARCH_MAX_LIMIT,
  SEARCH_MAX_OFFSET,
  TIME_RANGES,
  albumSearchTerms,
  assertAddBatch,
  assertCoverSize,
  assertPageLimit,
  assertSearchWindow,
  createRequestCounter,
  nextSearchOffset,
  trackSearchTerms,
  trackUri,
} from '../src/index';

describe('trackSearchTerms', () => {
  it('passes free text through', () => {
    expect(trackSearchTerms({ terms: 'rainy morning', limit: 10, offset: 0 })).toBe(
      'rainy morning',
    );
  });

  it('quotes a genre filter', () => {
    expect(trackSearchTerms({ terms: 'dub', genre: 'harbour dub', limit: 10, offset: 0 })).toBe(
      'dub genre:"harbour dub"',
    );
  });

  it('writes a year range', () => {
    expect(
      trackSearchTerms({ terms: 'dub', years: { from: 1990, to: 1999 }, limit: 10, offset: 0 }),
    ).toBe('dub year:1990-1999');
  });

  it('writes a single year when the range is one year wide', () => {
    expect(
      trackSearchTerms({ terms: 'dub', years: { from: 1994, to: 1994 }, limit: 10, offset: 0 }),
    ).toBe('dub year:1994');
  });

  it('drops an empty genre', () => {
    expect(trackSearchTerms({ terms: 'dub', genre: '  ', limit: 10, offset: 0 })).toBe('dub');
  });
});

describe('albumSearchTerms', () => {
  it('writes the hipster tag', () => {
    expect(albumSearchTerms({ terms: 'dub', tag: 'hipster', limit: 10, offset: 0 })).toBe(
      'dub tag:hipster',
    );
  });

  it('writes the new tag', () => {
    expect(albumSearchTerms({ terms: '', tag: 'new', limit: 10, offset: 0 })).toBe('tag:new');
  });

  it('combines a tag with a year range', () => {
    expect(
      albumSearchTerms({
        terms: 'dub',
        tag: 'hipster',
        years: { from: 2010, to: 2019 },
        limit: 10,
        offset: 0,
      }),
    ).toBe('dub tag:hipster year:2010-2019');
  });
});

describe('assertSearchWindow', () => {
  it('accepts the documented maximum', () => {
    expect(() => assertSearchWindow(SEARCH_MAX_LIMIT, SEARCH_MAX_OFFSET)).not.toThrow();
  });

  it('refuses a limit above ten', () => {
    expect(captureError(() => assertSearchWindow(50, 0))).toBeInstanceOf(InvalidRequest);
  });

  it('refuses a limit of zero', () => {
    expect(captureError(() => assertSearchWindow(0, 0))).toBeInstanceOf(InvalidRequest);
  });

  it('refuses an offset past the ceiling', () => {
    expect(captureError(() => assertSearchWindow(10, SEARCH_MAX_OFFSET + 1))).toBeInstanceOf(
      InvalidRequest,
    );
  });
});

describe('assertPageLimit', () => {
  it('accepts fifty', () => {
    expect(() => assertPageLimit(50)).not.toThrow();
  });

  it('refuses fifty-one', () => {
    expect(captureError(() => assertPageLimit(51))).toBeInstanceOf(InvalidRequest);
  });
});

describe('assertAddBatch', () => {
  const ids = (count: number) =>
    Array.from({ length: count }, (_, index) => trackId(`tr-${String(index)}`));

  it('accepts a hundred uris', () => {
    expect(() => assertAddBatch(ids(ADD_ITEMS_MAX_URIS))).not.toThrow();
  });

  it('refuses a hundred and one', () => {
    expect(captureError(() => assertAddBatch(ids(ADD_ITEMS_MAX_URIS + 1)))).toBeInstanceOf(
      InvalidRequest,
    );
  });

  it('refuses an empty batch', () => {
    expect(captureError(() => assertAddBatch([]))).toBeInstanceOf(InvalidRequest);
  });
});

describe('assertCoverSize', () => {
  it('accepts a cover at the limit', () => {
    expect(() => assertCoverSize('x'.repeat(COVER_MAX_BYTES))).not.toThrow();
  });

  it('refuses a cover over the limit', () => {
    expect(captureError(() => assertCoverSize('x'.repeat(COVER_MAX_BYTES + 1)))).toBeInstanceOf(
      InvalidRequest,
    );
  });
});

describe('nextSearchOffset', () => {
  it('offers the next page after a full one', () => {
    expect(nextSearchOffset(0, 10, 10).nextOffset).toBe(10);
  });

  it('stops after a short page', () => {
    expect(nextSearchOffset(0, 10, 4).nextOffset).toBeNull();
  });

  it('stops at the offset ceiling', () => {
    expect(nextSearchOffset(SEARCH_MAX_OFFSET, 10, 10).nextOffset).toBeNull();
  });

  it('says when it stopped at the ceiling rather than the end', () => {
    expect(nextSearchOffset(SEARCH_MAX_OFFSET, 10, 10).atOffsetCeiling).toBe(true);
  });

  it('does not blame the ceiling for an ordinary end', () => {
    expect(nextSearchOffset(0, 10, 4).atOffsetCeiling).toBe(false);
  });
});

describe('parameter mappings', () => {
  it('maps albums depth to one include group', () => {
    expect(INCLUDE_GROUPS.albums).toBe('album');
  });

  it('maps albumsAndSingles depth to two include groups', () => {
    expect(INCLUDE_GROUPS.albumsAndSingles).toBe('album,single');
  });

  it('maps everything depth to all four include groups', () => {
    expect(INCLUDE_GROUPS.everything).toBe('album,single,compilation,appears_on');
  });

  it('maps shortTerm to Spotify short_term', () => {
    expect(TIME_RANGES.shortTerm).toBe('short_term');
  });

  it('maps mediumTerm to Spotify medium_term', () => {
    expect(TIME_RANGES.mediumTerm).toBe('medium_term');
  });

  it('maps longTerm to Spotify long_term', () => {
    expect(TIME_RANGES.longTerm).toBe('long_term');
  });
});

describe('trackUri', () => {
  it('builds the uri form the add endpoint wants', () => {
    expect(trackUri(trackId('tr-301'))).toBe('spotify:track:tr-301');
  });
});

describe('createRequestCounter', () => {
  it('starts at nothing', () => {
    expect(createRequestCounter().snapshot().total).toBe(0);
  });

  it('counts every request', () => {
    const counter = createRequestCounter();
    counter.record('GET /me');
    counter.record('GET /me');
    expect(counter.snapshot().total).toBe(2);
  });

  it('groups by endpoint', () => {
    const counter = createRequestCounter();
    counter.record('GET /me');
    counter.record('GET /albums/{id}');
    expect(counter.snapshot().byEndpoint.get('GET /me')).toBe(1);
  });

  it('counts cache hits apart from requests', () => {
    const counter = createRequestCounter();
    counter.recordCacheHit();
    expect(counter.snapshot()).toEqual({ total: 0, cacheHits: 1, byEndpoint: new Map() });
  });

  it('hands back a snapshot that does not move', () => {
    const counter = createRequestCounter();
    const before = counter.snapshot();
    counter.record('GET /me');
    expect(before.total).toBe(0);
  });

  it('resets', () => {
    const counter = createRequestCounter();
    counter.record('GET /me');
    counter.reset();
    expect(counter.snapshot().total).toBe(0);
  });
});
