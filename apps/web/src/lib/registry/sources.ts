/**
 * The source registry. ui-sensibility §12: **no screen decides what color a state is.**
 *
 * Every enumerated kind carries its own tone, glyph and label here, once, and one shared
 * component reads them. Adding a source kind makes it render correctly everywhere with no
 * change to any screen — which is the whole test of whether this is a registry or a lookup
 * table someone will forget to update.
 *
 * The tone is a **semantic token name**, never a color. §5.1: a source tone is identity, it
 * rides with the data, and it never fills a control that acts.
 */

import type {
  CatalogDepth,
  Obscurity,
  Source,
  SourceKind,
  TopRange,
  TrackExpansion,
  YearRange,
} from '@pm/core';
import { unreachable } from '@pm/core';

/** What a source needs before it can be added: a subject, or nothing at all. */
export type SubjectKind = 'artist' | 'track' | 'playlist' | 'query' | 'none';

export type SourceDefinition = {
  readonly kind: SourceKind;
  readonly label: string;
  readonly glyph: string;
  /** A semantic token name from `tokens.css`. Never a color. §4.1, §5.1 */
  readonly tone: string;
  /** One line, shown while choosing the kind. The bench never explains itself twice. §11 */
  readonly summary: string;
  readonly subject: SubjectKind;
  /** Label for the subject step, when there is one. §2.6 */
  readonly subjectLabel: string | null;
  /** True when the kind reads the person's own account, so demo mode is synthetic. */
  readonly needsAccount: boolean;
};

export const SOURCE_DEFINITIONS: Readonly<Record<SourceKind, SourceDefinition>> = {
  artist: {
    kind: 'artist',
    label: 'Artist',
    glyph: '◆',
    tone: '--source-artist',
    summary: 'Walk one act’s discography.',
    subject: 'artist',
    subjectLabel: 'Which artist',
    needsAccount: false,
  },
  track: {
    kind: 'track',
    label: 'Track',
    glyph: '●',
    tone: '--source-track',
    summary: 'Start from one song and reach its album or its collaborators.',
    subject: 'track',
    subjectLabel: 'Which track',
    needsAccount: false,
  },
  search: {
    kind: 'search',
    label: 'Search',
    glyph: '⌕',
    tone: '--source-search',
    summary: 'Words, a genre, a span of years.',
    subject: 'query',
    subjectLabel: 'What to search for',
    needsAccount: false,
  },
  playlist: {
    kind: 'playlist',
    label: 'Playlist',
    glyph: '≡',
    tone: '--source-playlist',
    summary: 'Everything on one of your playlists.',
    subject: 'playlist',
    subjectLabel: 'Which playlist',
    needsAccount: true,
  },
  library: {
    kind: 'library',
    label: 'My library',
    glyph: '♡',
    tone: '--source-library',
    summary: 'Everything you have saved.',
    subject: 'none',
    subjectLabel: null,
    needsAccount: true,
  },
  topTracks: {
    kind: 'topTracks',
    label: 'My top tracks',
    glyph: '▲',
    tone: '--source-top',
    summary: 'What you have played most.',
    subject: 'none',
    subjectLabel: null,
    needsAccount: true,
  },
  followedArtists: {
    kind: 'followedArtists',
    label: 'Artists I follow',
    glyph: '⌗',
    tone: '--source-followed',
    summary: 'Every act you follow, walked to a depth you choose.',
    subject: 'none',
    subjectLabel: null,
    needsAccount: true,
  },
  newReleases: {
    kind: 'newReleases',
    label: 'New releases',
    glyph: '✦',
    tone: '--source-new',
    summary: 'Records tagged new, optionally narrowed by a genre word.',
    subject: 'none',
    subjectLabel: null,
    needsAccount: false,
  },
};

/** Presentation order on the bench. Deliberate: the two that need nothing sit together. */
export const SOURCE_ORDER: readonly SourceKind[] = [
  'artist',
  'search',
  'playlist',
  'track',
  'library',
  'topTracks',
  'followedArtists',
  'newReleases',
];

export function sourceDefinition(kind: SourceKind): SourceDefinition {
  return SOURCE_DEFINITIONS[kind];
}

// ---------------------------------------------------------------------------
// The supporting unions, in words. §2.2.0
// ---------------------------------------------------------------------------

export const CATALOG_DEPTH_LABELS: Readonly<Record<CatalogDepth, string>> = {
  albums: 'Albums only',
  albumsAndSingles: 'Albums and singles',
  everything: 'Everything, including guest spots',
};

export const TRACK_EXPANSION_LABELS: Readonly<Record<TrackExpansion, string>> = {
  album: 'Its album',
  collaborators: 'Who it was made with',
  both: 'Both',
};

export const OBSCURITY_LABELS: Readonly<Record<Obscurity, string>> = {
  any: 'Anything that matches',
  obscure: 'Off the beaten track',
};

export const TOP_RANGE_LABELS: Readonly<Record<TopRange, string>> = {
  shortTerm: 'The last month',
  mediumTerm: 'The last six months',
  longTerm: 'All time',
};

/**
 * Obscurity costs a request per album, because `tag:hipster` is album-scoped and `genre:`
 * is not, so the obscure path searches albums and then fetches their tracks (spec §2.2.1).
 * The person is told before they spend it, not after (§5.2).
 */
export const OBSCURITY_COST_NOTE =
  'Off the beaten track searches albums, then fetches each one — it costs more requests, and it cannot use the genre as a filter, only as words.';

// ---------------------------------------------------------------------------
// A configured source, in words
// ---------------------------------------------------------------------------

/**
 * What the bench shows on a source row once it is added. Names the subject the person
 * chose, so the row is recognizable at a glance rather than by its kind alone.
 *
 * `names` supplies the human name for an id we resolved earlier; an id we never resolved
 * falls back to itself rather than to "unknown", because an id is at least true.
 */
export function describeSource(source: Source, names: ReadonlyMap<string, string>): string {
  switch (source.kind) {
    case 'artist':
      return names.get(source.artistId) ?? source.artistId;
    case 'track':
      return names.get(source.trackId) ?? source.trackId;
    case 'search':
      return [source.query, source.genre, describeYears(source.years)]
        .filter((part): part is string => part !== undefined && part.length > 0)
        .join(' · ');
    case 'playlist':
      return names.get(source.playlistId) ?? source.playlistId;
    case 'library':
      return 'Everything you have saved';
    case 'topTracks':
      return TOP_RANGE_LABELS[source.range];
    case 'followedArtists':
      return CATALOG_DEPTH_LABELS[source.depth];
    case 'newReleases':
      return source.genre === undefined || source.genre.length === 0
        ? 'Anything tagged new'
        : source.genre;
    default:
      return unreachable(source);
  }
}

/** The second line: the tuning, when the source has any. Absent rather than "default". §12 */
export function describeSourceTuning(source: Source): string | null {
  switch (source.kind) {
    case 'artist':
      return CATALOG_DEPTH_LABELS[source.depth];
    case 'track':
      return TRACK_EXPANSION_LABELS[source.expand];
    case 'search':
      return OBSCURITY_LABELS[source.obscurity];
    case 'playlist':
    case 'library':
    case 'topTracks':
    case 'followedArtists':
    case 'newReleases':
      return null;
    default:
      return unreachable(source);
  }
}

export function describeYears(years: YearRange | undefined): string {
  if (years === undefined) return '';
  return years.from === years.to ? String(years.from) : `${String(years.from)}–${String(years.to)}`;
}
