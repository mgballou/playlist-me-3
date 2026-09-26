/**
 * The client that remembers the person between requests.
 *
 * `LiveSpotifyClient` already caches artists, albums and their tracks, and it takes the store
 * to do it in from a `CacheFactory` (`cache.ts`) — so those reads become cheap the moment the
 * web app hands in a factory that outlives one server action. **The seven reads below cannot
 * be cached that way**, because they are not keyed by an entity id: they are `/me`, and what
 * they depend on is who is asking.
 *
 * So they are held here instead, over the same factory, and a resolve that changes a source
 * pays for the source rather than for the library again.
 *
 * Three rules it keeps, and they are the interesting part:
 *
 * 1. **A read that may have been cut short is never held.** A list that came back exactly as
 *    long as the ceiling asked for might have more behind it, and a ceiling that rises later
 *    must not be answered out of a store filled under the old one. Only a list that ended on
 *    its own is kept, and a call that named no ceiling is never kept at all, because from
 *    out here there is no way to tell the two apart.
 * 2. **A read that failed is never held.** The call throws, and a throw writes nothing.
 * 3. **The cache never invents a request count.** Every hit is recorded on the wrapped
 *    client's own counter, so the ledger still adds up (§5.2).
 *
 * Writing to Spotify forgets what the write makes wrong — a new playlist is not on a list
 * read a minute ago. Nothing else here goes stale inside a session that the person would
 * notice: saving a track while a build is on screen is the price of reading the person once.
 *
 * It is not keyed to anything itself. Keying is the web app's job and it does it by handing
 * one factory per person — see `apps/web/src/lib/spotify/session-cache.ts`.
 */

import type { Album, AlbumId, Artist, ArtistId, PlaylistId, TopRange, TrackId } from '@pm/core';

import type { CacheFactory, EntityCache } from './cache';
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
import type { CatalogTrack } from './map';

export type CachedSpotifyClientOptions = {
  /** The client that does the work. Its request counter is the one the ledger reads. */
  readonly client: SpotifyClient;
  /** One factory per person. Named stores, so a persistent one can keep them apart. */
  readonly caches: CacheFactory;
};

/** The only ceiling a cached list can be trusted under is one the caller named. */
function ceilingOf(options: ListOptions | undefined): number | null {
  return options?.maxItems ?? null;
}

/**
 * A list shorter than the ceiling ended on its own, so it is the whole list. One exactly as
 * long as the ceiling may have been cut off, and is not kept.
 */
function isComplete(items: readonly unknown[], ceiling: number | null): boolean {
  return ceiling !== null && items.length < ceiling;
}

export class CachedSpotifyClient implements SpotifyClient {
  private readonly inner: SpotifyClient;

  private readonly savedTracks: EntityCache<readonly CatalogTrack[]>;
  private readonly topTracks: EntityCache<readonly CatalogTrack[]>;
  private readonly recentlyPlayed: EntityCache<readonly CatalogTrack[]>;
  private readonly followedArtists: EntityCache<readonly Artist[]>;
  private readonly playlistTracks: EntityCache<readonly CatalogTrack[]>;
  private readonly userPlaylists: EntityCache<readonly PlaylistSummary[]>;
  private readonly user: EntityCache<SpotifyUser>;

  constructor(options: CachedSpotifyClientOptions) {
    this.inner = options.client;
    this.savedTracks = options.caches<readonly CatalogTrack[]>('savedTracks');
    this.topTracks = options.caches<readonly CatalogTrack[]>('topTracks');
    this.recentlyPlayed = options.caches<readonly CatalogTrack[]>('recentlyPlayed');
    this.followedArtists = options.caches<readonly Artist[]>('followedArtists');
    this.playlistTracks = options.caches<readonly CatalogTrack[]>('playlistTracks');
    this.userPlaylists = options.caches<readonly PlaylistSummary[]>('userPlaylists');
    this.user = options.caches<SpotifyUser>('currentUser');
  }

  get requests(): RequestCounter {
    return this.inner.requests;
  }

  /**
   * Read from the store, or read for real and keep what is worth keeping. The ceiling is
   * part of the key as well as the test, because a read capped at fifty and a read capped at
   * a thousand are different answers to the same question.
   */
  private async held<T>(args: {
    readonly cache: EntityCache<readonly T[]>;
    readonly key: string;
    readonly ceiling: number | null;
    readonly read: () => Promise<readonly T[]>;
  }): Promise<readonly T[]> {
    const key = `${args.key}:${args.ceiling === null ? 'all' : String(args.ceiling)}`;
    const cached = args.cache.get(key);
    if (cached !== undefined) {
      this.inner.requests.recordCacheHit();
      return cached;
    }

    const items = await args.read();
    if (isComplete(items, args.ceiling)) args.cache.set(key, items);
    return items;
  }

  // -------------------------------------------------------------------------
  // The person — the reads this wrapper exists for
  // -------------------------------------------------------------------------

  async getSavedTracks(options?: ListOptions): Promise<readonly CatalogTrack[]> {
    return this.held({
      cache: this.savedTracks,
      key: 'me',
      ceiling: ceilingOf(options),
      read: async () => this.inner.getSavedTracks(options),
    });
  }

  async getTopTracks(range: TopRange, options?: ListOptions): Promise<readonly CatalogTrack[]> {
    return this.held({
      cache: this.topTracks,
      key: range,
      ceiling: ceilingOf(options),
      read: async () => this.inner.getTopTracks(range, options),
    });
  }

  async getRecentlyPlayed(options?: ListOptions): Promise<readonly CatalogTrack[]> {
    return this.held({
      cache: this.recentlyPlayed,
      key: 'me',
      ceiling: ceilingOf(options),
      read: async () => this.inner.getRecentlyPlayed(options),
    });
  }

  async getFollowedArtists(options?: ListOptions): Promise<readonly Artist[]> {
    return this.held({
      cache: this.followedArtists,
      key: 'me',
      ceiling: ceilingOf(options),
      read: async () => this.inner.getFollowedArtists(options),
    });
  }

  async getPlaylistTracks(id: PlaylistId, options?: ListOptions): Promise<readonly CatalogTrack[]> {
    return this.held({
      cache: this.playlistTracks,
      key: id,
      ceiling: ceilingOf(options),
      read: async () => this.inner.getPlaylistTracks(id, options),
    });
  }

  async getUserPlaylists(options?: ListOptions): Promise<readonly PlaylistSummary[]> {
    return this.held({
      cache: this.userPlaylists,
      key: 'me',
      ceiling: ceilingOf(options),
      read: async () => this.inner.getUserPlaylists(options),
    });
  }

  /** No ceiling and no list: who the token belongs to does not change inside a session. */
  async currentUser(options?: RequestOptions): Promise<SpotifyUser> {
    const cached = this.user.get('me');
    if (cached !== undefined) {
      this.inner.requests.recordCacheHit();
      return cached;
    }

    const user = await this.inner.currentUser(options);
    this.user.set('me', user);
    return user;
  }

  // -------------------------------------------------------------------------
  // Everything else, straight through. The catalog reads cache themselves, over the same
  // factory; the searches and the three writes must never be answered from a store.
  // -------------------------------------------------------------------------

  async getArtist(id: ArtistId, options?: RequestOptions): Promise<Artist> {
    return this.inner.getArtist(id, options);
  }

  async getArtistAlbums(id: ArtistId, options: ArtistAlbumsOptions): Promise<readonly Album[]> {
    return this.inner.getArtistAlbums(id, options);
  }

  async getAlbum(id: AlbumId, options?: RequestOptions): Promise<Album> {
    return this.inner.getAlbum(id, options);
  }

  async getAlbumTracks(id: AlbumId, options?: ListOptions): Promise<readonly CatalogTrack[]> {
    return this.inner.getAlbumTracks(id, options);
  }

  async getTrack(id: TrackId, options?: RequestOptions): Promise<CatalogTrack> {
    return this.inner.getTrack(id, options);
  }

  async searchTracks(
    query: TrackSearchQuery,
    options?: RequestOptions,
  ): Promise<SearchPage<CatalogTrack>> {
    return this.inner.searchTracks(query, options);
  }

  async searchAlbums(
    query: AlbumSearchQuery,
    options?: RequestOptions,
  ): Promise<SearchPage<Album>> {
    return this.inner.searchAlbums(query, options);
  }

  /**
   * The one place a write makes a held read wrong: the person now owns a playlist the list
   * does not mention. Cheaper to forget the list than to guess how Spotify will summarize it.
   */
  async createPlaylist(input: CreatePlaylistInput, options?: RequestOptions): Promise<PlaylistId> {
    const id = await this.inner.createPlaylist(input, options);
    this.userPlaylists.clear();
    return id;
  }

  /** Same again for the playlist's own tracks, which an exclusion may already have read. */
  async addPlaylistTracks(input: AddTracksInput, options?: RequestOptions): Promise<void> {
    await this.inner.addPlaylistTracks(input, options);
    this.playlistTracks.clear();
  }

  async uploadPlaylistCover(input: CoverUploadInput, options?: RequestOptions): Promise<void> {
    return this.inner.uploadPlaylistCover(input, options);
  }
}
