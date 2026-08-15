import { describe, expect, it } from 'vitest';

import {
  CATALOG_DEPTHS,
  DEFAULT_MAX_PER_ARTIST,
  DEFAULT_TRACK_COUNT,
  InvalidDial,
  NEUTRAL_DIAL,
  OBSCURITIES,
  ORDER_STRATEGIES,
  RECIPE_SCHEMA_VERSION,
  TOP_RANGES,
  TRACK_EXPANSIONS,
  clampDial,
  defaultRecipe,
  dial,
  hasSources,
  isDial,
  recipeId,
} from '../src/index';
import { captureError } from './fixtures/index';

describe('dial', () => {
  it('accepts the low end', () => {
    expect(dial(0)).toBe(0);
  });

  it('accepts the high end', () => {
    expect(dial(1)).toBe(1);
  });

  it('rejects a value above one', () => {
    expect(captureError(() => dial(1.0001))).toBeInstanceOf(InvalidDial);
  });

  it('rejects a value below zero', () => {
    expect(captureError(() => dial(-0.5))).toBeInstanceOf(InvalidDial);
  });

  it('rejects NaN', () => {
    expect(captureError(() => dial(Number.NaN))).toBeInstanceOf(InvalidDial);
  });

  it('reports the offending value', () => {
    expect(InvalidDial.outOfRange(4).value).toBe(4);
  });

  it('clamps an overshoot', () => {
    expect(clampDial(1.4)).toBe(1);
  });

  it('clamps an undershoot', () => {
    expect(clampDial(-2)).toBe(0);
  });

  it('still refuses an infinity when clamping', () => {
    expect(captureError(() => clampDial(Number.POSITIVE_INFINITY))).toBeInstanceOf(InvalidDial);
  });

  it('guards a valid value', () => {
    expect(isDial(0.25)).toBe(true);
  });

  it('guards away a string', () => {
    expect(isDial('0.5')).toBe(false);
  });

  it('puts neutral at the midpoint', () => {
    expect(NEUTRAL_DIAL).toBe(0.5);
  });
});

describe('literal sets', () => {
  it('lists three catalog depths', () => {
    expect(CATALOG_DEPTHS).toEqual(['albums', 'albumsAndSingles', 'everything']);
  });

  it('lists three track expansions', () => {
    expect(TRACK_EXPANSIONS).toEqual(['album', 'collaborators', 'both']);
  });

  it('lists two obscurity settings', () => {
    expect(OBSCURITIES).toEqual(['any', 'obscure']);
  });

  it('lists three top ranges', () => {
    expect(TOP_RANGES).toEqual(['shortTerm', 'mediumTerm', 'longTerm']);
  });

  it('lists the four order strategies from the spec', () => {
    expect(ORDER_STRATEGIES).toEqual([
      'shuffle',
      'byRelease',
      'artistClustered',
      'sourceInterleaved',
    ]);
  });
});

describe('defaultRecipe', () => {
  it('starts with no sources', () => {
    expect(defaultRecipe(recipeId('rc-1')).sources).toEqual([]);
  });

  it('starts with no exclusions', () => {
    expect(defaultRecipe(recipeId('rc-1')).exclusions).toEqual([]);
  });

  it('takes the id it was given', () => {
    expect(defaultRecipe(recipeId('rc-42')).id).toBe('rc-42');
  });

  it('takes a name when given one', () => {
    expect(defaultRecipe(recipeId('rc-1'), 'Kitchen radio').name).toBe('Kitchen radio');
  });

  it('targets the default count', () => {
    expect(defaultRecipe(recipeId('rc-1')).shape.target).toEqual({
      kind: 'count',
      count: DEFAULT_TRACK_COUNT,
    });
  });

  it('caps the default tracks per artist', () => {
    expect(defaultRecipe(recipeId('rc-1')).shape.maxPerArtist).toBe(DEFAULT_MAX_PER_ARTIST);
  });

  it('leaves the familiarity dial neutral', () => {
    expect(defaultRecipe(recipeId('rc-1')).shape.familiarity).toBe(0.5);
  });

  it('leaves the depth dial neutral', () => {
    expect(defaultRecipe(recipeId('rc-1')).shape.depth).toBe(0.5);
  });

  it('has no sources yet', () => {
    expect(hasSources(defaultRecipe(recipeId('rc-1')))).toBe(false);
  });
});

describe('schema version', () => {
  it('is pinned', () => {
    expect(RECIPE_SCHEMA_VERSION).toBe(1);
  });
});
