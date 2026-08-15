import type { Recipe, Track } from '@pm/core';
import { NEUTRAL_DIAL, albumId, artistId, defaultRecipe, recipeId, trackId } from '@pm/core';

export function makeTrack(index: number, overrides: Partial<Track> = {}): Track {
  const artist = index % 5;
  return {
    id: trackId(`tr-${String(index)}`),
    title: `Track ${String(index)}`,
    artists: [{ id: artistId(`ar-${String(artist)}`), name: `Act ${String(artist)}` }],
    album: { id: albumId(`al-${String(artist)}`), title: `Album ${String(artist)}` },
    releaseYear: 1990 + (index % 30),
    durationMs: 180_000 + index * 1000,
    explicit: false,
    trackNumber: (index % 10) + 1,
    albumTrackCount: 10,
    artistGenres: ['harbour dub'],
    sourceIndex: 0,
    ...overrides,
  };
}

export function makePool(size: number): readonly Track[] {
  return Array.from({ length: size }, (_, index) => makeTrack(index));
}

export function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  const base = defaultRecipe(recipeId('rc-test'), 'Test recipe');
  return {
    ...base,
    ...overrides,
    shape: {
      ...base.shape,
      familiarity: NEUTRAL_DIAL,
      depth: NEUTRAL_DIAL,
      ...(overrides.shape ?? {}),
    },
  };
}
