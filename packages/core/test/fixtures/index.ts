/**
 * Synthetic fixtures. Spec §5.1 and CLAUDE.md's honesty rules: invented artists, albums
 * and titles, never scraped Spotify data and never presented as such.
 *
 * The pool is generated from small data tables rather than typed out, so it is large
 * enough to exercise `maxPerArtist` and target-reachability edges while staying
 * deterministic — no generator runs here, and the same call always returns the same
 * pool.
 */

import type {
  ArtistRef,
  Dial,
  EngineContext,
  Exclusion,
  OrderStrategy,
  Recipe,
  Shape,
  Source,
  Target,
  Track,
} from '../../src/index';
import { albumId, artistId, dial, playlistId, recipeId, trackId } from '../../src/index';

/**
 * The engine's errors have private constructors so the static factories are the only
 * way in, which means Vitest's `toThrow(SomeClass)` cannot type-check against them.
 * Catching and asserting `toBeInstanceOf` gets the same coverage.
 */
export function captureError(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

export const ARTIST_SEEDS = [
  { id: 'ar-nova', name: 'Halcyon Nova', genres: ['dream pop', 'shoegaze'] },
  { id: 'ar-mire', name: 'The Peat Mire', genres: ['folk', 'drone folk'] },
  { id: 'ar-vole', name: 'Vole Committee', genres: ['post-punk'] },
  { id: 'ar-glass', name: 'Glasshouse Owl', genres: ['ambient', 'modern classical'] },
  { id: 'ar-brass', name: 'Kettle Brass Union', genres: ['jazz', 'big band'] },
  { id: 'ar-pylon', name: 'Pylon Weather', genres: ['techno', 'electronic'] },
  { id: 'ar-cinder', name: 'Cinder Almanac', genres: ['indie rock'] },
  { id: 'ar-lull', name: 'Lullwater Sound', genres: ['soul', 'rhythm and blues'] },
] as const;

const TITLE_HEADS = [
  'Paper',
  'Copper',
  'Velvet',
  'Thistle',
  'Neon',
  'Harbour',
  'Static',
  'Marble',
  'Ember',
  'Quartz',
] as const;

const TITLE_TAILS = [
  'Arcade',
  'Weather',
  'Lantern',
  'Tideline',
  'Chorus',
  'Signal',
  'Orchard',
  'Bridge',
  'Ledger',
  'Parade',
] as const;

const ALBUM_NAMES = [
  'Low Season',
  'The Long Aerial',
  'Salt and Wire',
  'Fieldwork',
  'Nightshift Almanac',
  'Twelve Bright Rooms',
  'Undercurrent',
  'Paper Machinery',
  'Slow Radio',
  'The Quiet Districts',
  'Half Light Sessions',
  'Common Ground',
  'Iron Lullabies',
  'Blue Interval',
  'Everything Louder',
  'The Small Hours',
] as const;

/** Suffixes the `liveOrRemix` heuristic is meant to catch. §3.4 */
const VARIANT_SUFFIXES = [' (Live)', ' - 2011 Remaster', ' (Club Remix)', ' - Radio Edit'] as const;

export const ARTISTS: readonly ArtistRef[] = ARTIST_SEEDS.map((seed) => ({
  id: artistId(seed.id),
  name: seed.name,
}));

export function artistAt(index: number): ArtistRef {
  const artist = ARTISTS[index % ARTISTS.length];
  if (artist === undefined) throw new RangeError('no artists');
  return artist;
}

export function genresAt(index: number): readonly string[] {
  return ARTIST_SEEDS[index % ARTIST_SEEDS.length]?.genres ?? [];
}

export type TrackOverrides = {
  readonly id?: string;
  readonly title?: string;
  readonly artists?: readonly ArtistRef[];
  readonly album?: { readonly id: string; readonly title: string };
  readonly releaseYear?: number;
  readonly durationMs?: number;
  readonly explicit?: boolean;
  readonly trackNumber?: number;
  readonly albumTrackCount?: number;
  readonly artistGenres?: readonly string[];
  readonly sourceIndex?: number;
};

let autoId = 0;

/** Sensible defaults everywhere, so a test names only the field it cares about. */
export function makeTrack(overrides: TrackOverrides = {}): Track {
  autoId += 1;
  const id = overrides.id ?? `auto-${String(autoId)}`;
  const album = overrides.album ?? { id: 'al-default', title: 'Low Season' };
  return {
    id: trackId(id),
    title: overrides.title ?? 'Paper Arcade',
    artists: overrides.artists ?? [artistAt(0)],
    album: { id: albumId(album.id), title: album.title },
    releaseYear: overrides.releaseYear ?? 2004,
    durationMs: overrides.durationMs ?? 210_000,
    explicit: overrides.explicit ?? false,
    trackNumber: overrides.trackNumber ?? 1,
    albumTrackCount: overrides.albumTrackCount ?? 10,
    artistGenres: overrides.artistGenres ?? genresAt(0),
    sourceIndex: overrides.sourceIndex ?? 0,
  };
}

const ALBUMS_PER_ARTIST = 2;
const TRACKS_PER_ALBUM = 5;

/** The standard synthetic pool: 8 artists, 2 albums each, 5 tracks each. */
export function makePool(): readonly Track[] {
  const tracks: Track[] = [];
  let index = 0;

  for (let a = 0; a < ARTIST_SEEDS.length; a += 1) {
    for (let b = 0; b < ALBUMS_PER_ARTIST; b += 1) {
      const albumIndex = a * ALBUMS_PER_ARTIST + b;
      const albumName = ALBUM_NAMES[albumIndex % ALBUM_NAMES.length] ?? 'Low Season';
      const releaseYear = 1968 + ((albumIndex * 7) % 57);

      for (let t = 0; t < TRACKS_PER_ALBUM; t += 1) {
        const head = TITLE_HEADS[index % TITLE_HEADS.length] ?? 'Paper';
        const tail = TITLE_TAILS[(index * 7) % TITLE_TAILS.length] ?? 'Arcade';
        const variant = index % 11 === 3 ? VARIANT_SUFFIXES[((index / 11) % 4) | 0] : undefined;

        tracks.push(
          makeTrack({
            id: `tr-${String(index).padStart(3, '0')}`,
            title: `${head} ${tail}${variant ?? ''}`,
            artists: [artistAt(a)],
            album: { id: `al-${String(albumIndex).padStart(2, '0')}`, title: albumName },
            releaseYear,
            durationMs: 120_000 + (index % 13) * 24_000,
            explicit: index % 5 === 0,
            trackNumber: t + 1,
            albumTrackCount: TRACKS_PER_ALBUM,
            artistGenres: genresAt(a),
            sourceIndex: a % 3,
          }),
        );
        index += 1;
      }
    }
  }

  return tracks;
}

/** A pool where every track is by the same artist. Useful for `maxPerArtist` edges. */
export function makeSingleArtistPool(size: number): readonly Track[] {
  return Array.from({ length: size }, (_, index) =>
    makeTrack({
      id: `solo-${String(index)}`,
      title: `Static Signal ${String(index)}`,
      artists: [artistAt(0)],
      trackNumber: (index % 10) + 1,
      albumTrackCount: 10,
    }),
  );
}

export type ContextOverrides = {
  readonly libraryTrackIds?: readonly string[];
  readonly topTrackIds?: readonly string[];
  readonly recentlyHeardTrackIds?: readonly string[];
  readonly followedArtistIds?: readonly string[];
  readonly playlistTrackIds?: Readonly<Record<string, readonly string[]>>;
};

export function makeContext(overrides: ContextOverrides = {}): EngineContext {
  return {
    libraryTrackIds: new Set((overrides.libraryTrackIds ?? []).map(trackId)),
    topTrackIds: new Set((overrides.topTrackIds ?? []).map(trackId)),
    recentlyHeardTrackIds: new Set((overrides.recentlyHeardTrackIds ?? []).map(trackId)),
    followedArtistIds: new Set((overrides.followedArtistIds ?? []).map(artistId)),
    playlistTrackIds: new Map(
      Object.entries(overrides.playlistTrackIds ?? {}).map(([id, members]) => [
        playlistId(id),
        new Set(members.map(trackId)),
      ]),
    ),
  };
}

export type ShapeOverrides = {
  readonly target?: Target;
  readonly maxPerArtist?: number;
  readonly order?: OrderStrategy;
  readonly familiarity?: Dial;
  readonly depth?: Dial;
};

export function makeShape(overrides: ShapeOverrides = {}): Shape {
  return {
    target: overrides.target ?? { kind: 'count', count: 10 },
    maxPerArtist: overrides.maxPerArtist ?? 3,
    order: overrides.order ?? 'shuffle',
    familiarity: overrides.familiarity ?? dial(0.5),
    depth: overrides.depth ?? dial(0.5),
  };
}

export type RecipeOverrides = {
  readonly id?: string;
  readonly name?: string;
  readonly sources?: readonly Source[];
  readonly exclusions?: readonly Exclusion[];
  readonly shape?: Shape;
};

export function makeRecipe(overrides: RecipeOverrides = {}): Recipe {
  return {
    id: recipeId(overrides.id ?? 'rc-fixture'),
    name: overrides.name ?? 'Fixture recipe',
    sources: overrides.sources ?? [
      { kind: 'artist', artistId: artistAt(0).id, depth: 'albums' },
      { kind: 'library' },
      { kind: 'topTracks', range: 'mediumTerm' },
    ],
    exclusions: overrides.exclusions ?? [],
    shape: overrides.shape ?? makeShape(),
  };
}
