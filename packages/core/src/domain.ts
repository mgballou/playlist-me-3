/**
 * The normalized music domain. Spec §4: these are our types, not Spotify's shapes —
 * mapping Spotify's JSON onto them is `packages/spotify`'s only job at the boundary,
 * and `core` never sees the wire format.
 *
 * Every field is `readonly`. The domain is immutable.
 */

import type { AlbumId, ArtistId, PlaylistId, TrackId } from './ids';

/** Just enough of an artist to render a credit and enforce `maxPerArtist`. */
export type ArtistRef = {
  readonly id: ArtistId;
  readonly name: string;
};

/** Just enough of an album to render a line and sort by release. */
export type AlbumRef = {
  readonly id: AlbumId;
  readonly title: string;
};

export type Artist = {
  readonly id: ArtistId;
  readonly name: string;
  readonly genres: readonly string[];
  /** Albums Spotify lists for this artist. Spec §3.5 calls it a weak obscurity proxy. */
  readonly catalogSize: number;
};

export type Album = {
  readonly id: AlbumId;
  readonly title: string;
  readonly artists: readonly ArtistRef[];
  readonly releaseYear: number;
  readonly trackCount: number;
};

/**
 * A track carries everything §3.5 scoring needs, flattened onto it so the engine never
 * has to walk back to an album or artist record mid-pass.
 *
 * `sourceIndex` is provenance: the position in `Recipe.sources` of the source that
 * contributed this track. `sourceInterleaved` ordering (§2.4) and the per-source
 * contribution counts in the build report (§3.2) both read it. A track that reached the
 * pool through more than one source appears once, credited to the first source that
 * found it — resolution dedupes upstream in `packages/spotify`.
 */
export type Track = {
  readonly id: TrackId;
  readonly title: string;
  readonly artists: readonly ArtistRef[];
  readonly album: AlbumRef;
  readonly releaseYear: number;
  readonly durationMs: number;
  readonly explicit: boolean;
  /** 1-based, as Spotify numbers them. */
  readonly trackNumber: number;
  /** Total tracks on the album this one came from. The depth proxy needs both. §3.5 */
  readonly albumTrackCount: number;
  /** The union of the credited artists' genres. §3.5 */
  readonly artistGenres: readonly string[];
  readonly sourceIndex: number;
};

/** The resolved corpus a build runs against. Spec §3.1. */
export type TrackPool = readonly Track[];

/**
 * Everything the engine needs to know about the person, passed in as plain sets so the
 * engine does no I/O (§3.1). `packages/spotify` fills these from the user endpoints;
 * tests fill them by hand.
 */
export type EngineContext = {
  /** Saved tracks. Backs the `inLibrary` exclusion and familiarity scoring. */
  readonly libraryTrackIds: ReadonlySet<TrackId>;
  /** Top tracks across the requested range. The strongest familiarity signal. §3.5 */
  readonly topTrackIds: ReadonlySet<TrackId>;
  /** Recently played. Backs the `heardRecently` exclusion. */
  readonly recentlyHeardTrackIds: ReadonlySet<TrackId>;
  /** Followed artists. A weaker familiarity signal than a saved track. */
  readonly followedArtistIds: ReadonlySet<ArtistId>;
  /** Contents of each playlist named by a `playlist` exclusion. */
  readonly playlistTrackIds: ReadonlyMap<PlaylistId, ReadonlySet<TrackId>>;
};

/** A context that knows nothing about the person. Useful as a base in tests and demos. */
export function emptyContext(): EngineContext {
  return {
    libraryTrackIds: new Set(),
    topTrackIds: new Set(),
    recentlyHeardTrackIds: new Set(),
    followedArtistIds: new Set(),
    playlistTrackIds: new Map(),
  };
}

/** A track pinned to a slot. Spec §3.3 — locks are build input, never post-processing. */
export type Lock = {
  /** 0-based slot in the finished playlist. */
  readonly index: number;
  readonly trackId: TrackId;
};

export function poolSize(pool: TrackPool): number {
  return pool.length;
}

export function totalDurationMs(tracks: readonly Track[]): number {
  return tracks.reduce((sum, track) => sum + track.durationMs, 0);
}
