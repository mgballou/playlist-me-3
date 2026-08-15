/**
 * `resolveSources` — the impure half of the one rule in §3.1. Sources in, `TrackPool` out,
 * and everything downstream of it is pure.
 *
 * The work is eight strategies, one per source kind (§2.2), and three things that are easy
 * to get wrong and expensive when you do:
 *
 * 1. **Search branches on obscurity** (§2.2.1). `genre:` is artist/track-scoped and
 *    `tag:hipster` is album-scoped, so "obscure dub" cannot be one query. Ordinary
 *    searches ask for tracks; obscure ones ask for albums and then fetch their tracks.
 * 2. **Dedupe by `TrackId`, first source wins** (§2.2.0). The engine's per-source
 *    contribution counts and `sourceInterleaved` ordering both read `sourceIndex`, so a
 *    track appearing twice under two indices would quietly corrupt both.
 * 3. **Every source reports what it cost and what it hit.** A source that returned nothing
 *    and a source that ran into Spotify's offset ceiling look identical in a pool and
 *    completely different to a person trying to work out why their recipe is thin.
 */

import type {
  AlbumId,
  ArtistId,
  ArtistRef,
  CatalogDepth,
  Source,
  Track,
  TrackId,
  TrackPool,
  YearRange,
} from '@pm/core';
import { unreachable } from '@pm/core';

import type { RequestOptions, SpotifyClient } from './client';
import { SEARCH_MAX_LIMIT } from './client';
import { QuotaExceeded, RequestFailed, SpotifyError } from './errors';
import type { CatalogTrack } from './map';
import { withArtistGenres, withSourceIndex } from './map';

/**
 * Ceilings, so a single recipe cannot spend a day's quota by accident. Every one of these
 * is a budget decision rather than an API limit, which is why they are settable.
 */
export type ResolveLimits = {
  readonly maxTracksPerSource: number;
  readonly maxAlbumsPerArtist: number;
  readonly maxAlbumsPerSearch: number;
  readonly maxArtistsPerSource: number;
  readonly maxSearchPages: number;
  /** Never above `SEARCH_MAX_LIMIT`; search refuses more. §5.1.1 */
  readonly searchPageSize: number;
  /** One request per artist, so coherence scoring has a price and this is it. §3.5 */
  readonly maxArtistGenreLookups: number;
};

export const DEFAULT_RESOLVE_LIMITS: ResolveLimits = {
  maxTracksPerSource: 400,
  maxAlbumsPerArtist: 12,
  maxAlbumsPerSearch: 20,
  maxArtistsPerSource: 12,
  maxSearchPages: 10,
  searchPageSize: SEARCH_MAX_LIMIT,
  maxArtistGenreLookups: 60,
};

export type SourceReport = {
  readonly sourceIndex: number;
  readonly kind: Source['kind'];
  /** Tracks the source produced, before dedupe. */
  readonly found: number;
  /** Tracks credited to this source in the pool. First source wins (§2.2.0). */
  readonly contributed: number;
  /** Tracks another source had already claimed. */
  readonly duplicates: number;
  readonly requests: number;
  /** Paging stopped at Spotify's 1,000-result ceiling rather than at the end. §2.2.1 */
  readonly hitOffsetCeiling: boolean;
  /** Paging stopped at `maxTracksPerSource`, so there is more to be had for more requests. */
  readonly hitTrackLimit: boolean;
  /** The source ran and produced nothing. Worth saying out loud on the bench. */
  readonly empty: boolean;
  /** Set when this source failed and the rest carried on. */
  readonly failure: string | null;
};

export type ResolveReport = {
  readonly sources: readonly SourceReport[];
  readonly poolSize: number;
  /** What this resolve cost. §5.2 */
  readonly requests: number;
  readonly cacheHits: number;
  readonly artistsLookedUp: number;
  /**
   * False when no artist we looked up had any genres. Coherence then falls back to source
   * provenance, which is weaker and is not nothing (§3.5.1).
   */
  readonly genresAvailable: boolean;
};

export type ResolveOutput = {
  readonly pool: TrackPool;
  readonly report: ResolveReport;
};

export type ResolveInput = {
  readonly client: SpotifyClient;
  readonly sources: readonly Source[];
  readonly signal?: AbortSignal | undefined;
  readonly limits?: Partial<ResolveLimits> | undefined;
};

/** What one strategy hands back before dedupe. */
type SourceResult = {
  readonly tracks: readonly CatalogTrack[];
  readonly hitOffsetCeiling: boolean;
  readonly hitTrackLimit: boolean;
};

function result(
  tracks: readonly CatalogTrack[],
  flags: { readonly hitOffsetCeiling?: boolean; readonly hitTrackLimit?: boolean } = {},
): SourceResult {
  return {
    tracks,
    hitOffsetCeiling: flags.hitOffsetCeiling ?? false,
    hitTrackLimit: flags.hitTrackLimit ?? false,
  };
}

/** Free text plus, where there is one, the genre word. Never a `genre:` filter. §2.2.1 */
function albumSearchText(query: string, genre: string | undefined): string {
  return [query, genre].filter((part) => part !== undefined && part.trim().length > 0).join(' ');
}

export async function resolveSources({
  client,
  sources,
  signal,
  limits,
}: ResolveInput): Promise<ResolveOutput> {
  const budget: ResolveLimits = { ...DEFAULT_RESOLVE_LIMITS, ...limits };
  const options: RequestOptions = { signal };

  const pool = new Map<TrackId, Track>();
  const reports: SourceReport[] = [];

  for (const [sourceIndex, source] of sources.entries()) {
    if (signal?.aborted === true) throw RequestFailed.aborted('resolveSources');

    const before = client.requests.snapshot().total;
    let found: SourceResult = result([]);
    let failure: string | null = null;

    try {
      found = await resolveOne({ client, source, options, budget });
    } catch (cause) {
      // A spent quota ends the whole resolve — every further source would burn requests
      // that cannot succeed (§5.2). Anything else is this source's problem alone: a
      // recipe can outlive an artist, and one dead source should not lose the other seven.
      if (cause instanceof QuotaExceeded) throw cause;
      if (!(cause instanceof SpotifyError)) throw cause;
      failure = cause.message;
    }

    let contributed = 0;
    for (const track of found.tracks) {
      if (pool.has(track.id)) continue;
      pool.set(track.id, withSourceIndex(track, sourceIndex));
      contributed += 1;
    }

    reports.push({
      sourceIndex,
      kind: source.kind,
      found: found.tracks.length,
      contributed,
      duplicates: found.tracks.length - contributed,
      requests: client.requests.snapshot().total - before,
      hitOffsetCeiling: found.hitOffsetCeiling,
      hitTrackLimit: found.hitTrackLimit,
      empty: found.tracks.length === 0 && failure === null,
      failure,
    });
  }

  const enriched = await addArtistGenres({ client, pool: [...pool.values()], options, budget });
  const snapshot = client.requests.snapshot();

  return {
    pool: enriched.pool,
    report: {
      sources: reports,
      poolSize: enriched.pool.length,
      requests: snapshot.total,
      cacheHits: snapshot.cacheHits,
      artistsLookedUp: enriched.artistsLookedUp,
      genresAvailable: enriched.genresAvailable,
    },
  };
}

// ---------------------------------------------------------------------------
// One strategy per source kind. §2.2
// ---------------------------------------------------------------------------

type StrategyInput = {
  readonly client: SpotifyClient;
  readonly source: Source;
  readonly options: RequestOptions;
  readonly budget: ResolveLimits;
};

async function resolveOne({
  client,
  source,
  options,
  budget,
}: StrategyInput): Promise<SourceResult> {
  switch (source.kind) {
    case 'artist':
      return fromArtist({ client, artist: source.artistId, depth: source.depth, options, budget });

    case 'track':
      return fromTrack({ client, source, options, budget });

    case 'search':
      return source.obscurity === 'obscure'
        ? fromObscureSearch({ client, source, options, budget })
        : fromTrackSearch({ client, source, options, budget });

    case 'playlist':
      return result(
        await client.getPlaylistTracks(source.playlistId, {
          ...options,
          maxItems: budget.maxTracksPerSource,
        }),
      );

    case 'library':
      return result(
        await client.getSavedTracks({ ...options, maxItems: budget.maxTracksPerSource }),
      );

    case 'topTracks':
      return result(
        await client.getTopTracks(source.range, {
          ...options,
          maxItems: budget.maxTracksPerSource,
        }),
      );

    case 'followedArtists':
      return fromFollowedArtists({ client, depth: source.depth, options, budget });

    case 'newReleases':
      return fromNewReleases({ client, genre: source.genre, options, budget });

    default:
      return unreachable(source);
  }
}

/**
 * Artist → albums → album tracks, because `top-tracks` was removed for development-mode
 * apps (§1.2). `CatalogDepth` decides how wide to cast (§2.2.0).
 */
async function fromArtist(args: {
  readonly client: SpotifyClient;
  readonly artist: ArtistId;
  readonly depth: CatalogDepth;
  readonly options: RequestOptions;
  readonly budget: ResolveLimits;
  readonly maxAlbums?: number;
}): Promise<SourceResult> {
  const albums = await args.client.getArtistAlbums(args.artist, {
    ...args.options,
    depth: args.depth,
    maxItems: args.maxAlbums ?? args.budget.maxAlbumsPerArtist,
  });
  return collectAlbumTracks(
    args.client,
    albums.map((album) => album.id),
    args.options,
    args.budget,
  );
}

async function collectAlbumTracks(
  client: SpotifyClient,
  albumIds: readonly AlbumId[],
  options: RequestOptions,
  budget: ResolveLimits,
): Promise<SourceResult> {
  const tracks: CatalogTrack[] = [];
  for (const id of albumIds) {
    if (tracks.length >= budget.maxTracksPerSource) {
      return result(tracks.slice(0, budget.maxTracksPerSource), { hitTrackLimit: true });
    }
    tracks.push(...(await client.getAlbumTracks(id, options)));
  }
  return tracks.length > budget.maxTracksPerSource
    ? result(tracks.slice(0, budget.maxTracksPerSource), { hitTrackLimit: true })
    : result(tracks);
}

/**
 * A track reaches its album and its collaborators. Collaboration is the only
 * artist-similarity signal left after `related-artists` was removed (§2.2, §9.5) — it
 * works well for scene-adjacent acts and poorly for anyone who never guests.
 */
async function fromTrack(args: {
  readonly client: SpotifyClient;
  readonly source: Extract<Source, { kind: 'track' }>;
  readonly options: RequestOptions;
  readonly budget: ResolveLimits;
}): Promise<SourceResult> {
  const { client, source, options, budget } = args;
  const seed = await client.getTrack(source.trackId, options);
  const tracks: CatalogTrack[] = [seed];
  let hitTrackLimit = false;

  if (source.expand === 'album' || source.expand === 'both') {
    tracks.push(...(await client.getAlbumTracks(seed.album.id, options)));
  }

  if (source.expand === 'collaborators' || source.expand === 'both') {
    const collaborators = seed.artists.slice(0, budget.maxArtistsPerSource);
    for (const artist of collaborators) {
      if (tracks.length >= budget.maxTracksPerSource) {
        hitTrackLimit = true;
        break;
      }
      const walked = await fromArtist({
        client,
        artist: artist.id,
        depth: 'albums',
        options,
        budget,
        maxAlbums: Math.min(budget.maxAlbumsPerArtist, 3),
      });
      tracks.push(...walked.tracks);
      hitTrackLimit = hitTrackLimit || walked.hitTrackLimit;
    }
  }

  return tracks.length > budget.maxTracksPerSource
    ? result(tracks.slice(0, budget.maxTracksPerSource), { hitTrackLimit: true })
    : result(tracks, { hitTrackLimit });
}

/** Ordinary obscurity: `type=track`, `genre:` and `year:`, tracks come back directly. §2.2.1 */
async function fromTrackSearch(args: {
  readonly client: SpotifyClient;
  readonly source: Extract<Source, { kind: 'search' }>;
  readonly options: RequestOptions;
  readonly budget: ResolveLimits;
}): Promise<SourceResult> {
  const { client, source, options, budget } = args;
  const tracks: CatalogTrack[] = [];
  let offset = 0;
  let hitOffsetCeiling = false;

  for (let page = 0; page < budget.maxSearchPages; page += 1) {
    const found = await client.searchTracks(
      {
        terms: source.query,
        genre: source.genre,
        years: source.years,
        limit: budget.searchPageSize,
        offset,
      },
      options,
    );
    tracks.push(...found.items);

    if (found.atOffsetCeiling) {
      hitOffsetCeiling = true;
      break;
    }
    if (found.nextOffset === null) break;
    if (tracks.length >= budget.maxTracksPerSource) {
      return result(tracks.slice(0, budget.maxTracksPerSource), { hitTrackLimit: true });
    }
    offset = found.nextOffset;
  }

  return result(tracks.slice(0, budget.maxTracksPerSource), {
    hitOffsetCeiling,
    hitTrackLimit: tracks.length > budget.maxTracksPerSource,
  });
}

/**
 * High obscurity: `type=album` with `tag:hipster`, then one `GET /albums/{id}/tracks` per
 * album. No `genre:` — the tag is album-scoped and the filter is not, and a query carrying
 * both silently returns nothing (§2.2.1). The genre still rides along as free text, which
 * is a text match rather than a filter, and genre coherence is recovered at scoring time.
 *
 * This path costs one request per album on top of the search, which is exactly what the
 * budget in §5.2 exists to show someone before they spend it.
 */
async function fromObscureSearch(args: {
  readonly client: SpotifyClient;
  readonly source: Extract<Source, { kind: 'search' }>;
  readonly options: RequestOptions;
  readonly budget: ResolveLimits;
}): Promise<SourceResult> {
  const { client, source, options, budget } = args;
  const albums = await pageAlbums({
    client,
    terms: albumSearchText(source.query, source.genre),
    tag: 'hipster',
    years: source.years,
    options,
    budget,
  });
  const tracks = await collectAlbumTracks(client, albums.ids, options, budget);
  return result(tracks.tracks, {
    hitOffsetCeiling: albums.hitOffsetCeiling,
    hitTrackLimit: tracks.hitTrackLimit,
  });
}

/** `newReleases` is a `tag:new` album search — the browse endpoint is gone (§2.2). */
async function fromNewReleases(args: {
  readonly client: SpotifyClient;
  readonly genre: string | undefined;
  readonly options: RequestOptions;
  readonly budget: ResolveLimits;
}): Promise<SourceResult> {
  const albums = await pageAlbums({
    client: args.client,
    terms: albumSearchText('', args.genre),
    tag: 'new',
    options: args.options,
    budget: args.budget,
  });
  const tracks = await collectAlbumTracks(args.client, albums.ids, args.options, args.budget);
  return result(tracks.tracks, {
    hitOffsetCeiling: albums.hitOffsetCeiling,
    hitTrackLimit: tracks.hitTrackLimit,
  });
}

async function pageAlbums(args: {
  readonly client: SpotifyClient;
  readonly terms: string;
  readonly tag: 'hipster' | 'new';
  readonly years?: YearRange | undefined;
  readonly options: RequestOptions;
  readonly budget: ResolveLimits;
}): Promise<{ readonly ids: readonly AlbumId[]; readonly hitOffsetCeiling: boolean }> {
  const ids: AlbumId[] = [];
  let offset = 0;
  let hitOffsetCeiling = false;

  for (let page = 0; page < args.budget.maxSearchPages; page += 1) {
    if (ids.length >= args.budget.maxAlbumsPerSearch) break;
    const found = await args.client.searchAlbums(
      {
        terms: args.terms,
        tag: args.tag,
        years: args.years,
        limit: args.budget.searchPageSize,
        offset,
      },
      args.options,
    );
    ids.push(...found.items.map((album) => album.id));

    if (found.atOffsetCeiling) {
      hitOffsetCeiling = true;
      break;
    }
    if (found.nextOffset === null) break;
    offset = found.nextOffset;
  }

  return { ids: ids.slice(0, args.budget.maxAlbumsPerSearch), hitOffsetCeiling };
}

/** Followed artists, each walked to the depth the source asked for. */
async function fromFollowedArtists(args: {
  readonly client: SpotifyClient;
  readonly depth: CatalogDepth;
  readonly options: RequestOptions;
  readonly budget: ResolveLimits;
}): Promise<SourceResult> {
  const artists = await args.client.getFollowedArtists({
    ...args.options,
    maxItems: args.budget.maxArtistsPerSource,
  });

  const tracks: CatalogTrack[] = [];
  let hitTrackLimit = false;

  for (const artist of artists) {
    if (tracks.length >= args.budget.maxTracksPerSource) {
      hitTrackLimit = true;
      break;
    }
    const walked = await fromArtist({
      client: args.client,
      artist: artist.id,
      depth: args.depth,
      options: args.options,
      budget: args.budget,
      maxAlbums: Math.min(args.budget.maxAlbumsPerArtist, 4),
    });
    tracks.push(...walked.tracks);
    hitTrackLimit = hitTrackLimit || walked.hitTrackLimit;
  }

  return tracks.length > args.budget.maxTracksPerSource
    ? result(tracks.slice(0, args.budget.maxTracksPerSource), { hitTrackLimit: true })
    : result(tracks, { hitTrackLimit });
}

// ---------------------------------------------------------------------------
// Genres, which are borrowed time. §3.5.1
// ---------------------------------------------------------------------------

/**
 * One `GET /artists/{id}` per credited artist, cached, capped, and allowed to fail. An
 * artist Spotify has not classified returns `[]` today; the whole field is deprecated and
 * may return `[]` for everyone tomorrow. Either way the pool still resolves — coherence
 * scoring just has less to work with.
 */
async function addArtistGenres(args: {
  readonly client: SpotifyClient;
  readonly pool: readonly Track[];
  readonly options: RequestOptions;
  readonly budget: ResolveLimits;
}): Promise<{
  readonly pool: TrackPool;
  readonly artistsLookedUp: number;
  readonly genresAvailable: boolean;
}> {
  const wanted: ArtistRef[] = [];
  const seen = new Set<string>();
  for (const track of args.pool) {
    for (const artist of track.artists) {
      if (seen.has(artist.id)) continue;
      seen.add(artist.id);
      wanted.push(artist);
    }
  }

  const genresByArtist = new Map<string, readonly string[]>();
  let artistsLookedUp = 0;
  let genresAvailable = false;

  for (const ref of wanted.slice(0, args.budget.maxArtistGenreLookups)) {
    try {
      const artist = await args.client.getArtist(ref.id, args.options);
      artistsLookedUp += 1;
      genresByArtist.set(ref.id, artist.genres);
      genresAvailable = genresAvailable || artist.genres.length > 0;
    } catch (cause) {
      if (cause instanceof QuotaExceeded) throw cause;
      if (!(cause instanceof SpotifyError)) throw cause;
    }
  }

  return {
    pool: args.pool.map((track) => ({
      ...withArtistGenres(track, genresByArtist),
      sourceIndex: track.sourceIndex,
    })),
    artistsLookedUp,
    genresAvailable,
  };
}
