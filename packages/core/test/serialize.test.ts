import { describe, expect, it } from 'vitest';

import type { Exclusion, Recipe, Source, TrackId } from '../src/index';
import {
  RECIPE_SCHEMA_VERSION,
  artistId,
  build,
  decodeRecipe,
  decodeShare,
  defaultRecipe,
  dial,
  encodeRecipe,
  encodeShare,
  playlistId,
  poolStamp,
  recipeId,
  trackId,
} from '../src/index';
import { makeContext, makePool, makeRecipe, makeShape } from './fixtures/index';

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
    rejects: [trackId('1301WleyT98MSxVHPZCA6M'), trackId('7ouMYWpwJ422jRcDASZB7P')],
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

  it('brings the banished tracks back', () => {
    expect(roundTripShare().rejects).toEqual(shared.rejects);
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

  it('reads a recipe-only string as having banished nothing', () => {
    const result = decodeShare(encodeRecipe(shared.recipe));
    expect(result.ok ? result.value.rejects : null).toEqual([]);
  });

  /**
   * A link made before the rejects travelled carries every other key and not this one. It has
   * to keep opening, and it has to open as what it meant: a deck with nothing banished.
   */
  it('opens a link written before the rejects travelled', () => {
    const older = encodeShare({ ...shared, rejects: [] });
    const result = decodeShare(older);
    expect(result.ok ? result.value.locks : null).toEqual(shared.locks);
  });

  it('reads a link written before the rejects travelled as having banished nothing', () => {
    const result = decodeShare(encodeShare({ ...shared, rejects: [] }));
    expect(result.ok ? result.value.rejects : null).toEqual([]);
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

  /**
   * The rejects are the one part of the deck with no ceiling — a person can banish all night.
   * Twenty of them is a heavy evening's tinkering and costs ~33 characters each, on top of a
   * recipe holding every source and every exclusion there is. 2000 is the practical floor
   * across browsers and chat clients, so this is the number that says the URL can hold them.
   */
  it('leaves twenty banished tracks short enough to paste anywhere', () => {
    const rejects = Array.from({ length: 20 }, (_, index) =>
      trackId(`0eGsygTp906u18L0Oimn${String(index).padStart(2, '0')}`),
    );
    expect(encodeShare({ ...shared, rejects }).length).toBeLessThan(2000);
  });
});

/**
 * Finding 2 of the 9 September hostile read, as an assertion. A deck built with rejects and
 * a deck built without them are different decks from one seed, and the pool stamp cannot
 * tell them apart because the pool is the same one — so the link reported `exact` while nine
 * of twelve slots had moved. The reproduction is the whole round trip, not the codec alone.
 */
describe('a shared deck opens on the deck that was shared', () => {
  const pool = makePool();
  const context = makeContext();
  const recipe = makeRecipe({ shape: makeShape({ target: { kind: 'count', count: 12 } }) });
  const seed = 1_234_567_890;

  const banishThree = (): {
    readonly rejects: ReadonlySet<TrackId>;
    readonly mine: readonly TrackId[];
    readonly theirs: readonly TrackId[];
  } => {
    const first = build({ pool, recipe, seed, context });
    const rejects = new Set(first.tracks.slice(0, 3).map((track) => track.id));
    const mine = build({ pool, recipe, seed, context, rejects });

    const opened = decodeShare(
      encodeShare({ recipe, seed, locks: [], rejects: [...rejects], poolStamp: poolStamp(pool) }),
    );
    if (!opened.ok) throw opened.error;

    const theirs = build({
      pool,
      recipe: opened.value.recipe,
      seed: opened.value.seed ?? 0,
      context,
      locks: opened.value.locks,
      rejects: new Set(opened.value.rejects),
    });

    return {
      rejects,
      mine: mine.tracks.map((track) => track.id),
      theirs: theirs.tracks.map((track) => track.id),
    };
  };

  it('gives the same twelve slots', () => {
    const { mine, theirs } = banishThree();
    expect(theirs).toEqual(mine);
  });

  it('leaves the banished tracks out', () => {
    const { rejects, theirs } = banishThree();
    expect(theirs.filter((id) => rejects.has(id))).toEqual([]);
  });

  it('says the pool is the one the deck was built from', () => {
    const opened = decodeShare(
      encodeShare({ recipe, seed, locks: [], rejects: [], poolStamp: poolStamp(pool) }),
    );
    expect(opened.ok ? opened.value.poolStamp : null).toBe(poolStamp(pool));
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
