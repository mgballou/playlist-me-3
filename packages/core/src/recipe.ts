/**
 * A Recipe is the whole product. Spec §2.
 *
 * CLAUDE.md engine rule 3: a Recipe is data, and only data. No methods, no class, no
 * behavior. Everything here is either a type, a literal set, or a function that takes a
 * recipe and returns a value.
 */

import { InvalidDial } from './errors';
import type { ArtistId, PlaylistId, RecipeId, TrackId } from './ids';

/** Bumped whenever the shape of a shared recipe string changes. §6 */
export const RECIPE_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Supporting unions. §2.2–2.4
// ---------------------------------------------------------------------------

/**
 * How much of an artist's discography to walk. `top-tracks` is gone (§1.2), so the
 * artist source goes artist → albums → album tracks and this says how wide to cast.
 * The three values map onto Spotify's album groups: albums; albums and singles;
 * everything including compilations and guest appearances.
 */
export const CATALOG_DEPTHS = ['albums', 'albumsAndSingles', 'everything'] as const;
export type CatalogDepth = (typeof CATALOG_DEPTHS)[number];

/**
 * What a `track` source reaches for. Collaboration is the only artist-similarity signal
 * left after `related-artists` was removed (§2.2, §9.5).
 */
export const TRACK_EXPANSIONS = ['album', 'collaborators', 'both'] as const;
export type TrackExpansion = (typeof TRACK_EXPANSIONS)[number];

/** Maps onto `tag:hipster` at search time, not at score time. §2.2, §3.5 */
export const OBSCURITIES = ['any', 'obscure'] as const;
export type Obscurity = (typeof OBSCURITIES)[number];

/** Spotify's three `time_range` windows. */
export const TOP_RANGES = ['shortTerm', 'mediumTerm', 'longTerm'] as const;
export type TopRange = (typeof TOP_RANGES)[number];

export const ORDER_STRATEGIES = [
  'shuffle',
  'byRelease',
  'artistClustered',
  'sourceInterleaved',
] as const;
export type OrderStrategy = (typeof ORDER_STRATEGIES)[number];

/** Inclusive on both ends. */
export type YearRange = {
  readonly from: number;
  readonly to: number;
};

/** Inclusive on both ends, in milliseconds. */
export type DurationRange = {
  readonly minMs: number;
  readonly maxMs: number;
};

// ---------------------------------------------------------------------------
// Dial
// ---------------------------------------------------------------------------

/**
 * A number pinned to 0..1. The two dials on the bench (§2.4) are the interface's
 * headline controls, so the type refuses anything a slider could not produce.
 */
export type Dial = number & { readonly __brand: 'Dial' };

/** A dial at 0.5 expresses no preference. See §3.5 and `score`. */
export const NEUTRAL_DIAL = 0.5 as Dial;

/**
 * Validates. Throws `InvalidDial` on anything outside 0..1 or not finite.
 *
 * The cast is unavoidable: a brand has no runtime witness, so no type guard can produce
 * one. The range check above it is the real guarantee.
 */
export function dial(value: number): Dial {
  if (!Number.isFinite(value)) throw InvalidDial.notFinite(value);
  if (value < 0 || value > 1) throw InvalidDial.outOfRange(value);
  return value as Dial;
}

/** Clamps instead of throwing, for the places a UI drag can overshoot. */
export function clampDial(value: number): Dial {
  if (!Number.isFinite(value)) throw InvalidDial.notFinite(value);
  return Math.min(1, Math.max(0, value)) as Dial;
}

export function isDial(value: unknown): value is Dial {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

// ---------------------------------------------------------------------------
// Sources, exclusions, shape. §2.2–2.4
// ---------------------------------------------------------------------------

export type Source =
  | { readonly kind: 'artist'; readonly artistId: ArtistId; readonly depth: CatalogDepth }
  | { readonly kind: 'track'; readonly trackId: TrackId; readonly expand: TrackExpansion }
  | {
      readonly kind: 'search';
      readonly query: string;
      readonly genre?: string;
      readonly years?: YearRange;
      readonly obscurity: Obscurity;
    }
  | { readonly kind: 'playlist'; readonly playlistId: PlaylistId }
  | { readonly kind: 'library' }
  | { readonly kind: 'topTracks'; readonly range: TopRange }
  | { readonly kind: 'followedArtists'; readonly depth: CatalogDepth }
  | { readonly kind: 'newReleases'; readonly genre?: string };

export type SourceKind = Source['kind'];

export type Exclusion =
  | { readonly kind: 'artist'; readonly artistId: ArtistId }
  | { readonly kind: 'playlist'; readonly playlistId: PlaylistId }
  | { readonly kind: 'inLibrary' }
  | { readonly kind: 'heardRecently' }
  | { readonly kind: 'years'; readonly range: YearRange }
  | { readonly kind: 'duration'; readonly range: DurationRange }
  | { readonly kind: 'explicit' }
  | { readonly kind: 'liveOrRemix' };

export type ExclusionKind = Exclusion['kind'];

export type Target =
  | { readonly kind: 'count'; readonly count: number }
  | { readonly kind: 'duration'; readonly ms: number };

export type Shape = {
  readonly target: Target;
  readonly maxPerArtist: number;
  readonly order: OrderStrategy;
  /** 0 = only what I do not know, 1 = only what I do. 0.5 = no preference. */
  readonly familiarity: Dial;
  /** 0 = deep cuts, 1 = the obvious ones. Estimated, never measured. §3.5, §9.1 */
  readonly depth: Dial;
};

export type Recipe = {
  readonly id: RecipeId;
  readonly name: string;
  readonly sources: readonly Source[];
  readonly exclusions: readonly Exclusion[];
  readonly shape: Shape;
};

// ---------------------------------------------------------------------------
// Factory and selectors
// ---------------------------------------------------------------------------

export const DEFAULT_TRACK_COUNT = 25;
export const DEFAULT_MAX_PER_ARTIST = 2;

/**
 * An empty bench: no sources, no exclusions, both dials neutral. The id is an argument
 * because the engine has no clock and no randomness of its own (§3.1).
 */
export function defaultRecipe(id: RecipeId, name = 'Untitled recipe'): Recipe {
  return {
    id,
    name,
    sources: [],
    exclusions: [],
    shape: {
      target: { kind: 'count', count: DEFAULT_TRACK_COUNT },
      maxPerArtist: DEFAULT_MAX_PER_ARTIST,
      order: 'shuffle',
      familiarity: NEUTRAL_DIAL,
      depth: NEUTRAL_DIAL,
    },
  };
}

export function hasSources(recipe: Recipe): boolean {
  return recipe.sources.length > 0;
}
