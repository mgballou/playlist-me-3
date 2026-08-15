import type { Recipe } from '@pm/core';
import { artistId, clampDial, defaultRecipe, playlistId, recipeId } from '@pm/core';
import { describe, expect, it } from 'vitest';

import {
  deleteRecipe,
  exportRecipes,
  importRecipes,
  listRecipes,
  loadPlace,
  loadRecipe,
  recipeFromSearch,
  recipeSearchParam,
  savePlace,
  saveRecipe,
} from '@/lib/persistence/recipes';
import { memoryStore } from '@/lib/persistence/store';

const SAVED_AT = 1_770_000_000_000;

function recipe(): Recipe {
  const base = defaultRecipe(recipeId('r-1'), 'Late dub, nothing I know');
  return {
    ...base,
    sources: [
      { kind: 'artist', artistId: artistId('a-1'), depth: 'albumsAndSingles' },
      {
        kind: 'search',
        query: 'dub',
        genre: 'dub',
        years: { from: 1975, to: 1985 },
        obscurity: 'obscure',
      },
    ],
    exclusions: [{ kind: 'playlist', playlistId: playlistId('pl-kids') }, { kind: 'inLibrary' }],
    shape: { ...base.shape, familiarity: clampDial(0.2), depth: clampDial(0.8), maxPerArtist: 3 },
  };
}

describe('saving a recipe', () => {
  it('reads back the same sources', async () => {
    const store = memoryStore();
    await saveRecipe({ store, recipe: recipe(), savedAt: SAVED_AT });
    const loaded = await loadRecipe(store, recipeId('r-1'));
    expect(loaded?.ok === true ? loaded.value.sources : null).toEqual(recipe().sources);
  });

  it('reads back the same exclusions', async () => {
    const store = memoryStore();
    await saveRecipe({ store, recipe: recipe(), savedAt: SAVED_AT });
    const loaded = await loadRecipe(store, recipeId('r-1'));
    expect(loaded?.ok === true ? loaded.value.exclusions : null).toEqual(recipe().exclusions);
  });

  it('reads back the same shape', async () => {
    const store = memoryStore();
    await saveRecipe({ store, recipe: recipe(), savedAt: SAVED_AT });
    const loaded = await loadRecipe(store, recipeId('r-1'));
    expect(loaded?.ok === true ? loaded.value.shape : null).toEqual(recipe().shape);
  });

  it('reads back the name', async () => {
    const store = memoryStore();
    await saveRecipe({ store, recipe: recipe(), savedAt: SAVED_AT });
    const loaded = await loadRecipe(store, recipeId('r-1'));
    expect(loaded?.ok === true ? loaded.value.name : null).toBe('Late dub, nothing I know');
  });

  it('answers null for a recipe that was never saved', async () => {
    await expect(loadRecipe(memoryStore(), recipeId('missing'))).resolves.toBeNull();
  });

  it('forgets a deleted recipe', async () => {
    const store = memoryStore();
    await saveRecipe({ store, recipe: recipe(), savedAt: SAVED_AT });
    await deleteRecipe(store, recipeId('r-1'));
    await expect(loadRecipe(store, recipeId('r-1'))).resolves.toBeNull();
  });
});

describe('the shelf', () => {
  it('lists what was saved', async () => {
    const store = memoryStore();
    await saveRecipe({ store, recipe: recipe(), savedAt: SAVED_AT });
    await expect(listRecipes(store)).resolves.toHaveLength(1);
  });

  it('lists newest first', async () => {
    const store = memoryStore();
    const older = { ...recipe(), id: recipeId('r-old') };
    await saveRecipe({ store, recipe: older, savedAt: SAVED_AT - 1000 });
    await saveRecipe({ store, recipe: recipe(), savedAt: SAVED_AT });
    const listed = await listRecipes(store);
    expect(listed[0]?.id).toBe('r-1');
  });

  it('ignores anything in storage that is not a recipe', async () => {
    const store = memoryStore(new Map([['recipe:junk', { nonsense: true }]]));
    await expect(listRecipes(store)).resolves.toHaveLength(0);
  });
});

describe('export and import', () => {
  it('round-trips through JSON', async () => {
    const store = memoryStore();
    await saveRecipe({ store, recipe: recipe(), savedAt: SAVED_AT });
    const exported = exportRecipes(await listRecipes(store));
    expect(importRecipes(exported)).toEqual(await listRecipes(store));
  });

  it('refuses a file that is not JSON', () => {
    expect(importRecipes('{not json')).toBeNull();
  });

  it('refuses a file written by another schema version', () => {
    expect(importRecipes(JSON.stringify({ version: 999, recipes: [] }))).toBeNull();
  });
});

describe('the shared link', () => {
  it('carries the whole recipe', () => {
    const decoded = recipeFromSearch(`?${recipeSearchParam(recipe())}`);
    expect(decoded?.ok === true ? decoded.value.sources : null).toEqual(recipe().sources);
  });

  it('is nothing at all when the URL carries no recipe', () => {
    expect(recipeFromSearch('?other=1')).toBeNull();
  });

  it('reports a damaged link rather than throwing', () => {
    const decoded = recipeFromSearch('?r=%%%not-a-recipe');
    expect(decoded?.ok).toBe(false);
  });
});

describe('holding the place', () => {
  it('restores the recipe after a reload', async () => {
    const store = memoryStore();
    await savePlace({ store, recipe: recipe(), seed: 4242, savedAt: SAVED_AT });
    const place = await loadPlace(store);
    expect(place?.recipe.sources).toEqual(recipe().sources);
  });

  it('restores the seed, which is what reproduces the build exactly', async () => {
    const store = memoryStore();
    await savePlace({ store, recipe: recipe(), seed: 4242, savedAt: SAVED_AT });
    const place = await loadPlace(store);
    expect(place?.seed).toBe(4242);
  });

  it('restores the dials, so a mid-tune reload loses nothing', async () => {
    const store = memoryStore();
    await savePlace({ store, recipe: recipe(), seed: 1, savedAt: SAVED_AT });
    const place = await loadPlace(store);
    expect(place?.recipe.shape.depth).toBe(0.8);
  });

  it('answers null when there is nothing held', async () => {
    await expect(loadPlace(memoryStore())).resolves.toBeNull();
  });

  it('answers null rather than throwing when what was held is damaged', async () => {
    const store = memoryStore(new Map([['place', { encoded: 'rubbish', seed: 1, savedAt: 1 }]]));
    await expect(loadPlace(store)).resolves.toBeNull();
  });
});
