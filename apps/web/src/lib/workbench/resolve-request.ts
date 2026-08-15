/**
 * The line between the two halves of spec §3.1, drawn as types.
 *
 * ```
 * resolve(sources)              → TrackPool     impure. network. a server action.
 * build({ pool, recipe, seed }) → BuildResult   PURE. in the browser. instant.
 * ```
 *
 * What follows from that, and what this module exists to enforce (ui-sensibility §2.10):
 *
 * - **Re-roll, lock, reject and reorder never touch the network.** The pool is already in
 *   hand; `build` is a pure function of it.
 * - **Only a change to the request below costs a request.** `resolveKey` is what the
 *   workbench compares. The shape, the two dials, and every exclusion that reads only the
 *   track itself are absent from it on purpose — moving a dial must be free.
 * - **The one exclusion that does cost** is `playlist`, because "never anything off Kids
 *   Jams" cannot be answered without knowing what is on Kids Jams. That is a fetch, once,
 *   the first time that playlist is named. There is no way to have it for free and pretending
 *   otherwise would just hide the cost.
 *
 * Tokens never appear in any of these types. Only resolved pool data crosses to the browser.
 */

import type { ArtistId, EngineContext, PlaylistId, Recipe, Source, TrackId } from '@pm/core';

export type ResolveRequest = {
  readonly sources: readonly Source[];
  /** Playlists named by a `playlist` exclusion, in a stable order. */
  readonly excludedPlaylistIds: readonly PlaylistId[];
};

export function toResolveRequest(recipe: Recipe): ResolveRequest {
  const excluded = recipe.exclusions
    .flatMap((exclusion) => (exclusion.kind === 'playlist' ? [exclusion.playlistId] : []))
    .sort();
  return { sources: recipe.sources, excludedPlaylistIds: [...new Set(excluded)] };
}

/**
 * Two recipes with the same key resolve to the same pool, so the second one must not spend a
 * request. It is a string rather than a deep comparison because it is compared on every
 * keystroke and it is also what a cache would key on.
 */
export function resolveKey(request: ResolveRequest): string {
  return JSON.stringify([request.sources, request.excludedPlaylistIds]);
}

/**
 * `EngineContext` holds `Set`s and `Map`s. This is the same information as arrays, so that
 * what crosses the server-action boundary is plainly serializable rather than relying on how
 * a framework happens to encode a `Map` this year.
 */
export type ContextPayload = {
  readonly libraryTrackIds: readonly TrackId[];
  readonly topTrackIds: readonly TrackId[];
  readonly recentlyHeardTrackIds: readonly TrackId[];
  readonly followedArtistIds: readonly ArtistId[];
  readonly playlists: readonly {
    readonly playlistId: PlaylistId;
    readonly trackIds: readonly TrackId[];
  }[];
};

export const EMPTY_CONTEXT_PAYLOAD: ContextPayload = {
  libraryTrackIds: [],
  topTrackIds: [],
  recentlyHeardTrackIds: [],
  followedArtistIds: [],
  playlists: [],
};

export function toEngineContext(payload: ContextPayload): EngineContext {
  return {
    libraryTrackIds: new Set(payload.libraryTrackIds),
    topTrackIds: new Set(payload.topTrackIds),
    recentlyHeardTrackIds: new Set(payload.recentlyHeardTrackIds),
    followedArtistIds: new Set(payload.followedArtistIds),
    playlistTrackIds: new Map(
      payload.playlists.map((entry) => [entry.playlistId, new Set(entry.trackIds)]),
    ),
  };
}
