import { artistId, playlistId } from '@pm/core';
import { describe, expect, it } from 'vitest';

import { COVER_GEOMETRY, coverPlan, wrapName } from '@/lib/cover/plan';
import { lightSideOf } from '@/lib/cover/palette';
import { SOURCE_DEFINITIONS } from '@/lib/registry/sources';
import { makeRecipe } from './support/pool';

/**
 * §11.1: the cover is a fingerprint, not a random pattern — deterministic from the recipe's
 * own content, and different across recipes because the recipes are different. The plan is
 * the whole of the geometry, so this is a plain assertion. The raster it paints is a
 * person's job and an image diff's, not this file's (§15).
 */

const artistRecipe = makeRecipe({
  sources: [{ kind: 'artist', artistId: artistId('ar-1'), depth: 'albums' }],
});

const twoSources = makeRecipe({
  sources: [{ kind: 'artist', artistId: artistId('ar-1'), depth: 'albums' }, { kind: 'library' }],
});

describe('the cover is deterministic', () => {
  it('draws the same bands for the same recipe', () => {
    expect(coverPlan(artistRecipe).bands).toEqual(coverPlan(artistRecipe).bands);
  });

  it('draws the same notches for the same recipe', () => {
    expect(coverPlan(artistRecipe).notches).toEqual(coverPlan(artistRecipe).notches);
  });

  it('draws the same name lines for the same recipe', () => {
    expect(coverPlan(artistRecipe).nameLines).toEqual(coverPlan(artistRecipe).nameLines);
  });
});

describe('the cover differs across recipes', () => {
  it('differs when a source is added', () => {
    expect(coverPlan(twoSources).bands).not.toEqual(coverPlan(artistRecipe).bands);
  });

  it('differs when a source kind changes', () => {
    const searched = makeRecipe({
      sources: [{ kind: 'search', query: 'dub', obscurity: 'any' }],
    });
    expect(coverPlan(searched).bands[0]?.tone).not.toBe(coverPlan(artistRecipe).bands[0]?.tone);
  });

  it('differs when an exclusion is added', () => {
    const blocked = makeRecipe({
      ...artistRecipe,
      exclusions: [{ kind: 'inLibrary' }],
    });
    expect(coverPlan(blocked).bars).not.toEqual(coverPlan(artistRecipe).bars);
  });

  it('differs when a dial moves', () => {
    const deeper = makeRecipe({
      ...artistRecipe,
      shape: { ...artistRecipe.shape, depth: 0.1 as typeof artistRecipe.shape.depth },
    });
    expect(coverPlan(deeper).notches).not.toEqual(coverPlan(artistRecipe).notches);
  });

  it('differs when the name changes', () => {
    const renamed = makeRecipe({ ...artistRecipe, name: 'Late dub, nothing I know' });
    expect(coverPlan(renamed).nameLines).not.toEqual(coverPlan(artistRecipe).nameLines);
  });
});

describe('every mark means something', () => {
  it('gives one band per source', () => {
    expect(coverPlan(twoSources).bands).toHaveLength(2);
  });

  it('gives one bar per exclusion', () => {
    const blocked = makeRecipe({
      ...artistRecipe,
      exclusions: [{ kind: 'inLibrary' }, { kind: 'playlist', playlistId: playlistId('pl-1') }],
    });
    expect(coverPlan(blocked).bars).toHaveLength(2);
  });

  it('takes each band’s tone from the source registry', () => {
    expect(coverPlan(artistRecipe).bands[0]?.tone).toBe(SOURCE_DEFINITIONS.artist.tone);
  });

  it('holds a token name rather than a color', () => {
    expect(coverPlan(artistRecipe).bands[0]?.tone).toMatch(/^--/);
  });

  it('puts the notch where the dial is', () => {
    const recipe = makeRecipe({
      ...artistRecipe,
      shape: { ...artistRecipe.shape, depth: 0.25 as typeof artistRecipe.shape.depth },
    });
    expect(coverPlan(recipe).notches[0].position).toBe(0.25);
  });

  it('fills the width with the bands when there is no build to weigh them by', () => {
    const total = coverPlan(twoSources).bands.reduce((sum, band) => sum + band.width, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it('strikes the bars across the bands rather than listing them underneath', () => {
    expect(COVER_GEOMETRY.barsTop).toBeLessThan(COVER_GEOMETRY.bandsBottom);
  });

  it('keeps the bars inside the band block', () => {
    expect(COVER_GEOMETRY.barsBottom).toBeLessThanOrEqual(COVER_GEOMETRY.bandsBottom);
  });
});

describe('a recipe with no sources draws the empty state', () => {
  it('says it is empty', () => {
    expect(coverPlan(makeRecipe()).empty).toBe(true);
  });

  it('draws no bands', () => {
    expect(coverPlan(makeRecipe()).bands).toHaveLength(0);
  });

  it('is not empty once there is a source', () => {
    expect(coverPlan(artistRecipe).empty).toBe(false);
  });
});

describe('a long name cannot run off the art', () => {
  it('never exceeds three lines', () => {
    expect(
      wrapName('An extremely long recipe name that nobody would ever sensibly type in here'),
    ).toHaveLength(3);
  });

  it('breaks a single unbroken word rather than overflowing', () => {
    expect(wrapName('Supercalifragilisticexpialidocious')[0]?.length).toBeLessThanOrEqual(18);
  });

  it('draws nothing for an empty name', () => {
    expect(wrapName('   ')).toHaveLength(0);
  });
});

describe('the palette reads the light side of a token', () => {
  it('picks the light value from a light-dark pair', () => {
    expect(lightSideOf('light-dark(oklch(96% 0 0), oklch(17% 0 0))')).toBe('oklch(96% 0 0)');
  });

  it('leaves a plain value alone', () => {
    expect(lightSideOf(' oklch(86% 0.17 95) ')).toBe('oklch(86% 0.17 95)');
  });
});
