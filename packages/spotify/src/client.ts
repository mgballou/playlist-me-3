/**
 * The client contract: what the resolver and the save flow need, and the request limits
 * that shape both. Spec §5.1 and §5.1.1.
 *
 * Two implementations ship in this namespace — `LiveSpotifyClient` over HTTP and
 * `FakeSpotifyClient` over the synthetic catalog. The fake is load-bearing (§5.1): demo
 * mode, every integration test and the whole Playwright suite run on it, so anything
 * expressed here has to be honored by both or the fake stops meaning anything.
 */

import type {
  Album,
  AlbumId,
  Artist,
  ArtistId,
  CatalogDepth,
  PlaylistId,
  TopRange,
  TrackId,
  YearRange,
} from '@pm/core';

import { InvalidRequest } from './errors';
import type { CatalogTrack } from './map';

// ---------------------------------------------------------------------------
// The limits, from §5.1.1
// ---------------------------------------------------------------------------

/** `GET /search` was capped at 10 in 2026-02. It defaults to 5, which is worse. */
export const SEARCH_MAX_LIMIT = 10;

/** A single search source can therefore reach 1,000 results across 100 requests. §2.2.1 */
export const SEARCH_MAX_OFFSET = 1000;

/** `/me/top`, `/me/tracks`, `/playlists/{id}/items` — not capped like search. */
export const PAGE_MAX_LIMIT = 50;

/** `POST /playlists/{id}/items` takes 100 URIs per request. */
export const ADD_ITEMS_MAX_URIS = 100;

/** `PUT /playlists/{id}/images` takes base64 JPEG, 256 KB or less, and answers 202. */
export const COVER_MAX_BYTES = 256 * 1024;

/** `include_groups` on `GET /artists/{id}/albums`. §2.2.0 */
export const INCLUDE_GROUPS: Readonly<Record<CatalogDepth, string>> = {
  albums: 'album',
  albumsAndSingles: 'album,single',
  everything: 'album,single,compilation,appears_on',
};

/** `time_range` on `GET /me/top/{type}`. §2.2.0 */
export const TIME_RANGES: Readonly<Record<TopRange, string>> = {
  shortTerm: 'short_term',
  mediumTerm: 'medium_term',
  longTerm: 'long_term',
};

/** Album-scoped search tags. `genre:` is not one of them — see §2.2.1 and `AlbumSearchQuery`. */
export const SEARCH_TAGS = ['hipster', 'new'] as const;
export type SearchTag = (typeof SEARCH_TAGS)[number];

// ---------------------------------------------------------------------------
// Request and response shapes
// ---------------------------------------------------------------------------

export type RequestOptions = {
  readonly signal?: AbortSignal | undefined;
};

/** For the endpoints that page: a ceiling on how much of a long list to pull. */
export type ListOptions = RequestOptions & {
  readonly maxItems?: number | undefined;
};

export type ArtistAlbumsOptions = RequestOptions & {
  readonly depth: CatalogDepth;
  readonly maxItems?: number | undefined;
};

/**
 * `type=track`. Takes `genre:` and `year:`, and cannot take `tag:hipster` — the tag is
 * album-scoped, and a query carrying both silently returns nothing. §2.2.1
 */
export type TrackSearchQuery = {
  readonly terms: string;
  readonly genre?: string | undefined;
  readonly years?: YearRange | undefined;
  readonly limit: number;
  readonly offset: number;
};

/**
 * `type=album`. Takes `tag:` and `year:`, and **has no genre field at all** — not an
 * oversight. `genre:` is artist/track-scoped, so "obscure dub" cannot be one query, and
 * the type refuses to let a caller believe otherwise. Genre coherence comes back at
 * scoring time from `artist.genres` instead. §2.2.1, §3.5
 */
export type AlbumSearchQuery = {
  readonly terms: string;
  readonly tag?: SearchTag | undefined;
  readonly years?: YearRange | undefined;
  readonly limit: number;
  readonly offset: number;
};

export type SearchPage<T> = {
  readonly items: readonly T[];
  readonly limit: number;
  readonly offset: number;
  /** Where the next page starts, or null when there is nothing more to ask for. */
  readonly nextOffset: number | null;
  /** True when paging stopped at Spotify's offset ceiling rather than at the end. */
  readonly atOffsetCeiling: boolean;
};

export type CreatePlaylistInput = {
  readonly name: string;
  readonly description?: string | undefined;
  readonly isPublic: boolean;
};

export type AddTracksInput = {
  readonly playlistId: PlaylistId;
  readonly trackIds: readonly TrackId[];
};

export type CoverUploadInput = {
  readonly playlistId: PlaylistId;
  /** Base64 JPEG, no data URI prefix. */
  readonly base64Jpeg: string;
};

export type SpotifyUser = {
  readonly id: string;
  readonly displayName: string;
};

/**
 * A playlist named but not read. `trackCount` is Spotify's own `tracks.total`, which costs
 * nothing extra — reading the tracks themselves is the request the exclusion pays for
 * later (§3.1).
 */
export type PlaylistSummary = {
  readonly id: PlaylistId;
  readonly name: string;
  readonly trackCount: number;
};

// ---------------------------------------------------------------------------
// Request accounting. §5.2
// ---------------------------------------------------------------------------

/** What a build cost. The UI shows it, because hiding the budget helps nobody. */
export type RequestAccounting = {
  readonly total: number;
  readonly cacheHits: number;
  readonly byEndpoint: ReadonlyMap<string, number>;
};

export type RequestCounter = {
  record(endpoint: string): void;
  recordCacheHit(): void;
  snapshot(): RequestAccounting;
  reset(): void;
};

export function createRequestCounter(): RequestCounter {
  const byEndpoint = new Map<string, number>();
  let total = 0;
  let cacheHits = 0;

  return {
    record(endpoint) {
      total += 1;
      byEndpoint.set(endpoint, (byEndpoint.get(endpoint) ?? 0) + 1);
    },
    recordCacheHit() {
      cacheHits += 1;
    },
    snapshot() {
      return { total, cacheHits, byEndpoint: new Map(byEndpoint) };
    },
    reset() {
      byEndpoint.clear();
      total = 0;
      cacheHits = 0;
    },
  };
}

// ---------------------------------------------------------------------------
// The interface
// ---------------------------------------------------------------------------

export interface SpotifyClient {
  getArtist(id: ArtistId, options?: RequestOptions): Promise<Artist>;
  getArtistAlbums(id: ArtistId, options: ArtistAlbumsOptions): Promise<readonly Album[]>;
  getAlbum(id: AlbumId, options?: RequestOptions): Promise<Album>;
  getAlbumTracks(id: AlbumId, options?: ListOptions): Promise<readonly CatalogTrack[]>;
  getTrack(id: TrackId, options?: RequestOptions): Promise<CatalogTrack>;
  searchTracks(
    query: TrackSearchQuery,
    options?: RequestOptions,
  ): Promise<SearchPage<CatalogTrack>>;
  searchAlbums(query: AlbumSearchQuery, options?: RequestOptions): Promise<SearchPage<Album>>;
  getSavedTracks(options?: ListOptions): Promise<readonly CatalogTrack[]>;
  getTopTracks(range: TopRange, options?: ListOptions): Promise<readonly CatalogTrack[]>;
  getRecentlyPlayed(options?: ListOptions): Promise<readonly CatalogTrack[]>;
  getFollowedArtists(options?: ListOptions): Promise<readonly Artist[]>;
  getPlaylistTracks(id: PlaylistId, options?: ListOptions): Promise<readonly CatalogTrack[]>;
  /**
   * The playlists the person owns or follows. `GET /users/{id}/playlists` went in the
   * 2026-02 cull; the `/me` form did not, and it is what makes the headline exclusion —
   * never anything off this list — a click rather than a pasted link (§2.3).
   */
  getUserPlaylists(options?: ListOptions): Promise<readonly PlaylistSummary[]>;
  currentUser(options?: RequestOptions): Promise<SpotifyUser>;
  createPlaylist(input: CreatePlaylistInput, options?: RequestOptions): Promise<PlaylistId>;
  /** Chunks of 100 are the caller's job to respect; both implementations refuse more. */
  addPlaylistTracks(input: AddTracksInput, options?: RequestOptions): Promise<void>;
  uploadPlaylistCover(input: CoverUploadInput, options?: RequestOptions): Promise<void>;
  /** Every request this client has made. §5.2 */
  readonly requests: RequestCounter;
}

// ---------------------------------------------------------------------------
// Query construction and guards, shared by both implementations
// ---------------------------------------------------------------------------

export function assertSearchWindow(limit: number, offset: number): void {
  if (limit < 1 || limit > SEARCH_MAX_LIMIT)
    throw InvalidRequest.searchLimit(limit, SEARCH_MAX_LIMIT);
  if (offset < 0 || offset > SEARCH_MAX_OFFSET) {
    throw InvalidRequest.searchOffset(offset, SEARCH_MAX_OFFSET);
  }
}

export function assertPageLimit(limit: number): void {
  if (limit < 1 || limit > PAGE_MAX_LIMIT) throw InvalidRequest.pageLimit(limit, PAGE_MAX_LIMIT);
}

export function assertAddBatch(trackIds: readonly TrackId[]): void {
  if (trackIds.length === 0) throw InvalidRequest.emptyBatch();
  if (trackIds.length > ADD_ITEMS_MAX_URIS) {
    throw InvalidRequest.tooManyUris(trackIds.length, ADD_ITEMS_MAX_URIS);
  }
}

export function assertCoverSize(base64Jpeg: string): void {
  if (base64Jpeg.length > COVER_MAX_BYTES) {
    throw InvalidRequest.coverTooLarge(base64Jpeg.length, COVER_MAX_BYTES);
  }
}

function yearFilter(years: YearRange): string {
  return years.from === years.to
    ? `year:${String(years.from)}`
    : `year:${String(years.from)}-${String(years.to)}`;
}

/** `q` for a track search: free text, then the two filters `type=track` accepts. */
export function trackSearchTerms(query: TrackSearchQuery): string {
  const parts: string[] = [];
  if (query.terms.trim().length > 0) parts.push(query.terms.trim());
  if (query.genre !== undefined && query.genre.trim().length > 0) {
    parts.push(`genre:"${query.genre.trim()}"`);
  }
  if (query.years !== undefined) parts.push(yearFilter(query.years));
  return parts.join(' ');
}

/** `q` for an album search: free text, then `tag:` and `year:`. Never `genre:`. §2.2.1 */
export function albumSearchTerms(query: AlbumSearchQuery): string {
  const parts: string[] = [];
  if (query.terms.trim().length > 0) parts.push(query.terms.trim());
  if (query.tag !== undefined) parts.push(`tag:${query.tag}`);
  if (query.years !== undefined) parts.push(yearFilter(query.years));
  return parts.join(' ');
}

export function trackUri(id: TrackId): string {
  return `spotify:track:${id}`;
}

/**
 * Where the next page starts, or null at the end. A search that would page past
 * `SEARCH_MAX_OFFSET` stops there and says so, because "we ran out" and "Spotify will not
 * show us any more" are different answers and the report tells them apart (§2.2.1).
 */
export function nextSearchOffset(
  offset: number,
  limit: number,
  returned: number,
): { readonly nextOffset: number | null; readonly atOffsetCeiling: boolean } {
  if (returned < limit) return { nextOffset: null, atOffsetCeiling: false };
  const next = offset + limit;
  if (next > SEARCH_MAX_OFFSET) return { nextOffset: null, atOffsetCeiling: true };
  return { nextOffset: next, atOffsetCeiling: false };
}
