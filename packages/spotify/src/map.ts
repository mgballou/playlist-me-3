/**
 * Pure functions from validated Spotify shapes onto the normalized domain (§4). Nothing
 * here touches the network, so every one is directly unit-testable.
 *
 * `packages/core` never sees a wire shape; this module is the whole of the translation.
 */

import type { Album, AlbumRef, Artist, ArtistRef, Track } from '@pm/core';
import { albumId, artistId, trackId } from '@pm/core';

import type {
  AlbumPayload,
  ArtistPayload,
  ArtistRefPayload,
  SimplifiedTrackPayload,
  TrackPayload,
} from './schemas';

/**
 * A track as the catalog knows it. `sourceIndex` is provenance the resolver stamps on
 * (§2.2.0) — the client has no idea which source asked for a track, and pretending
 * otherwise would put a first-source-wins decision in eight places instead of one.
 */
export type CatalogTrack = Omit<Track, 'sourceIndex'>;

/**
 * What a release year is when the date cannot be read. Every real `release_date` starts
 * with four digits, but "0000" and empty strings do turn up, and dropping a whole album
 * over a bad date field would be the wrong trade.
 */
export const UNKNOWN_RELEASE_YEAR = 0;

const YEAR_PREFIX = /^(\d{4})(?:-\d{2}(?:-\d{2})?)?$/;

/**
 * `release_date` arrives at one of three precisions — `YYYY`, `YYYY-MM`, `YYYY-MM-DD` —
 * and all three answer the only question the engine asks of it.
 */
export function parseReleaseYear(releaseDate: string): number {
  const match = YEAR_PREFIX.exec(releaseDate.trim());
  if (match === null) return UNKNOWN_RELEASE_YEAR;
  const year = Number(match[1]);
  return year > 0 ? year : UNKNOWN_RELEASE_YEAR;
}

export function toArtistRef(payload: ArtistRefPayload): ArtistRef {
  return { id: artistId(payload.id), name: payload.name };
}

export function toAlbumRef(payload: AlbumPayload): AlbumRef {
  return { id: albumId(payload.id), title: payload.name };
}

/**
 * `catalogSize` is not on the artist object — it is the size of `GET /artists/{id}/albums`
 * (§3.5, a weak obscurity proxy), so it arrives from whoever walked the discography and is
 * zero for an artist nobody has walked.
 */
export function mapArtist(payload: ArtistPayload, catalogSize = 0): Artist {
  return {
    id: artistId(payload.id),
    name: payload.name,
    genres: [...payload.genres],
    catalogSize,
  };
}

export function mapAlbum(payload: AlbumPayload): Album {
  return {
    id: albumId(payload.id),
    title: payload.name,
    artists: payload.artists.map(toArtistRef),
    releaseYear: parseReleaseYear(payload.release_date),
    trackCount: payload.total_tracks,
  };
}

/**
 * A full track carries its own album, so `trackNumber` and `albumTrackCount` — both halves
 * of the depth proxy (§3.5) — come straight off the payload.
 */
export function mapTrack(payload: TrackPayload): CatalogTrack {
  return {
    id: trackId(payload.id),
    title: payload.name,
    artists: payload.artists.map(toArtistRef),
    album: toAlbumRef(payload.album),
    releaseYear: parseReleaseYear(payload.album.release_date),
    durationMs: payload.duration_ms,
    explicit: payload.explicit,
    trackNumber: payload.track_number,
    albumTrackCount: payload.album.total_tracks,
    artistGenres: [],
  };
}

/**
 * `GET /albums/{id}/tracks` returns tracks with no album and no release date, so the
 * album has to come along. `albumTrackCount` prefers the album's own count over the page
 * size, since a paged album would otherwise report a fraction of itself.
 */
export function mapAlbumTrack(payload: SimplifiedTrackPayload, album: Album): CatalogTrack {
  return {
    id: trackId(payload.id),
    title: payload.name,
    artists: payload.artists.map(toArtistRef),
    album: { id: album.id, title: album.title },
    releaseYear: album.releaseYear,
    durationMs: payload.duration_ms,
    explicit: payload.explicit,
    trackNumber: payload.track_number,
    albumTrackCount: Math.max(album.trackCount, payload.track_number),
    artistGenres: [],
  };
}

/**
 * The union of the credited artists' genres, in credit order and deduped. An artist we
 * never looked up, or one Spotify has not classified, contributes nothing — which is the
 * normal case, not the edge case (§3.5.1).
 */
export function withArtistGenres(
  track: CatalogTrack,
  genresByArtist: ReadonlyMap<string, readonly string[]>,
): CatalogTrack {
  const seen = new Set<string>();
  for (const artist of track.artists) {
    for (const genre of genresByArtist.get(artist.id) ?? []) seen.add(genre);
  }
  if (seen.size === 0)
    return track.artistGenres.length === 0 ? track : { ...track, artistGenres: [] };
  return { ...track, artistGenres: [...seen] };
}

/** Stamps provenance on a catalog track. First source wins; the resolver decides which. */
export function withSourceIndex(track: CatalogTrack, sourceIndex: number): Track {
  return { ...track, sourceIndex };
}
