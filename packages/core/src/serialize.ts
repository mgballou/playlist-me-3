/**
 * Recipes travel in URLs. Spec §6: no database, no server, no row to migrate — a recipe
 * is a small declarative value, so a shared link carries the whole thing.
 *
 * The encoding is short-key JSON over base64url rather than raw JSON, because a raw
 * recipe runs to several hundred characters of field names that never change. There is
 * no compression dependency and there will not be one: the codec has to run unchanged in
 * a browser and in Node, and a link is a few hundred bytes either way.
 *
 * `decodeRecipe` returns a `Result` and never throws. A damaged link is an ordinary
 * thing for a person to paste, not an exceptional one.
 */

import type { Result } from './errors';
import { DecodeError, err, ok, unreachable } from './errors';
import { artistId, playlistId, recipeId, trackId } from './ids';
import type {
  CatalogDepth,
  DurationRange,
  Exclusion,
  Obscurity,
  OrderStrategy,
  Recipe,
  Shape,
  Source,
  Target,
  TopRange,
  TrackExpansion,
  YearRange,
} from './recipe';
import {
  CATALOG_DEPTHS,
  OBSCURITIES,
  ORDER_STRATEGIES,
  RECIPE_SCHEMA_VERSION,
  TOP_RANGES,
  TRACK_EXPANSIONS,
  dial,
} from './recipe';

// ---------------------------------------------------------------------------
// base64url, by hand
// ---------------------------------------------------------------------------

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const REVERSE = new Map<string, number>(
  [...ALPHABET].map((character, index) => [character, index]),
);

function bytesToBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const remaining = bytes.length - i;
    const chunk = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += ALPHABET[(chunk >> 18) & 63] ?? '';
    out += ALPHABET[(chunk >> 12) & 63] ?? '';
    if (remaining > 1) out += ALPHABET[(chunk >> 6) & 63] ?? '';
    if (remaining > 2) out += ALPHABET[chunk & 63] ?? '';
  }
  return out;
}

function base64UrlToBytes(text: string): Uint8Array | null {
  if (text.length % 4 === 1) return null;
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of text) {
    const value = REVERSE.get(character);
    if (value === undefined) return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

// ---------------------------------------------------------------------------
// Compact form
// ---------------------------------------------------------------------------

const SOURCE_CODES = {
  artist: 0,
  track: 1,
  search: 2,
  playlist: 3,
  library: 4,
  topTracks: 5,
  followedArtists: 6,
  newReleases: 7,
} as const;

const EXCLUSION_CODES = {
  artist: 0,
  playlist: 1,
  inLibrary: 2,
  heardRecently: 3,
  years: 4,
  duration: 5,
  explicit: 6,
  liveOrRemix: 7,
} as const;

const TARGET_CODES = { count: 0, duration: 1 } as const;

/** A field the compact form leaves out is written as 0, never as a JSON null. */
const ABSENT = 0;

type Compact = readonly unknown[];

function encodeSource(source: Source): Compact {
  switch (source.kind) {
    case 'artist':
      return [SOURCE_CODES.artist, source.artistId, CATALOG_DEPTHS.indexOf(source.depth)];
    case 'track':
      return [SOURCE_CODES.track, source.trackId, TRACK_EXPANSIONS.indexOf(source.expand)];
    case 'search':
      return [
        SOURCE_CODES.search,
        source.query,
        source.genre ?? ABSENT,
        source.years === undefined ? ABSENT : [source.years.from, source.years.to],
        OBSCURITIES.indexOf(source.obscurity),
      ];
    case 'playlist':
      return [SOURCE_CODES.playlist, source.playlistId];
    case 'library':
      return [SOURCE_CODES.library];
    case 'topTracks':
      return [SOURCE_CODES.topTracks, TOP_RANGES.indexOf(source.range)];
    case 'followedArtists':
      return [SOURCE_CODES.followedArtists, CATALOG_DEPTHS.indexOf(source.depth)];
    case 'newReleases':
      return [SOURCE_CODES.newReleases, source.genre ?? ABSENT];
    default:
      return unreachable(source);
  }
}

function encodeExclusion(exclusion: Exclusion): Compact {
  switch (exclusion.kind) {
    case 'artist':
      return [EXCLUSION_CODES.artist, exclusion.artistId];
    case 'playlist':
      return [EXCLUSION_CODES.playlist, exclusion.playlistId];
    case 'inLibrary':
      return [EXCLUSION_CODES.inLibrary];
    case 'heardRecently':
      return [EXCLUSION_CODES.heardRecently];
    case 'years':
      return [EXCLUSION_CODES.years, exclusion.range.from, exclusion.range.to];
    case 'duration':
      return [EXCLUSION_CODES.duration, exclusion.range.minMs, exclusion.range.maxMs];
    case 'explicit':
      return [EXCLUSION_CODES.explicit];
    case 'liveOrRemix':
      return [EXCLUSION_CODES.liveOrRemix];
    default:
      return unreachable(exclusion);
  }
}

function encodeShape(shape: Shape): Compact {
  const target =
    shape.target.kind === 'count'
      ? [TARGET_CODES.count, shape.target.count]
      : [TARGET_CODES.duration, shape.target.ms];
  return [
    target[0],
    target[1],
    shape.maxPerArtist,
    ORDER_STRATEGIES.indexOf(shape.order),
    shape.familiarity,
    shape.depth,
  ];
}

export function encodeRecipe(recipe: Recipe): string {
  const compact = {
    v: RECIPE_SCHEMA_VERSION,
    i: recipe.id,
    n: recipe.name,
    s: recipe.sources.map(encodeSource),
    x: recipe.exclusions.map(encodeExclusion),
    h: encodeShape(recipe.shape),
  };
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(compact)));
}

// ---------------------------------------------------------------------------
// Reading it back
// ---------------------------------------------------------------------------

function asArray(value: unknown): readonly unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asMember<T extends string>(value: unknown, members: readonly T[]): T | null {
  const index = asNumber(value);
  if (index === null || !Number.isInteger(index)) return null;
  return members[index] ?? null;
}

/** Distinct from both a real string and a legitimately absent field. */
const MALFORMED = Symbol('malformed');

function asOptionalString(value: unknown): string | null | typeof MALFORMED {
  if (value === ABSENT) return null;
  const text = asString(value);
  return text === null ? MALFORMED : text;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) out[key] = entry;
  return out;
}

function asYearRange(value: unknown): YearRange | null {
  const pair = asArray(value);
  if (pair === null || pair.length !== 2) return null;
  const from = asNumber(pair[0]);
  const to = asNumber(pair[1]);
  if (from === null || to === null) return null;
  return { from, to };
}

function asDurationRange(minValue: unknown, maxValue: unknown): DurationRange | null {
  const minMs = asNumber(minValue);
  const maxMs = asNumber(maxValue);
  if (minMs === null || maxMs === null) return null;
  return { minMs, maxMs };
}

function decodeSource(value: unknown): Source | null {
  const parts = asArray(value);
  if (parts === null) return null;
  const code = asNumber(parts[0]);

  switch (code) {
    case SOURCE_CODES.artist: {
      const id = asString(parts[1]);
      const depth = asMember<CatalogDepth>(parts[2], CATALOG_DEPTHS);
      if (id === null || depth === null) return null;
      return { kind: 'artist', artistId: artistId(id), depth };
    }
    case SOURCE_CODES.track: {
      const id = asString(parts[1]);
      const expand = asMember<TrackExpansion>(parts[2], TRACK_EXPANSIONS);
      if (id === null || expand === null) return null;
      return { kind: 'track', trackId: trackId(id), expand };
    }
    case SOURCE_CODES.search: {
      const query = typeof parts[1] === 'string' ? parts[1] : null;
      const genre = asOptionalString(parts[2]);
      const obscurity = asMember<Obscurity>(parts[4], OBSCURITIES);
      if (query === null || genre === MALFORMED || obscurity === null) return null;
      const years = parts[3] === ABSENT ? null : asYearRange(parts[3]);
      if (parts[3] !== ABSENT && years === null) return null;
      return {
        kind: 'search',
        query,
        obscurity,
        ...(genre === null ? {} : { genre }),
        ...(years === null ? {} : { years }),
      };
    }
    case SOURCE_CODES.playlist: {
      const id = asString(parts[1]);
      if (id === null) return null;
      return { kind: 'playlist', playlistId: playlistId(id) };
    }
    case SOURCE_CODES.library:
      return { kind: 'library' };
    case SOURCE_CODES.topTracks: {
      const range = asMember<TopRange>(parts[1], TOP_RANGES);
      if (range === null) return null;
      return { kind: 'topTracks', range };
    }
    case SOURCE_CODES.followedArtists: {
      const depth = asMember<CatalogDepth>(parts[1], CATALOG_DEPTHS);
      if (depth === null) return null;
      return { kind: 'followedArtists', depth };
    }
    case SOURCE_CODES.newReleases: {
      const genre = asOptionalString(parts[1]);
      if (genre === MALFORMED) return null;
      return { kind: 'newReleases', ...(genre === null ? {} : { genre }) };
    }
    default:
      return null;
  }
}

function decodeExclusion(value: unknown): Exclusion | null {
  const parts = asArray(value);
  if (parts === null) return null;
  const code = asNumber(parts[0]);

  switch (code) {
    case EXCLUSION_CODES.artist: {
      const id = asString(parts[1]);
      return id === null ? null : { kind: 'artist', artistId: artistId(id) };
    }
    case EXCLUSION_CODES.playlist: {
      const id = asString(parts[1]);
      return id === null ? null : { kind: 'playlist', playlistId: playlistId(id) };
    }
    case EXCLUSION_CODES.inLibrary:
      return { kind: 'inLibrary' };
    case EXCLUSION_CODES.heardRecently:
      return { kind: 'heardRecently' };
    case EXCLUSION_CODES.years: {
      const range = asYearRange([parts[1], parts[2]]);
      return range === null ? null : { kind: 'years', range };
    }
    case EXCLUSION_CODES.duration: {
      const range = asDurationRange(parts[1], parts[2]);
      return range === null ? null : { kind: 'duration', range };
    }
    case EXCLUSION_CODES.explicit:
      return { kind: 'explicit' };
    case EXCLUSION_CODES.liveOrRemix:
      return { kind: 'liveOrRemix' };
    default:
      return null;
  }
}

function decodeShape(value: unknown): Shape | null {
  const parts = asArray(value);
  if (parts === null || parts.length !== 6) return null;

  const targetCode = asNumber(parts[0]);
  const targetValue = asNumber(parts[1]);
  const maxPerArtist = asNumber(parts[2]);
  const strategy = asMember<OrderStrategy>(parts[3], ORDER_STRATEGIES);
  const familiarity = asNumber(parts[4]);
  const depth = asNumber(parts[5]);

  if (targetValue === null || maxPerArtist === null || strategy === null) return null;
  if (familiarity === null || depth === null) return null;
  if (familiarity < 0 || familiarity > 1 || depth < 0 || depth > 1) return null;

  const target: Target | null =
    targetCode === TARGET_CODES.count
      ? { kind: 'count', count: targetValue }
      : targetCode === TARGET_CODES.duration
        ? { kind: 'duration', ms: targetValue }
        : null;
  if (target === null) return null;

  return {
    target,
    maxPerArtist,
    order: strategy,
    familiarity: dial(familiarity),
    depth: dial(depth),
  };
}

export function decodeRecipe(encoded: string): Result<Recipe, DecodeError> {
  try {
    const bytes = base64UrlToBytes(encoded);
    if (bytes === null) return err(DecodeError.notBase64());

    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return err(DecodeError.notJson());
    }

    const record = asRecord(parsed);
    if (record === null) return err(DecodeError.notJson());

    if (record['v'] !== RECIPE_SCHEMA_VERSION) return err(DecodeError.wrongVersion(record['v']));

    const id = asString(record['i']);
    if (id === null) return err(DecodeError.malformed('id'));

    const name = typeof record['n'] === 'string' ? record['n'] : null;
    if (name === null) return err(DecodeError.malformed('name'));

    const rawSources = asArray(record['s']);
    if (rawSources === null) return err(DecodeError.malformed('sources'));
    const sources: Source[] = [];
    for (const raw of rawSources) {
      const source = decodeSource(raw);
      if (source === null) return err(DecodeError.malformed('sources'));
      sources.push(source);
    }

    const rawExclusions = asArray(record['x']);
    if (rawExclusions === null) return err(DecodeError.malformed('exclusions'));
    const exclusions: Exclusion[] = [];
    for (const raw of rawExclusions) {
      const exclusion = decodeExclusion(raw);
      if (exclusion === null) return err(DecodeError.malformed('exclusions'));
      exclusions.push(exclusion);
    }

    const shape = decodeShape(record['h']);
    if (shape === null) return err(DecodeError.malformed('shape'));

    return ok({ id: recipeId(id), name, sources, exclusions, shape });
  } catch {
    // The validators above should catch everything; this is the belt that means a
    // pasted link can never take the app down. §6
    return err(DecodeError.notJson());
  }
}
