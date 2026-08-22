import { describe, expect, it } from 'vitest';

import type { Exclusion, Recipe, Source } from '../src/index';
import {
  RECIPE_SCHEMA_VERSION,
  artistId,
  decodeRecipe,
  decodeShare,
  defaultRecipe,
  dial,
  encodeRecipe,
  encodeShare,
  playlistId,
  recipeId,
  trackId,
} from '../src/index';
import { makeRecipe, makeShape } from './fixtures/index';

const everySource: readonly Source[] = [
  { kind: 'artist', artistId: artistId('ar-nova'), depth: 'everything' },
  { kind: 'track', trackId: trackId('tr-000'), expand: 'collaborators' },
  { kind: 'search', query: 'genre:shoegaze year:1990-1999', obscurity: 'obscure' },
  {
    kind: 'search',
    query: 'rain',
    genre: 'ambient',
    years: { from: 1980, to: 1989 },
    obscurity: 'any',
  },
  { kind: 'playlist', playlistId: playlistId('pl-kids') },
  { kind: 'library' },
  { kind: 'topTracks', range: 'longTerm' },
  { kind: 'followedArtists', depth: 'albumsAndSingles' },
  { kind: 'newReleases' },
  { kind: 'newReleases', genre: 'techno' },
];

const everyExclusion: readonly Exclusion[] = [
  { kind: 'artist', artistId: artistId('ar-vole') },
  { kind: 'playlist', playlistId: playlistId('pl-kids') },
  { kind: 'inLibrary' },
  { kind: 'heardRecently' },
  { kind: 'years', range: { from: 2015, to: 2020 } },
  { kind: 'duration', range: { minMs: 0, maxMs: 90_000 } },
  { kind: 'explicit' },
  { kind: 'liveOrRemix' },
];

const roundTrip = (recipe: Recipe): Recipe => {
  const result = decodeRecipe(encodeRecipe(recipe));
  if (!result.ok) throw result.error;
  return result.value;
};

const encodeVersion = (version: number): string => {
  const payload = JSON.stringify({
    v: version,
    i: 'rc-1',
    n: 'Name',
    s: [],
    x: [],
    h: [0, 10, 2, 0, 0.5, 0.5],
  });
  return Buffer.from(payload, 'utf8').toString('base64url');
};

describe('round trip', () => {
  it('survives a default recipe', () => {
    const recipe = defaultRecipe(recipeId('rc-1'), 'Kitchen radio');
    expect(roundTrip(recipe)).toEqual(recipe);
  });

  it('survives every source kind', () => {
    const recipe = makeRecipe({ sources: everySource });
    expect(roundTrip(recipe)).toEqual(recipe);
  });

  it('survives every exclusion kind', () => {
    const recipe = makeRecipe({ exclusions: everyExclusion });
    expect(roundTrip(recipe)).toEqual(recipe);
  });

  it('survives a duration target', () => {
    const recipe = makeRecipe({
      shape: makeShape({ target: { kind: 'duration', ms: 3_600_000 } }),
    });
    expect(roundTrip(recipe)).toEqual(recipe);
  });

  it('survives every order strategy', () => {
    const recipe = makeRecipe({ shape: makeShape({ order: 'sourceInterleaved' }) });
    expect(roundTrip(recipe).shape.order).toBe('sourceInterleaved');
  });

  it('survives dials at the extremes', () => {
    const recipe = makeRecipe({
      shape: makeShape({ familiarity: dial(0), depth: dial(1) }),
    });
    expect(roundTrip(recipe).shape).toEqual(recipe.shape);
  });

  it('survives an awkward name', () => {
    const recipe = makeRecipe({ name: 'Rén — "the quiet" 🎧 / 50%' });
    expect(roundTrip(recipe).name).toBe('Rén — "the quiet" 🎧 / 50%');
  });

  it('keeps an absent optional field absent', () => {
    const recipe = makeRecipe({ sources: [{ kind: 'newReleases' }] });
    expect(Object.keys(roundTrip(recipe).sources[0] ?? {})).toEqual(['kind']);
  });

  it('survives an empty search query', () => {
    const recipe = makeRecipe({
      sources: [{ kind: 'search', query: '', obscurity: 'any' }],
    });
    expect(roundTrip(recipe)).toEqual(recipe);
  });

  it('survives an empty recipe name', () => {
    const recipe = makeRecipe({ name: '' });
    expect(roundTrip(recipe).name).toBe('');
  });
});

describe('the encoded form', () => {
  it('is url safe', () => {
    const encoded = encodeRecipe(makeRecipe({ sources: everySource }));
    expect(/^[A-Za-z0-9_-]*$/.test(encoded)).toBe(true);
  });

  it('is shorter than the raw JSON it replaces', () => {
    const recipe = makeRecipe({ sources: everySource, exclusions: everyExclusion });
    expect(encodeRecipe(recipe).length).toBeLessThan(JSON.stringify(recipe).length);
  });

  it('is stable for the same recipe', () => {
    const recipe = makeRecipe({ sources: everySource });
    expect(encodeRecipe(recipe)).toBe(encodeRecipe(recipe));
  });
});

describe('the shared deck', () => {
  const shared = {
    recipe: makeRecipe({ sources: everySource, exclusions: everyExclusion }),
    seed: 1_234_567_890,
    locks: [
      { index: 0, trackId: trackId('0eGsygTp906u18L0Oimnem') },
      { index: 7, trackId: trackId('3TVXtAsR1Inumwj472S9r4') },
    ],
    poolStamp: 'x8f2ab',
  } as const;

  const roundTripShare = () => {
    const result = decodeShare(encodeShare(shared));
    if (!result.ok) throw result.error;
    return result.value;
  };

  it('brings the seed back', () => {
    expect(roundTripShare().seed).toBe(shared.seed);
  });

  it('brings the locks back', () => {
    expect(roundTripShare().locks).toEqual(shared.locks);
  });

  it('brings the pool stamp back', () => {
    expect(roundTripShare().poolStamp).toBe(shared.poolStamp);
  });

  it('brings the recipe back', () => {
    expect(roundTripShare().recipe).toEqual(shared.recipe);
  });

  it('reads a recipe-only string, with no seed', () => {
    const result = decodeShare(encodeRecipe(shared.recipe));
    expect(result.ok ? result.value.seed : 'unread').toBeNull();
  });

  it('reads a recipe-only string as having no locks', () => {
    const result = decodeShare(encodeRecipe(shared.recipe));
    expect(result.ok ? result.value.locks : null).toEqual([]);
  });

  /**
   * The deck rides in a URL, so its size is a design constraint rather than a detail. The
   * seed and the stamp cost a flat ~47 characters; each lock costs ~33, because a Spotify
   * id is 22 characters and base64 charges four for every three. This pins the ceiling for
   * a recipe larger than anyone builds by hand.
   */
  it('leaves a large deck short enough to paste anywhere', () => {
    const locks = Array.from({ length: 12 }, (_, index) => ({
      index,
      trackId: trackId(`0eGsygTp906u18L0Oimn${String(index).padStart(2, '0')}`),
    }));
    expect(encodeShare({ ...shared, locks }).length).toBeLessThan(2000);
  });
});

describe('decoding failures', () => {
  it('refuses a string that is not base64url', () => {
    expect(decodeRecipe('not a recipe!!').ok).toBe(false);
  });

  it('names the base64 failure', () => {
    const result = decodeRecipe('***');
    expect(result.ok ? null : result.error.reason).toBe('notBase64');
  });

  it('refuses base64 that is not JSON', () => {
    const result = decodeRecipe(Buffer.from('hello', 'utf8').toString('base64url'));
    expect(result.ok ? null : result.error.reason).toBe('notJson');
  });

  it('refuses JSON that is not an object', () => {
    const result = decodeRecipe(Buffer.from('[1,2,3]', 'utf8').toString('base64url'));
    expect(result.ok ? null : result.error.reason).toBe('notJson');
  });

  it('refuses a future schema version', () => {
    const result = decodeRecipe(encodeVersion(RECIPE_SCHEMA_VERSION + 1));
    expect(result.ok ? null : result.error.reason).toBe('wrongVersion');
  });

  it('reports the version it found', () => {
    const result = decodeRecipe(encodeVersion(99));
    expect(result.ok ? null : result.error.detail).toBe('99');
  });

  it('refuses a missing id', () => {
    const payload = JSON.stringify({ v: 1, n: 'x', s: [], x: [], h: [0, 1, 1, 0, 0.5, 0.5] });
    const result = decodeRecipe(Buffer.from(payload, 'utf8').toString('base64url'));
    expect(result.ok ? null : result.error.detail).toBe('id');
  });

  it('refuses a missing name', () => {
    const payload = JSON.stringify({ v: 1, i: 'rc-1', s: [], x: [], h: [0, 1, 1, 0, 0.5, 0.5] });
    const result = decodeRecipe(Buffer.from(payload, 'utf8').toString('base64url'));
    expect(result.ok ? null : result.error.detail).toBe('name');
  });

  it('refuses an unknown source code', () => {
    const payload = JSON.stringify({
      v: 1,
      i: 'rc-1',
      n: 'x',
      s: [[42]],
      x: [],
      h: [0, 1, 1, 0, 0.5, 0.5],
    });
    const result = decodeRecipe(Buffer.from(payload, 'utf8').toString('base64url'));
    expect(result.ok ? null : result.error.detail).toBe('sources');
  });

  it('refuses an unknown exclusion code', () => {
    const payload = JSON.stringify({
      v: 1,
      i: 'rc-1',
      n: 'x',
      s: [],
      x: [[42]],
      h: [0, 1, 1, 0, 0.5, 0.5],
    });
    const result = decodeRecipe(Buffer.from(payload, 'utf8').toString('base64url'));
    expect(result.ok ? null : result.error.detail).toBe('exclusions');
  });

  it('refuses a dial outside its range', () => {
    const payload = JSON.stringify({
      v: 1,
      i: 'rc-1',
      n: 'x',
      s: [],
      x: [],
      h: [0, 1, 1, 0, 4, 0.5],
    });
    const result = decodeRecipe(Buffer.from(payload, 'utf8').toString('base64url'));
    expect(result.ok ? null : result.error.detail).toBe('shape');
  });

  it('refuses an unknown order strategy', () => {
    const payload = JSON.stringify({
      v: 1,
      i: 'rc-1',
      n: 'x',
      s: [],
      x: [],
      h: [0, 1, 1, 9, 0.5, 0.5],
    });
    const result = decodeRecipe(Buffer.from(payload, 'utf8').toString('base64url'));
    expect(result.ok ? null : result.error.detail).toBe('shape');
  });

  it('refuses a truncated link', () => {
    const encoded = encodeRecipe(makeRecipe());
    expect(decodeRecipe(encoded.slice(0, 12)).ok).toBe(false);
  });

  it('never throws on random input', () => {
    const samples = ['', 'a', 'ab', 'abc', 'abcd', '____', '----', 'AAAAAAAA'];
    expect(() => samples.map(decodeRecipe)).not.toThrow();
  });

  it('rejects an empty string as a recipe', () => {
    expect(decodeRecipe('').ok).toBe(false);
  });
});
