/**
 * The single public surface of `@pm/core`. Named exports only.
 *
 * CLAUDE.md: no barrel re-exports across packages beyond each package's `src/index.ts`.
 * Anything not listed here is an internal of the engine and reaching for it is a
 * layering break.
 */

export type { AlbumId, ArtistId, PlaylistId, RecipeId, TrackId } from './ids';
export {
  albumId,
  artistId,
  isAlbumId,
  isArtistId,
  isPlaylistId,
  isRecipeId,
  isTrackId,
  playlistId,
  recipeId,
  trackId,
} from './ids';

export type {
  Album,
  AlbumRef,
  Artist,
  ArtistRef,
  EngineContext,
  Lock,
  Track,
  TrackPool,
} from './domain';
export { emptyContext, poolSize, totalDurationMs } from './domain';

export type {
  CatalogDepth,
  Dial,
  DurationRange,
  Exclusion,
  ExclusionKind,
  Obscurity,
  OrderStrategy,
  Recipe,
  Shape,
  Source,
  SourceKind,
  Target,
  TopRange,
  TrackExpansion,
  YearRange,
} from './recipe';
export {
  CATALOG_DEPTHS,
  DEFAULT_MAX_PER_ARTIST,
  DEFAULT_TRACK_COUNT,
  NEUTRAL_DIAL,
  OBSCURITIES,
  ORDER_STRATEGIES,
  RECIPE_SCHEMA_VERSION,
  TOP_RANGES,
  TRACK_EXPANSIONS,
  clampDial,
  defaultRecipe,
  dial,
  hasSources,
  isDial,
} from './recipe';

export type { Rng } from './rng';
export { createRng, deriveSeed } from './rng';

export type { ExclusionRemoval, RejectInput, RejectOutput, RejectReport } from './reject';
export { LIVE_OR_REMIX_PATTERNS, isExcluded, isLiveOrRemix, reject } from './reject';

export type { ScoreInput, ScoredTrack } from './score';
export {
  FAMILIARITY_WEIGHTS,
  MIN_WEIGHT,
  dialWeight,
  familiarityOf,
  prominenceOf,
  score,
} from './score';

export type { SelectInput, SelectOutput, SelectReport, Shortfall, ShortfallReason } from './select';
export { select } from './select';

export type { OrderInput } from './order';
export { order } from './order';

export type { BuildInput, BuildReport, BuildResult, SourceContribution } from './build';
export { build, canReachTarget } from './build';

export type { FormatSpec } from './format';
export { format } from './format';

export { decodeRecipe, encodeRecipe } from './serialize';

export type { DecodeErrorReason, Result } from './errors';
export {
  CoreError,
  DecodeError,
  InvalidDial,
  InvalidId,
  RngMisuse,
  UnreachableCase,
  err,
  ok,
  unreachable,
} from './errors';
