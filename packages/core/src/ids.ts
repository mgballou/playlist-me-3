/**
 * Branded ids. Spec §2 and CLAUDE.md: passing an artist id where a track id belongs
 * must fail typecheck, not at runtime.
 *
 * The brand is a compile-time fiction — at runtime every id is a plain string. So the
 * guards below can only answer "is this a usable id string", never "is this a track id
 * rather than an album id". They exist for narrowing `unknown` at a decode boundary
 * (§6), and they are honest about the limit rather than implying more.
 */

import { InvalidId } from './errors';

export type TrackId = string & { readonly __brand: 'TrackId' };
export type ArtistId = string & { readonly __brand: 'ArtistId' };
export type AlbumId = string & { readonly __brand: 'AlbumId' };
export type PlaylistId = string & { readonly __brand: 'PlaylistId' };
export type RecipeId = string & { readonly __brand: 'RecipeId' };

/** True when `value` is a non-blank string, which is all any id must be. */
function isIdString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function assertIdString(value: unknown, idKind: string): string {
  if (typeof value !== 'string') throw InvalidId.notAString(idKind);
  if (value.trim().length === 0) throw InvalidId.empty(idKind);
  return value;
}

// Each constructor casts because a brand has no runtime witness — no type guard can
// produce one. `assertIdString` above is the real guarantee.
export function trackId(value: unknown): TrackId {
  return assertIdString(value, 'TrackId') as TrackId;
}

export function artistId(value: unknown): ArtistId {
  return assertIdString(value, 'ArtistId') as ArtistId;
}

export function albumId(value: unknown): AlbumId {
  return assertIdString(value, 'AlbumId') as AlbumId;
}

export function playlistId(value: unknown): PlaylistId {
  return assertIdString(value, 'PlaylistId') as PlaylistId;
}

export function recipeId(value: unknown): RecipeId {
  return assertIdString(value, 'RecipeId') as RecipeId;
}

export function isTrackId(value: unknown): value is TrackId {
  return isIdString(value);
}

export function isArtistId(value: unknown): value is ArtistId {
  return isIdString(value);
}

export function isAlbumId(value: unknown): value is AlbumId {
  return isIdString(value);
}

export function isPlaylistId(value: unknown): value is PlaylistId {
  return isIdString(value);
}

export function isRecipeId(value: unknown): value is RecipeId {
  return isIdString(value);
}
