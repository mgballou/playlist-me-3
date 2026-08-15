/**
 * The single public surface of `@pm/spotify`. Named exports only.
 *
 * CLAUDE.md: no barrel re-exports across packages beyond each package's `src/index.ts`.
 * Anything not listed here is an internal of the client and reaching for it is a layering
 * break. Dependencies flow web → spotify → core, never the other way (§4).
 */

export {
  AuthFailed,
  InvalidRequest,
  MalformedResponse,
  NotFound,
  QuotaExceeded,
  RateLimited,
  RequestFailed,
  SpotifyError,
} from './errors';

export type {
  AddTracksInput,
  AlbumSearchQuery,
  ArtistAlbumsOptions,
  CoverUploadInput,
  CreatePlaylistInput,
  ListOptions,
  PlaylistSummary,
  RequestAccounting,
  RequestCounter,
  RequestOptions,
  SearchPage,
  SearchTag,
  SpotifyClient,
  SpotifyUser,
  TrackSearchQuery,
} from './client';
export {
  ADD_ITEMS_MAX_URIS,
  COVER_MAX_BYTES,
  INCLUDE_GROUPS,
  PAGE_MAX_LIMIT,
  SEARCH_MAX_LIMIT,
  SEARCH_MAX_OFFSET,
  SEARCH_TAGS,
  TIME_RANGES,
  albumSearchTerms,
  assertAddBatch,
  assertCoverSize,
  assertPageLimit,
  assertSearchWindow,
  createRequestCounter,
  nextSearchOffset,
  trackSearchTerms,
  trackUri,
} from './client';

export type { CatalogTrack } from './map';
export {
  UNKNOWN_RELEASE_YEAR,
  mapAlbum,
  mapAlbumTrack,
  mapArtist,
  mapTrack,
  parseReleaseYear,
  toAlbumRef,
  toArtistRef,
  withArtistGenres,
  withSourceIndex,
} from './map';

export { parseResponse } from './schemas';

export type { CacheFactory, EntityCache } from './cache';
export { createMemoryCache, memoryCacheFactory, nullCacheFactory } from './cache';

export type { Limiter } from './limiter';
export { DEFAULT_CONCURRENCY, createLimiter } from './limiter';

export type {
  FetchInit,
  FetchLike,
  FetchResponse,
  LiveSpotifyClientOptions,
  TokenProvider,
} from './live';
export {
  DEFAULT_MAX_ITEMS,
  DEFAULT_MAX_RETRIES,
  LiveSpotifyClient,
  MAX_RETRY_AFTER_SECONDS,
  SPOTIFY_API_BASE,
} from './live';

export type { FakeCall, FakeSpotifyClientOptions } from './fake';
export { FakeSpotifyClient } from './fake';

export type {
  DemoCatalog,
  FixtureAlbum,
  FixtureAlbumGroup,
  FixtureArtist,
  FixturePlaylist,
  FixtureTrack,
} from './fixtures';
export {
  DEMO_GENRES,
  DEMO_NOTICE,
  FIXTURE_ALBUM_GROUPS,
  KIDS_GENRES,
  KIDS_PLAYLIST_ID,
  buildDemoCatalog,
  demoCatalog,
} from './fixtures';

export type {
  ResolveInput,
  ResolveLimits,
  ResolveOutput,
  ResolveReport,
  SourceReport,
} from './resolve';
export { DEFAULT_RESOLVE_LIMITS, resolveSources } from './resolve';
