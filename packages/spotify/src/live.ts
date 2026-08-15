/**
 * `LiveSpotifyClient` — real HTTP, validated at the boundary, and built to live inside a
 * development-mode quota (§5.2).
 *
 * Four things here are load-bearing rather than decorative:
 *
 * - **A token provider, never a token.** Access tokens last an hour and refresh happens
 *   server-side (§5.3.1). A client holding a string would work until it did not.
 * - **A concurrency limiter.** The batch endpoints are gone, so one build makes hundreds
 *   of small requests, and firing them all at once is how you meet a 429.
 * - **429 split two ways.** `Retry-After` is honored; a `QUOTA_EXCEEDED` body is not
 *   retried at all. Looping on the second one spends the shared per-developer budget on
 *   requests that cannot succeed.
 * - **A counter on every request.** Being honest about what a build cost is a feature.
 */

import type { Album, AlbumId, Artist, ArtistId, PlaylistId, TopRange, TrackId } from '@pm/core';
import { playlistId } from '@pm/core';

import type { CacheFactory, EntityCache } from './cache';
import { memoryCacheFactory } from './cache';
import type {
  AddTracksInput,
  AlbumSearchQuery,
  ArtistAlbumsOptions,
  CoverUploadInput,
  CreatePlaylistInput,
  ListOptions,
  PlaylistSummary,
  RequestCounter,
  RequestOptions,
  SearchPage,
  SpotifyClient,
  SpotifyUser,
  TrackSearchQuery,
} from './client';
import {
  INCLUDE_GROUPS,
  PAGE_MAX_LIMIT,
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
import {
  AuthFailed,
  MalformedResponse,
  NotFound,
  QuotaExceeded,
  RateLimited,
  RequestFailed,
} from './errors';
import type { CatalogTrack } from './map';
import { mapAlbum, mapAlbumTrack, mapArtist, mapTrack } from './map';
import {
  albumSchema,
  albumTracksPageSchema,
  artistAlbumsPageSchema,
  artistSchema,
  currentUserSchema,
  errorResponseSchema,
  followedArtistsResponseSchema,
  parseResponse,
  playlistItemsPageSchema,
  playlistSchema,
  recentlyPlayedPageSchema,
  savedTracksPageSchema,
  searchResponseSchema,
  trackPageSchema,
  trackSchema,
  userPlaylistsPageSchema,
} from './schemas';
import type { Limiter } from './limiter';
import { DEFAULT_CONCURRENCY, createLimiter } from './limiter';

/** The web app refreshes server-side and hands the current token over on demand. §5.3 */
export type TokenProvider = () => string | Promise<string>;

/** The slice of `fetch` this client uses, named so a test can stub it without the DOM. */
export type FetchInit = {
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body?: string | undefined;
  readonly signal?: AbortSignal | undefined;
};

export type FetchResponse = {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
};

export type FetchLike = (url: string, init: FetchInit) => Promise<FetchResponse>;

export const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

/** Two retries is enough for a blip and short of a loop. */
export const DEFAULT_MAX_RETRIES = 2;

/**
 * A `Retry-After` longer than this is reported rather than slept through. A person
 * staring at a stalled build for ten minutes deserves to be told, not waited on.
 */
export const MAX_RETRY_AFTER_SECONDS = 30;

/** How much of a long list to pull when the caller does not say. */
export const DEFAULT_MAX_ITEMS = 500;

export type LiveSpotifyClientOptions = {
  readonly getToken: TokenProvider;
  readonly fetch?: FetchLike | undefined;
  readonly baseUrl?: string | undefined;
  readonly concurrency?: number | undefined;
  readonly maxRetries?: number | undefined;
  readonly maxRetryAfterSeconds?: number | undefined;
  readonly cacheFactory?: CacheFactory | undefined;
  readonly sleep?: ((ms: number) => Promise<void>) | undefined;
  readonly requests?: RequestCounter | undefined;
};

type Query = Readonly<Record<string, string | number | undefined>>;

type Send = {
  readonly endpoint: string;
  readonly path: string;
  readonly method?: string;
  readonly query?: Query;
  readonly body?: string;
  readonly contentType?: string;
  readonly signal?: AbortSignal | undefined;
};

/** Reasons Spotify gives that mean "not today", as against "not this second". */
const QUOTA_REASONS = new Set(['QUOTA_EXCEEDED', 'RATE_LIMIT_EXCEEDED_QUOTA']);

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function backoffMs(attempt: number): number {
  return 250 * 2 ** (attempt - 1);
}

function isAbortError(cause: unknown): boolean {
  return cause instanceof Error && cause.name === 'AbortError';
}

/** Platform `fetch`, with the optional fields dropped rather than passed as `undefined`. */
const platformFetch: FetchLike = (url, init) =>
  fetch(url, {
    method: init.method,
    headers: init.headers,
    ...(init.body === undefined ? {} : { body: init.body }),
    ...(init.signal === undefined ? {} : { signal: init.signal }),
  });

export class LiveSpotifyClient implements SpotifyClient {
  readonly requests: RequestCounter;

  private readonly getToken: TokenProvider;
  private readonly fetchImpl: FetchLike;
  private readonly baseUrl: string;
  private readonly limiter: Limiter;
  private readonly maxRetries: number;
  private readonly maxRetryAfterSeconds: number;
  private readonly sleep: (ms: number) => Promise<void>;

  private readonly artistCache: EntityCache<Artist>;
  private readonly albumCache: EntityCache<Album>;
  private readonly albumTracksCache: EntityCache<readonly CatalogTrack[]>;
  private readonly artistAlbumsCache: EntityCache<readonly Album[]>;
  private readonly catalogSizeCache: EntityCache<number>;

  constructor(options: LiveSpotifyClientOptions) {
    const cacheFactory = options.cacheFactory ?? memoryCacheFactory();

    this.getToken = options.getToken;
    this.fetchImpl = options.fetch ?? platformFetch;
    this.baseUrl = options.baseUrl ?? SPOTIFY_API_BASE;
    this.limiter = createLimiter(options.concurrency ?? DEFAULT_CONCURRENCY);
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.maxRetryAfterSeconds = options.maxRetryAfterSeconds ?? MAX_RETRY_AFTER_SECONDS;
    this.sleep = options.sleep ?? defaultSleep;
    this.requests = options.requests ?? createRequestCounter();

    this.artistCache = cacheFactory<Artist>('artists');
    this.albumCache = cacheFactory<Album>('albums');
    this.albumTracksCache = cacheFactory<readonly CatalogTrack[]>('albumTracks');
    this.artistAlbumsCache = cacheFactory<readonly Album[]>('artistAlbums');
    this.catalogSizeCache = cacheFactory<number>('catalogSizes');
  }

  // -------------------------------------------------------------------------
  // Transport
  // -------------------------------------------------------------------------

  private url(path: string, query: Query | undefined): string {
    if (query === undefined) return `${this.baseUrl}${path}`;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value));
    }
    const search = params.toString();
    return search.length === 0 ? `${this.baseUrl}${path}` : `${this.baseUrl}${path}?${search}`;
  }

  private async authorization(): Promise<string> {
    const token = await this.getToken();
    if (token.length === 0) throw AuthFailed.noToken();
    return `Bearer ${token}`;
  }

  private retryAfterOf(response: FetchResponse): number {
    const header = response.headers.get('retry-after');
    const seconds = header === null ? Number.NaN : Number(header);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : 1;
  }

  private async reasonOf(response: FetchResponse): Promise<string | undefined> {
    try {
      const parsed = errorResponseSchema.safeParse(await response.json());
      return parsed.success ? parsed.data.error.reason : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * One request, retried where retrying can help and never where it cannot. Every attempt
   * counts against the budget, so every attempt is recorded.
   */
  private async execute(spec: Send): Promise<FetchResponse> {
    const url = this.url(spec.path, spec.query);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(spec.contentType === undefined ? {} : { 'Content-Type': spec.contentType }),
    };

    return this.limiter.run(async () => {
      for (let attempt = 0; ; attempt += 1) {
        if (spec.signal?.aborted === true) throw RequestFailed.aborted(spec.endpoint);

        const init: FetchInit = {
          method: spec.method ?? 'GET',
          headers: { ...headers, Authorization: await this.authorization() },
          body: spec.body,
          signal: spec.signal,
        };

        let response: FetchResponse;
        try {
          response = await this.fetchImpl(url, init);
        } catch (cause) {
          if (isAbortError(cause)) throw RequestFailed.aborted(spec.endpoint);
          if (attempt >= this.maxRetries) {
            throw RequestFailed.network(spec.endpoint, cause instanceof Error ? cause.message : '');
          }
          await this.sleep(backoffMs(attempt + 1));
          continue;
        }

        this.requests.record(spec.endpoint);
        if (response.ok) return response;

        const reason = await this.reasonOf(response);
        if (reason !== undefined && QUOTA_REASONS.has(reason)) throw QuotaExceeded.developerQuota();

        if (response.status === 429) {
          const seconds = this.retryAfterOf(response);
          if (seconds > this.maxRetryAfterSeconds) throw RateLimited.retryAfter(seconds);
          if (attempt >= this.maxRetries) throw RateLimited.givingUp(seconds, attempt + 1);
          await this.sleep(seconds * 1000);
          continue;
        }

        if (response.status === 401) throw AuthFailed.tokenRejected();
        if (response.status === 404) throw NotFound.at(spec.endpoint);
        if (response.status >= 500 && attempt < this.maxRetries) {
          await this.sleep(backoffMs(attempt + 1));
          continue;
        }
        throw RequestFailed.status(spec.endpoint, response.status);
      }
    });
  }

  private async json(spec: Send): Promise<unknown> {
    const response = await this.execute(spec);
    try {
      return await response.json();
    } catch {
      throw MalformedResponse.notJson(spec.endpoint);
    }
  }

  private async voidCall(spec: Send): Promise<void> {
    await this.execute(spec);
  }

  /**
   * Offset paging for the 50-per-page endpoints, stopping at `maxItems` so a library of
   * eight thousand saved tracks cannot quietly cost a hundred and sixty requests.
   *
   * `read` returns a `null` for every entry it could not use — a removed track, a deleted
   * playlist — rather than dropping it, because the page's own length is what says whether
   * there is another page. Filtering first and counting after would end a list of four
   * hundred at the first hole in it.
   */
  private async collect<T>(args: {
    readonly endpoint: string;
    readonly path: string;
    readonly query?: Query;
    readonly maxItems: number;
    readonly signal?: AbortSignal | undefined;
    readonly read: (body: unknown) => readonly (T | null)[];
  }): Promise<readonly T[]> {
    const limit = Math.min(PAGE_MAX_LIMIT, Math.max(1, args.maxItems));
    assertPageLimit(limit);

    const out: T[] = [];
    for (let offset = 0; out.length < args.maxItems; offset += limit) {
      const body = await this.json({
        endpoint: args.endpoint,
        path: args.path,
        query: { ...args.query, limit, offset },
        signal: args.signal,
      });
      const page = args.read(body);
      for (const item of page) {
        if (item !== null) out.push(item);
      }
      if (page.length < limit) break;
    }
    return out.slice(0, args.maxItems);
  }

  // -------------------------------------------------------------------------
  // Catalog
  // -------------------------------------------------------------------------

  async getArtist(id: ArtistId, options?: RequestOptions): Promise<Artist> {
    const cached = this.artistCache.get(id);
    if (cached !== undefined) {
      this.requests.recordCacheHit();
      return cached;
    }

    const body = await this.json({
      endpoint: 'GET /artists/{id}',
      path: `/artists/${encodeURIComponent(id)}`,
      signal: options?.signal,
    });
    const artist = mapArtist(
      parseResponse(artistSchema, body, 'GET /artists/{id}'),
      this.catalogSizeCache.get(id) ?? 0,
    );
    this.artistCache.set(id, artist);
    return artist;
  }

  async getArtistAlbums(id: ArtistId, options: ArtistAlbumsOptions): Promise<readonly Album[]> {
    const key = `${id}:${options.depth}`;
    const cached = this.artistAlbumsCache.get(key);
    if (cached !== undefined) {
      this.requests.recordCacheHit();
      return cached;
    }

    const endpoint = 'GET /artists/{id}/albums';
    const albums = await this.collect<Album>({
      endpoint,
      path: `/artists/${encodeURIComponent(id)}/albums`,
      query: { include_groups: INCLUDE_GROUPS[options.depth] },
      maxItems: options.maxItems ?? DEFAULT_MAX_ITEMS,
      signal: options.signal,
      read: (body) => parseResponse(artistAlbumsPageSchema, body, endpoint).items.map(mapAlbum),
    });

    for (const album of albums) this.albumCache.set(album.id, album);
    this.artistAlbumsCache.set(key, albums);
    this.rememberCatalogSize(id, albums.length);
    return albums;
  }

  /** §3.5's weak obscurity proxy, learned by walking the discography rather than asked for. */
  private rememberCatalogSize(id: ArtistId, size: number): void {
    this.catalogSizeCache.set(id, size);
    const artist = this.artistCache.get(id);
    if (artist !== undefined) this.artistCache.set(id, { ...artist, catalogSize: size });
  }

  async getAlbum(id: AlbumId, options?: RequestOptions): Promise<Album> {
    const cached = this.albumCache.get(id);
    if (cached !== undefined) {
      this.requests.recordCacheHit();
      return cached;
    }

    const endpoint = 'GET /albums/{id}';
    const body = await this.json({
      endpoint,
      path: `/albums/${encodeURIComponent(id)}`,
      signal: options?.signal,
    });
    const album = mapAlbum(parseResponse(albumSchema, body, endpoint));
    this.albumCache.set(id, album);
    return album;
  }

  async getAlbumTracks(id: AlbumId, options?: ListOptions): Promise<readonly CatalogTrack[]> {
    const cached = this.albumTracksCache.get(id);
    if (cached !== undefined) {
      this.requests.recordCacheHit();
      return cached;
    }

    // Album tracks carry no album and no release date of their own, so the album has to
    // come along for `releaseYear` and for the depth proxy's denominator (§3.5).
    const album = await this.getAlbum(id, { signal: options?.signal });
    const endpoint = 'GET /albums/{id}/tracks';
    const tracks = await this.collect<CatalogTrack>({
      endpoint,
      path: `/albums/${encodeURIComponent(id)}/tracks`,
      maxItems: options?.maxItems ?? Math.max(album.trackCount, PAGE_MAX_LIMIT),
      signal: options?.signal,
      read: (body) =>
        parseResponse(albumTracksPageSchema, body, endpoint).items.map((item) =>
          mapAlbumTrack(item, album),
        ),
    });

    this.albumTracksCache.set(id, tracks);
    return tracks;
  }

  async getTrack(id: TrackId, options?: RequestOptions): Promise<CatalogTrack> {
    const endpoint = 'GET /tracks/{id}';
    const body = await this.json({
      endpoint,
      path: `/tracks/${encodeURIComponent(id)}`,
      signal: options?.signal,
    });
    return mapTrack(parseResponse(trackSchema, body, endpoint));
  }

  // -------------------------------------------------------------------------
  // Search. §2.2.1
  // -------------------------------------------------------------------------

  async searchTracks(
    query: TrackSearchQuery,
    options?: RequestOptions,
  ): Promise<SearchPage<CatalogTrack>> {
    assertSearchWindow(query.limit, query.offset);
    const endpoint = 'GET /search?type=track';
    const body = await this.json({
      endpoint,
      path: '/search',
      query: {
        q: trackSearchTerms(query),
        type: 'track',
        limit: query.limit,
        offset: query.offset,
      },
      signal: options?.signal,
    });

    const items = (parseResponse(searchResponseSchema, body, endpoint).tracks?.items ?? []).map(
      mapTrack,
    );
    return {
      items,
      limit: query.limit,
      offset: query.offset,
      ...nextSearchOffset(query.offset, query.limit, items.length),
    };
  }

  async searchAlbums(
    query: AlbumSearchQuery,
    options?: RequestOptions,
  ): Promise<SearchPage<Album>> {
    assertSearchWindow(query.limit, query.offset);
    const endpoint = 'GET /search?type=album';
    const body = await this.json({
      endpoint,
      path: '/search',
      query: {
        q: albumSearchTerms(query),
        type: 'album',
        limit: query.limit,
        offset: query.offset,
      },
      signal: options?.signal,
    });

    const items = (parseResponse(searchResponseSchema, body, endpoint).albums?.items ?? []).map(
      mapAlbum,
    );
    for (const album of items) this.albumCache.set(album.id, album);
    return {
      items,
      limit: query.limit,
      offset: query.offset,
      ...nextSearchOffset(query.offset, query.limit, items.length),
    };
  }

  // -------------------------------------------------------------------------
  // The person
  // -------------------------------------------------------------------------

  async getSavedTracks(options?: ListOptions): Promise<readonly CatalogTrack[]> {
    const endpoint = 'GET /me/tracks';
    return this.collect<CatalogTrack>({
      endpoint,
      path: '/me/tracks',
      maxItems: options?.maxItems ?? DEFAULT_MAX_ITEMS,
      signal: options?.signal,
      read: (body) =>
        parseResponse(savedTracksPageSchema, body, endpoint).items.map((item) =>
          mapTrack(item.track),
        ),
    });
  }

  async getTopTracks(range: TopRange, options?: ListOptions): Promise<readonly CatalogTrack[]> {
    const endpoint = 'GET /me/top/tracks';
    return this.collect<CatalogTrack>({
      endpoint,
      path: '/me/top/tracks',
      query: { time_range: TIME_RANGES[range] },
      maxItems: options?.maxItems ?? DEFAULT_MAX_ITEMS,
      signal: options?.signal,
      read: (body) => parseResponse(trackPageSchema, body, endpoint).items.map(mapTrack),
    });
  }

  /** Recently played is a cursor endpoint capped at 50, so one page is all of it. */
  async getRecentlyPlayed(options?: ListOptions): Promise<readonly CatalogTrack[]> {
    const endpoint = 'GET /me/player/recently-played';
    const body = await this.json({
      endpoint,
      path: '/me/player/recently-played',
      query: { limit: PAGE_MAX_LIMIT },
      signal: options?.signal,
    });
    const items = parseResponse(recentlyPlayedPageSchema, body, endpoint).items.map((item) =>
      mapTrack(item.track),
    );
    return items.slice(0, options?.maxItems ?? items.length);
  }

  async getFollowedArtists(options?: ListOptions): Promise<readonly Artist[]> {
    const endpoint = 'GET /me/following?type=artist';
    const maxItems = options?.maxItems ?? DEFAULT_MAX_ITEMS;
    const out: Artist[] = [];
    let after: string | undefined;

    while (out.length < maxItems) {
      const body = await this.json({
        endpoint,
        path: '/me/following',
        query: { type: 'artist', limit: PAGE_MAX_LIMIT, after },
        signal: options?.signal,
      });
      const page = parseResponse(followedArtistsResponseSchema, body, endpoint).artists;
      const artists = page.items.map((item) => mapArtist(item));
      for (const artist of artists) {
        this.artistCache.set(artist.id, artist);
        out.push(artist);
      }
      const nextAfter = page.cursors?.after;
      if (artists.length === 0 || nextAfter === undefined || nextAfter === null) break;
      after = nextAfter;
    }

    return out.slice(0, maxItems);
  }

  async getPlaylistTracks(id: PlaylistId, options?: ListOptions): Promise<readonly CatalogTrack[]> {
    const endpoint = 'GET /playlists/{id}/items';
    return this.collect<CatalogTrack>({
      endpoint,
      path: `/playlists/${encodeURIComponent(id)}/items`,
      maxItems: options?.maxItems ?? DEFAULT_MAX_ITEMS,
      signal: options?.signal,
      read: (body) =>
        parseResponse(playlistItemsPageSchema, body, endpoint).items.map((item) =>
          item.track === null ? null : mapTrack(item.track),
        ),
    });
  }

  /**
   * Every playlist the person owns or follows. Fifty a page like the rest of `/me`, and
   * the holes a page can carry are counted before they are dropped so a dead playlist
   * cannot end the list early.
   */
  async getUserPlaylists(options?: ListOptions): Promise<readonly PlaylistSummary[]> {
    const endpoint = 'GET /me/playlists';
    return this.collect<PlaylistSummary>({
      endpoint,
      path: '/me/playlists',
      maxItems: options?.maxItems ?? DEFAULT_MAX_ITEMS,
      signal: options?.signal,
      read: (body) =>
        parseResponse(userPlaylistsPageSchema, body, endpoint).items.map((list) =>
          list === null
            ? null
            : { id: playlistId(list.id), name: list.name, trackCount: list.tracks?.total ?? 0 },
        ),
    });
  }

  async currentUser(options?: RequestOptions): Promise<SpotifyUser> {
    const endpoint = 'GET /me';
    const body = await this.json({ endpoint, path: '/me', signal: options?.signal });
    const user = parseResponse(currentUserSchema, body, endpoint);
    return { id: user.id, displayName: user.display_name ?? user.id };
  }

  // -------------------------------------------------------------------------
  // Writing the playlist — the point. §5.3
  // -------------------------------------------------------------------------

  async createPlaylist(input: CreatePlaylistInput, options?: RequestOptions): Promise<PlaylistId> {
    const endpoint = 'POST /me/playlists';
    const body = await this.json({
      endpoint,
      path: '/me/playlists',
      method: 'POST',
      contentType: 'application/json',
      body: JSON.stringify({
        name: input.name,
        description: input.description ?? '',
        public: input.isPublic,
      }),
      signal: options?.signal,
    });
    return playlistId(parseResponse(playlistSchema, body, endpoint).id);
  }

  async addPlaylistTracks(input: AddTracksInput, options?: RequestOptions): Promise<void> {
    assertAddBatch(input.trackIds);
    await this.voidCall({
      endpoint: 'POST /playlists/{id}/items',
      path: `/playlists/${encodeURIComponent(input.playlistId)}/items`,
      method: 'POST',
      contentType: 'application/json',
      body: JSON.stringify({ uris: input.trackIds.map(trackUri) }),
      signal: options?.signal,
    });
  }

  async uploadPlaylistCover(input: CoverUploadInput, options?: RequestOptions): Promise<void> {
    assertCoverSize(input.base64Jpeg);
    await this.voidCall({
      endpoint: 'PUT /playlists/{id}/images',
      path: `/playlists/${encodeURIComponent(input.playlistId)}/images`,
      method: 'PUT',
      contentType: 'image/jpeg',
      body: input.base64Jpeg,
      signal: options?.signal,
    });
  }
}
