/**
 * What a picker needs to name a thing. These live outside the `'use server'` module because
 * a file marked `'use server'` may export nothing but async functions, and the browser wants
 * these shapes as types.
 *
 * All three are `{ id, name }` and nothing more. A picker's job is to turn a person's words
 * into an id the recipe can hold; anything richer would be the picker deciding what a source
 * looks like, which is the registry's job (§12).
 */

import type { ArtistId, PlaylistId, TrackId } from '@pm/core';

export type ArtistChoice = {
  readonly id: ArtistId;
  readonly name: string;
  /** How many pooled tracks pointed at this act. Orders the list by relevance, honestly. */
  readonly hits: number;
};

export type TrackChoice = {
  readonly id: TrackId;
  readonly title: string;
  readonly artist: string;
  readonly year: number;
};

/** Structurally `PlaylistSummary` from `@pm/spotify`, named here for what a picker does. */
export type PlaylistChoice = {
  readonly id: PlaylistId;
  readonly name: string;
  readonly trackCount: number;
};

export type CatalogLookup<T> =
  | { readonly ok: true; readonly items: readonly T[] }
  | { readonly ok: false; readonly message: string };
