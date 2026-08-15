/**
 * Saved recipes and the held place. Spec §6, ui-sensibility §2.5.
 *
 * Everything is stored as the **encoded recipe string** rather than as a fanned-out object,
 * so the shelf, the export file and the shared link all travel through `encodeRecipe` /
 * `decodeRecipe`. One codec, one schema version, one thing to get right — and a recipe that
 * round-trips through a link round-trips through storage by construction.
 *
 * The place is a recipe **and a seed**. The seed is one number and it reproduces the build
 * exactly (spec §3.1), so someone mid-tune who reloads has lost nothing — not the recipe,
 * and not the deck they were looking at.
 */

import type { DecodeError, Recipe, RecipeId, Result } from '@pm/core';
import { RECIPE_SCHEMA_VERSION, decodeRecipe, encodeRecipe, recipeId } from '@pm/core';
import { z } from 'zod';

import type { SectionId } from '../layout/sections';
import { isSectionId } from '../layout/sections';
import type { KeyValueStore } from './store';

export const RECIPE_KEY_PREFIX = 'recipe:';
export const PLACE_KEY = 'place';

/**
 * The section a narrow layout is showing (§7.1), held **beside** the place rather than inside
 * it. One record with two writers is a clobber waiting to happen: the workbench rebuilds the
 * whole place object whenever the recipe or the seed moves, and it does not know which key is
 * pressed in. Two keys, two owners, no read-modify-write.
 */
export const SECTION_KEY = 'section';

/** `?r=<encoded>` — the whole recipe, no server, no row. §6 */
export const RECIPE_URL_PARAM = 'r';

export type SavedRecipe = {
  readonly id: RecipeId;
  readonly name: string;
  readonly encoded: string;
  readonly savedAt: number;
};

export type Place = {
  readonly encoded: string;
  readonly seed: number;
  readonly savedAt: number;
};

const savedSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  encoded: z.string().min(1),
  savedAt: z.number().finite(),
});

const placeSchema = z.object({
  encoded: z.string().min(1),
  seed: z.number().finite(),
  savedAt: z.number().finite(),
});

const exportSchema = z.object({
  version: z.number(),
  recipes: z.array(savedSchema),
});

function keyOf(id: RecipeId): string {
  return `${RECIPE_KEY_PREFIX}${id}`;
}

function toSaved(record: unknown): SavedRecipe | null {
  const parsed = savedSchema.safeParse(record);
  if (!parsed.success) return null;
  // Storage round-trips the id as a plain string; `recipeId` puts the brand back on.
  return { ...parsed.data, id: recipeId(parsed.data.id) };
}

export function toSavedRecipe(recipe: Recipe, savedAt: number): SavedRecipe {
  return { id: recipe.id, name: recipe.name, encoded: encodeRecipe(recipe), savedAt };
}

export async function saveRecipe(args: {
  readonly store: KeyValueStore;
  readonly recipe: Recipe;
  readonly savedAt: number;
}): Promise<SavedRecipe> {
  const saved = toSavedRecipe(args.recipe, args.savedAt);
  await args.store.write(keyOf(args.recipe.id), saved);
  return saved;
}

/** Null when nothing is stored under that id; a `DecodeError` when what is stored is damaged. */
export async function loadRecipe(
  store: KeyValueStore,
  id: RecipeId,
): Promise<Result<Recipe, DecodeError> | null> {
  const saved = toSaved(await store.read(keyOf(id)));
  return saved === null ? null : decodeRecipe(saved.encoded);
}

export async function deleteRecipe(store: KeyValueStore, id: RecipeId): Promise<void> {
  await store.remove(keyOf(id));
}

/** Newest first, which is the order the shelf wants. */
export async function listRecipes(store: KeyValueStore): Promise<readonly SavedRecipe[]> {
  const keys = (await store.keys()).filter((key) => key.startsWith(RECIPE_KEY_PREFIX));
  const records = await Promise.all(keys.map((key) => store.read(key)));
  return records
    .flatMap((record) => {
      const saved = toSaved(record);
      return saved === null ? [] : [saved];
    })
    .sort((a, b) => b.savedAt - a.savedAt);
}

// ---------------------------------------------------------------------------
// The held place. §2.5
// ---------------------------------------------------------------------------

export async function savePlace(args: {
  readonly store: KeyValueStore;
  readonly recipe: Recipe;
  readonly seed: number;
  readonly savedAt: number;
}): Promise<void> {
  const place: Place = {
    encoded: encodeRecipe(args.recipe),
    seed: args.seed,
    savedAt: args.savedAt,
  };
  await args.store.write(PLACE_KEY, place);
}

export type RestoredPlace = {
  readonly recipe: Recipe;
  readonly seed: number;
};

/** Null when there is nothing to restore, or when what was there cannot be read. */
export async function loadPlace(store: KeyValueStore): Promise<RestoredPlace | null> {
  const parsed = placeSchema.safeParse(await store.read(PLACE_KEY));
  if (!parsed.success) return null;
  const decoded = decodeRecipe(parsed.data.encoded);
  return decoded.ok ? { recipe: decoded.value, seed: parsed.data.seed } : null;
}

export async function forgetPlace(store: KeyValueStore): Promise<void> {
  await store.remove(PLACE_KEY);
}

/** **The selected section survives a reload** (§7.1, §2.5). */
export async function saveSection(store: KeyValueStore, section: SectionId): Promise<void> {
  await store.write(SECTION_KEY, section);
}

/** Null when nothing was held, or when what was held is not a section this build has. */
export async function loadSection(store: KeyValueStore): Promise<SectionId | null> {
  const held = await store.read(SECTION_KEY);
  return isSectionId(held) ? held : null;
}

// ---------------------------------------------------------------------------
// Export, import, and the shared link. §6
// ---------------------------------------------------------------------------

export function exportRecipes(recipes: readonly SavedRecipe[]): string {
  return JSON.stringify({ version: RECIPE_SCHEMA_VERSION, recipes }, null, 2);
}

/** A pasted file is an ordinary thing to be malformed, so this returns rather than throws. */
export function importRecipes(json: string): readonly SavedRecipe[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  const file = exportSchema.safeParse(parsed);
  if (!file.success || file.data.version !== RECIPE_SCHEMA_VERSION) return null;
  return file.data.recipes.map((record) => ({ ...record, id: recipeId(record.id) }));
}

export function recipeSearchParam(recipe: Recipe): string {
  return `${RECIPE_URL_PARAM}=${encodeRecipe(recipe)}`;
}

/** Null when the URL carries no recipe at all — which is not a failure, just the plain app. */
export function recipeFromSearch(search: string): Result<Recipe, DecodeError> | null {
  const encoded = new URLSearchParams(search).get(RECIPE_URL_PARAM);
  if (encoded === null || encoded.length === 0) return null;
  return decodeRecipe(encoded);
}
