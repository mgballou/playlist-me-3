/**
 * `FakeSpotifyClient` — the same contract, backed by the synthetic catalog.
 *
 * **This is load-bearing, not a test convenience** (§5.1). It is what lets someone clone
 * the repo and run the app with no credentials, it backs demo mode, and it backs every
 * integration test and Playwright run. So it implements the interface faithfully rather
 * than conveniently: search pages ten at a time and stops at the offset ceiling, `genre:`
 * applies to track search and never to album search, `tag:hipster` and `tag:new` apply to
 * album search and never to track search, and a request counter moves the way the live
 * client's would. Code exercised against this is exercising the real contract.
 *
 * What it does not do is fail. Rate limits, quota and network faults belong to
 * `LiveSpotifyClient`, and tests for those drive it with a stubbed `fetch`.
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
import { playlistId } from '@pm/core';

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
  PAGE_MAX_LIMIT,
  assertAddBatch,
  assertCoverSize,
  assertSearchWindow,
  createRequestCounter,
  nextSearchOffset,
} from './client';
import { NotFound, RequestFailed } from './errors';
import type { DemoCatalog, FixtureAlbum, FixtureArtist, FixtureTrack } from './fixtures';
import { demoCatalog } from './fixtures';
import type { CatalogTrack } from './map';

/** Every call the fake has served, so a test can assert on request *shape*, not just count. */
export type FakeCall =
  | { readonly method: 'getArtist'; readonly artistId: ArtistId }
  | {
      readonly method: 'getArtistAlbums';
      readonly artistId: ArtistId;
      readonly depth: CatalogDepth;
    }
  | { readonly method: 'getAlbum'; readonly albumId: AlbumId }
  | { readonly method: 'getAlbumTracks'; readonly albumId: AlbumId }
  | { readonly method: 'getTrack'; readonly trackId: TrackId }
  | { readonly method: 'searchTracks'; readonly query: TrackSearchQuery }
  | { readonly method: 'searchAlbums'; readonly query: AlbumSearchQuery }
  | { readonly method: 'getSavedTracks' }
  | { readonly method: 'getTopTracks'; readonly range: TopRange }
  | { readonly method: 'getRecentlyPlayed' }
  | { readonly method: 'getFollowedArtists' }
  | { readonly method: 'getPlaylistTracks'; readonly playlistId: PlaylistId }
  | { readonly method: 'getUserPlaylists' }
  | { readonly method: 'currentUser' }
  | { readonly method: 'createPlaylist'; readonly name: string }
  | { readonly method: 'addPlaylistTracks'; readonly count: number }
  | { readonly method: 'uploadPlaylistCover' };

export type FakeSpotifyClientOptions = {
  readonly catalog?: DemoCatalog | undefined;
  readonly requests?: RequestCounter | undefined;
};

/** Which album groups each depth asks for. `appears_on` is worked out, not stored. §2.2.0 */
const DEPTH_GROUPS: Readonly<Record<CatalogDepth, readonly string[]>> = {
  albums: ['album'],
  albumsAndSingles: ['album', 'single'],
  everything: ['album', 'single', 'compilation'],
};

function words(terms: string): readonly string[] {
  return terms
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

function inYears(year: number, years: YearRange | undefined): boolean {
  return years === undefined || (year >= years.from && year <= years.to);
}

/** One request costs one page, the same way the live client would spend it. §5.2 */
function pageCount(items: number): number {
  return Math.max(1, Math.ceil(items / PAGE_MAX_LIMIT));
}

export class FakeSpotifyClient implements SpotifyClient {
  readonly requests: RequestCounter;

  private readonly catalog: DemoCatalog;
  private readonly artistsById: ReadonlyMap<string, FixtureArtist>;
  private readonly albumsById: ReadonlyMap<string, FixtureAlbum>;
  private readonly albumByTrackId: ReadonlyMap<string, FixtureAlbum>;
  private readonly trackById: ReadonlyMap<string, FixtureTrack>;
  private readonly playlistTracks: Map<string, TrackId[]>;
  private readonly playlistNames: Map<string, string>;
  private readonly served: FakeCall[] = [];

  private covers = 0;
  private created = 0;

  constructor(options: FakeSpotifyClientOptions = {}) {
    this.catalog = options.catalog ?? demoCatalog;
    this.requests = options.requests ?? createRequestCounter();

    this.artistsById = new Map(this.catalog.artists.map((artist) => [artist.id, artist]));
    this.albumsById = new Map(this.catalog.albums.map((album) => [album.id, album]));

    const albumByTrackId = new Map<string, FixtureAlbum>();
    const trackById = new Map<string, FixtureTrack>();
    for (const album of this.catalog.albums) {
      for (const track of album.tracks) {
        albumByTrackId.set(track.id, album);
        trackById.set(track.id, track);
      }
    }
    this.albumByTrackId = albumByTrackId;
    this.trackById = trackById;

    this.playlistTracks = new Map(
      this.catalog.playlists.map((list) => [list.id, [...list.trackIds]]),
    );
    this.playlistNames = new Map(this.catalog.playlists.map((list) => [list.id, list.name]));
  }

  /** What the fake has been asked for, in order. Tests read it; the app does not. */
  get calls(): readonly FakeCall[] {
    return this.served;
  }

  /** How many covers were uploaded, for the save flow's tests. */
  get coverUploads(): number {
    return this.covers;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private record(call: FakeCall, requestCount = 1): void {
    this.served.push(call);
    for (let i = 0; i < requestCount; i += 1) this.requests.record(call.method);
  }

  private guard(options: RequestOptions | undefined, endpoint: string): void {
    if (options?.signal?.aborted === true) throw RequestFailed.aborted(endpoint);
  }

  private artistOf(artist: FixtureArtist): Artist {
    return {
      id: artist.id,
      name: artist.name,
      genres: [...artist.genres],
      catalogSize: this.catalog.albums.filter((album) => album.artistIds.includes(artist.id))
        .length,
    };
  }

  private albumOf(album: FixtureAlbum): Album {
    return {
      id: album.id,
      title: album.title,
      artists: album.artistIds.flatMap((id) => {
        const artist = this.artistsById.get(id);
        return artist === undefined ? [] : [{ id: artist.id, name: artist.name }];
      }),
      releaseYear: album.releaseYear,
      trackCount: album.tracks.length,
    };
  }

  /**
   * `artistGenres` is left empty on purpose. The live client cannot know an artist's
   * genres from a track payload either, so the resolver fills them in from `getArtist`
   * (§3.5) — and if the fake pre-filled them, that path would never run in demo or in a
   * test.
   */
  private trackOf(album: FixtureAlbum, track: FixtureTrack): CatalogTrack {
    return {
      id: track.id,
      title: track.title,
      artists: track.artistIds.flatMap((id) => {
        const artist = this.artistsById.get(id);
        return artist === undefined ? [] : [{ id: artist.id, name: artist.name }];
      }),
      album: { id: album.id, title: album.title },
      releaseYear: album.releaseYear,
      durationMs: track.durationMs,
      explicit: track.explicit,
      trackNumber: track.trackNumber,
      albumTrackCount: album.tracks.length,
      artistGenres: [],
    };
  }

  private tracksOf(ids: readonly TrackId[]): readonly CatalogTrack[] {
    return ids.flatMap((id) => {
      const track = this.trackById.get(id);
      const album = this.albumByTrackId.get(id);
      return track === undefined || album === undefined ? [] : [this.trackOf(album, track)];
    });
  }

  private artistNames(track: FixtureTrack): string {
    return track.artistIds
      .map((id) => this.artistsById.get(id)?.name ?? '')
      .join(' ')
      .toLowerCase();
  }

  private genresOf(track: FixtureTrack): readonly string[] {
    return track.artistIds.flatMap((id) => this.artistsById.get(id)?.genres ?? []);
  }

  // -------------------------------------------------------------------------
  // Catalog
  // -------------------------------------------------------------------------

  async getArtist(id: ArtistId, options?: RequestOptions): Promise<Artist> {
    this.guard(options, 'getArtist');
    this.record({ method: 'getArtist', artistId: id });
    const artist = this.artistsById.get(id);
    if (artist === undefined) throw NotFound.at(`GET /artists/${id}`);
    return this.artistOf(artist);
  }

  async getArtistAlbums(id: ArtistId, options: ArtistAlbumsOptions): Promise<readonly Album[]> {
    this.guard(options, 'getArtistAlbums');
    const groups = DEPTH_GROUPS[options.depth];

    const own = this.catalog.albums.filter(
      (album) => album.artistIds.includes(id) && groups.includes(album.group),
    );

    // `everything` reaches the records an artist only guests on, which is where the
    // collaboration graph (§2.2) actually lives.
    const guestedOn =
      options.depth === 'everything'
        ? this.catalog.albums.filter(
            (album) =>
              !album.artistIds.includes(id) &&
              album.tracks.some((track) => track.artistIds.includes(id)),
          )
        : [];

    const albums = [...own, ...guestedOn].slice(0, options.maxItems ?? Number.MAX_SAFE_INTEGER);
    this.record(
      { method: 'getArtistAlbums', artistId: id, depth: options.depth },
      pageCount(albums.length),
    );
    return albums.map((album) => this.albumOf(album));
  }

  async getAlbum(id: AlbumId, options?: RequestOptions): Promise<Album> {
    this.guard(options, 'getAlbum');
    this.record({ method: 'getAlbum', albumId: id });
    const album = this.albumsById.get(id);
    if (album === undefined) throw NotFound.at(`GET /albums/${id}`);
    return this.albumOf(album);
  }

  async getAlbumTracks(id: AlbumId, options?: ListOptions): Promise<readonly CatalogTrack[]> {
    this.guard(options, 'getAlbumTracks');
    const album = this.albumsById.get(id);
    if (album === undefined) {
      this.record({ method: 'getAlbumTracks', albumId: id });
      throw NotFound.at(`GET /albums/${id}/tracks`);
    }
    const tracks = album.tracks.slice(0, options?.maxItems ?? album.tracks.length);
    this.record({ method: 'getAlbumTracks', albumId: id }, pageCount(tracks.length));
    return tracks.map((track) => this.trackOf(album, track));
  }

  async getTrack(id: TrackId, options?: RequestOptions): Promise<CatalogTrack> {
    this.guard(options, 'getTrack');
    this.record({ method: 'getTrack', trackId: id });
    const track = this.trackById.get(id);
    const album = this.albumByTrackId.get(id);
    if (track === undefined || album === undefined) {
      throw NotFound.at(`GET /tracks/${id}`);
    }
    return this.trackOf(album, track);
  }

  // -------------------------------------------------------------------------
  // Search. The filter scoping in §2.2.1, honored rather than approximated.
  // -------------------------------------------------------------------------

  async searchTracks(
    query: TrackSearchQuery,
    options?: RequestOptions,
  ): Promise<SearchPage<CatalogTrack>> {
    this.guard(options, 'searchTracks');
    assertSearchWindow(query.limit, query.offset);
    this.record({ method: 'searchTracks', query });

    const needles = words(query.terms);
    const genre = query.genre?.toLowerCase();

    const matches: { readonly album: FixtureAlbum; readonly track: FixtureTrack }[] = [];
    for (const album of this.catalog.albums) {
      if (!inYears(album.releaseYear, query.years)) continue;
      for (const track of album.tracks) {
        const haystack = `${track.title} ${album.title} ${this.artistNames(track)}`.toLowerCase();
        if (!needles.every((word) => haystack.includes(word))) continue;
        if (genre !== undefined && !this.genresOf(track).some((name) => name === genre)) continue;
        matches.push({ album, track });
      }
    }

    const window = matches.slice(query.offset, query.offset + query.limit);
    return {
      items: window.map(({ album, track }) => this.trackOf(album, track)),
      limit: query.limit,
      offset: query.offset,
      ...nextSearchOffset(query.offset, query.limit, window.length),
    };
  }

  async searchAlbums(
    query: AlbumSearchQuery,
    options?: RequestOptions,
  ): Promise<SearchPage<Album>> {
    this.guard(options, 'searchAlbums');
    assertSearchWindow(query.limit, query.offset);
    this.record({ method: 'searchAlbums', query });

    const needles = words(query.terms);

    const matches = this.catalog.albums.filter((album) => {
      if (!inYears(album.releaseYear, query.years)) return false;
      if (query.tag === 'hipster' && !album.hipster) return false;
      if (query.tag === 'new' && !album.isNew) return false;
      const names = album.artistIds
        .map((id) => this.artistsById.get(id)?.name ?? '')
        .join(' ')
        .toLowerCase();
      const genres = album.artistIds
        .flatMap((id) => this.artistsById.get(id)?.genres ?? [])
        .join(' ')
        .toLowerCase();
      const haystack = `${album.title} ${names} ${genres}`.toLowerCase();
      return needles.every((word) => haystack.includes(word));
    });

    const window = matches.slice(query.offset, query.offset + query.limit);
    return {
      items: window.map((album) => this.albumOf(album)),
      limit: query.limit,
      offset: query.offset,
      ...nextSearchOffset(query.offset, query.limit, window.length),
    };
  }

  // -------------------------------------------------------------------------
  // The person
  // -------------------------------------------------------------------------

  async getSavedTracks(options?: ListOptions): Promise<readonly CatalogTrack[]> {
    this.guard(options, 'getSavedTracks');
    const ids = this.catalog.savedTrackIds.slice(0, options?.maxItems ?? Number.MAX_SAFE_INTEGER);
    this.record({ method: 'getSavedTracks' }, pageCount(ids.length));
    return this.tracksOf(ids);
  }

  async getTopTracks(range: TopRange, options?: ListOptions): Promise<readonly CatalogTrack[]> {
    this.guard(options, 'getTopTracks');
    const ids = this.catalog.topTrackIds[range].slice(
      0,
      options?.maxItems ?? Number.MAX_SAFE_INTEGER,
    );
    this.record({ method: 'getTopTracks', range }, pageCount(ids.length));
    return this.tracksOf(ids);
  }

  async getRecentlyPlayed(options?: ListOptions): Promise<readonly CatalogTrack[]> {
    this.guard(options, 'getRecentlyPlayed');
    const ids = this.catalog.recentlyPlayedTrackIds.slice(
      0,
      options?.maxItems ?? Number.MAX_SAFE_INTEGER,
    );
    this.record({ method: 'getRecentlyPlayed' });
    return this.tracksOf(ids);
  }

  async getFollowedArtists(options?: ListOptions): Promise<readonly Artist[]> {
    this.guard(options, 'getFollowedArtists');
    const ids = this.catalog.followedArtistIds.slice(
      0,
      options?.maxItems ?? Number.MAX_SAFE_INTEGER,
    );
    this.record({ method: 'getFollowedArtists' }, pageCount(ids.length));
    return ids.flatMap((id) => {
      const artist = this.artistsById.get(id);
      return artist === undefined ? [] : [this.artistOf(artist)];
    });
  }

  async getPlaylistTracks(id: PlaylistId, options?: ListOptions): Promise<readonly CatalogTrack[]> {
    this.guard(options, 'getPlaylistTracks');
    const ids = this.playlistTracks.get(id);
    if (ids === undefined) {
      this.record({ method: 'getPlaylistTracks', playlistId: id });
      throw NotFound.at(`GET /playlists/${id}/items`);
    }
    const window = ids.slice(0, options?.maxItems ?? ids.length);
    this.record({ method: 'getPlaylistTracks', playlistId: id }, pageCount(window.length));
    return this.tracksOf(window);
  }

  /**
   * The seeded playlists, then anything this session created — which is what `/me/playlists`
   * would answer after a save, and what makes the demo of the headline exclusion honest.
   */
  async getUserPlaylists(options?: ListOptions): Promise<readonly PlaylistSummary[]> {
    this.guard(options, 'getUserPlaylists');
    const lists = [...this.playlistNames.entries()]
      .slice(0, options?.maxItems ?? Number.MAX_SAFE_INTEGER)
      .map(([id, name]) => ({
        id: playlistId(id),
        name,
        trackCount: this.playlistTracks.get(id)?.length ?? 0,
      }));
    this.record({ method: 'getUserPlaylists' }, pageCount(lists.length));
    return lists;
  }

  async currentUser(options?: RequestOptions): Promise<SpotifyUser> {
    this.guard(options, 'currentUser');
    this.record({ method: 'currentUser' });
    return this.catalog.user;
  }

  // -------------------------------------------------------------------------
  // Writing the playlist
  // -------------------------------------------------------------------------

  async createPlaylist(input: CreatePlaylistInput, options?: RequestOptions): Promise<PlaylistId> {
    this.guard(options, 'createPlaylist');
    this.created += 1;
    const id = playlistId(`pl-made-${String(this.created)}`);
    this.playlistTracks.set(id, []);
    this.playlistNames.set(id, input.name);
    this.record({ method: 'createPlaylist', name: input.name });
    return id;
  }

  async addPlaylistTracks(input: AddTracksInput, options?: RequestOptions): Promise<void> {
    this.guard(options, 'addPlaylistTracks');
    assertAddBatch(input.trackIds);
    const existing = this.playlistTracks.get(input.playlistId);
    if (existing === undefined) {
      throw NotFound.at(`POST /playlists/${input.playlistId}/items`);
    }
    existing.push(...input.trackIds);
    this.record({ method: 'addPlaylistTracks', count: input.trackIds.length });
    return;
  }

  async uploadPlaylistCover(input: CoverUploadInput, options?: RequestOptions): Promise<void> {
    this.guard(options, 'uploadPlaylistCover');
    assertCoverSize(input.base64Jpeg);
    if (!this.playlistTracks.has(input.playlistId)) {
      throw NotFound.at(`PUT /playlists/${input.playlistId}/images`);
    }
    this.covers += 1;
    this.record({ method: 'uploadPlaylistCover' });
    return;
  }

  /** What a playlist holds now, for asserting on the save flow. */
  playlistContents(id: PlaylistId): readonly TrackId[] {
    return this.playlistTracks.get(id) ?? [];
  }

  playlistName(id: PlaylistId): string | undefined {
    return this.playlistNames.get(id);
  }
}
