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

/**
 * A lookup's answer, and **where the answer came from**.
 *
 * `demoNotice` is the sentence to print when the rows are invented, and null when they came
 * out of a person's own Spotify. It travels with the rows rather than being read from
 * somewhere beside them, so a picker cannot list fixtures while implying it read a library —
 * the rows and the provenance arrive in one value or not at all.
 *
 * It carries the words rather than a flag because the words are `@pm/spotify`'s own
 * `DEMO_NOTICE`, and a client component may not import that package to reach them: doing so
 * would pull the whole fake catalog and the live client into the browser bundle.
 */
export type CatalogLookup<T> =
  | { readonly ok: true; readonly items: readonly T[]; readonly demoNotice: string | null }
  | { readonly ok: false; readonly message: string };
