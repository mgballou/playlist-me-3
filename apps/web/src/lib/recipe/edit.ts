/**
 * Editing a recipe, as functions. CLAUDE.md: a Recipe is data and only data, and anything
 * that wants to *do* something with one is a function that takes one.
 *
 * This is where the bench's intents live, so no component holds business logic — a module
 * dispatches `addSource(recipe, source)` and renders the result. Every function here returns
 * a new recipe and mutates nothing.
 */

import type {
  Dial,
  Exclusion,
  ExclusionKind,
  OrderStrategy,
  Recipe,
  Source,
  Target,
} from '@pm/core';
import { clampDial } from '@pm/core';

export function addSource(recipe: Recipe, source: Source): Recipe {
  return { ...recipe, sources: [...recipe.sources, source] };
}

export function replaceSource(recipe: Recipe, index: number, source: Source): Recipe {
  return {
    ...recipe,
    sources: recipe.sources.map((held, at) => (at === index ? source : held)),
  };
}

/**
 * Removing a source renumbers the ones after it, which is exactly what `sourceIndex` means
 * (spec §2.2.0) — so the pool is stale the moment this returns and the workbench re-resolves.
 * That is the honest behavior: the pool was built from a source list that no longer exists.
 */
export function removeSource(recipe: Recipe, index: number): Recipe {
  return { ...recipe, sources: recipe.sources.filter((_, at) => at !== index) };
}

export function addExclusion(recipe: Recipe, exclusion: Exclusion): Recipe {
  return { ...recipe, exclusions: [...recipe.exclusions, exclusion] };
}

export function removeExclusion(recipe: Recipe, index: number): Recipe {
  return { ...recipe, exclusions: recipe.exclusions.filter((_, at) => at !== index) };
}

/**
 * True when this exclusion is already on the recipe. A second "nothing in my library" does
 * nothing but take a row, and offering it again is how a list fills with duplicates.
 */
export function hasExclusion(recipe: Recipe, exclusion: Exclusion): boolean {
  return recipe.exclusions.some((held) => sameExclusion(held, exclusion));
}

export function sameExclusion(left: Exclusion, right: Exclusion): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'artist' && right.kind === 'artist') return left.artistId === right.artistId;
  if (left.kind === 'playlist' && right.kind === 'playlist') {
    return left.playlistId === right.playlistId;
  }
  return left.kind !== 'years' && left.kind !== 'duration';
}

/** The kinds that take no subject, so a second one would be a duplicate of the first. */
export function singletonExclusionKinds(recipe: Recipe): ReadonlySet<ExclusionKind> {
  return new Set(
    recipe.exclusions.flatMap((exclusion) =>
      exclusion.kind === 'artist' ||
      exclusion.kind === 'playlist' ||
      exclusion.kind === 'years' ||
      exclusion.kind === 'duration'
        ? []
        : [exclusion.kind],
    ),
  );
}

export function setName(recipe: Recipe, name: string): Recipe {
  return { ...recipe, name };
}

export function setTarget(recipe: Recipe, target: Target): Recipe {
  return { ...recipe, shape: { ...recipe.shape, target } };
}

export function setMaxPerArtist(recipe: Recipe, maxPerArtist: number): Recipe {
  return {
    ...recipe,
    shape: { ...recipe.shape, maxPerArtist: Math.max(1, Math.trunc(maxPerArtist)) },
  };
}

export function setOrder(recipe: Recipe, order: OrderStrategy): Recipe {
  return { ...recipe, shape: { ...recipe.shape, order } };
}

/** Clamps rather than throws: a drag can overshoot, and that is not an error. */
export function setDial(recipe: Recipe, name: 'familiarity' | 'depth', value: number): Recipe {
  const clamped: Dial = clampDial(value);
  return { ...recipe, shape: { ...recipe.shape, [name]: clamped } };
}

/** Ceilings the target controls offer. Not API limits — judgments about a playlist. */
export const TARGET_COUNT_MIN = 1;
export const TARGET_COUNT_MAX = 200;
export const TARGET_MINUTES_MIN = 5;
export const TARGET_MINUTES_MAX = 600;
export const MS_PER_MINUTE = 60_000;

export function targetMinutes(target: Target): number {
  return target.kind === 'duration' ? Math.round(target.ms / MS_PER_MINUTE) : 0;
}
