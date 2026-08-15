/**
 * The exclusion registry. Same rule as sources (§12): the kind carries its own glyph, label
 * and words, and one component reads them.
 *
 * **`playlist` and `inLibrary` are the headline features** (spec §2.3) — the two things
 * Spotify's own generator has never offered, and the two that solve the stated problem. They
 * are marked as such here rather than by a screen deciding to put them first.
 *
 * `liveOrRemix` carries its honesty note here too (§12.1). Copy that implies certainty about
 * a title heuristic would be a lie, and the place to stop telling it is the registry, not the
 * component.
 */

import type { DurationRange, Exclusion, ExclusionKind, YearRange } from '@pm/core';
import { format, unreachable } from '@pm/core';

/** What the exclusion needs before it can be added. */
export type ExclusionSubject = 'artist' | 'playlist' | 'years' | 'duration' | 'none';

export type ExclusionDefinition = {
  readonly kind: ExclusionKind;
  readonly label: string;
  readonly glyph: string;
  readonly summary: string;
  readonly subject: ExclusionSubject;
  readonly subjectLabel: string | null;
  /** Spec §2.3: these two are the product. Everything else is ordinary. */
  readonly headline: boolean;
  /** Set where the app estimates rather than measures. Rendered, never optional. §12.1 */
  readonly caveat: string | null;
  readonly needsAccount: boolean;
};

export const EXCLUSION_DEFINITIONS: Readonly<Record<ExclusionKind, ExclusionDefinition>> = {
  playlist: {
    kind: 'playlist',
    label: 'Anything off a playlist',
    glyph: '≡',
    summary: 'Never anything off Kids Jams. The reason this app exists.',
    subject: 'playlist',
    subjectLabel: 'Which playlist',
    headline: true,
    caveat: null,
    needsAccount: true,
  },
  inLibrary: {
    kind: 'inLibrary',
    label: 'Anything already in my library',
    glyph: '♡',
    summary: 'Only things you have not saved.',
    subject: 'none',
    subjectLabel: null,
    headline: true,
    caveat: null,
    needsAccount: true,
  },
  artist: {
    kind: 'artist',
    label: 'An artist',
    glyph: '◆',
    summary: 'Never this act, however it got into the pool.',
    subject: 'artist',
    subjectLabel: 'Which artist',
    headline: false,
    caveat: null,
    needsAccount: false,
  },
  heardRecently: {
    kind: 'heardRecently',
    label: 'Anything I heard recently',
    glyph: '↻',
    summary: 'Your last fifty plays, kept out.',
    subject: 'none',
    subjectLabel: null,
    headline: false,
    caveat: null,
    needsAccount: true,
  },
  years: {
    kind: 'years',
    label: 'A span of years',
    glyph: '⌛',
    summary: 'Everything released between two years, inclusive.',
    subject: 'years',
    subjectLabel: 'Which years',
    headline: false,
    caveat: null,
    needsAccount: false,
  },
  duration: {
    kind: 'duration',
    label: 'A span of running times',
    glyph: '⏱',
    summary: 'No two-minute sketches, or no twenty-minute suites.',
    subject: 'duration',
    subjectLabel: 'How long',
    headline: false,
    caveat: null,
    needsAccount: false,
  },
  explicit: {
    kind: 'explicit',
    label: 'Explicit tracks',
    glyph: 'Ⓔ',
    summary: 'Spotify’s own flag, so this one is exact.',
    subject: 'none',
    subjectLabel: null,
    headline: false,
    caveat: null,
    needsAccount: false,
  },
  liveOrRemix: {
    kind: 'liveOrRemix',
    label: 'Live takes and remixes',
    glyph: '✂',
    summary: 'Reads the title for Live, Remix, Remaster and the rest.',
    subject: 'none',
    subjectLabel: null,
    headline: false,
    // §12.1: the live/remix filter says "best effort". It misses and it over-catches, and
    // the interface is where overclaiming would be easiest.
    caveat:
      'Best effort. It reads titles, so it misses a live album with no marker in its track names.',
    needsAccount: false,
  },
};

/** Headline first, then the ordinary ones. The order is data, not a screen's opinion. */
export const EXCLUSION_ORDER: readonly ExclusionKind[] = [
  'playlist',
  'inLibrary',
  'artist',
  'heardRecently',
  'liveOrRemix',
  'explicit',
  'years',
  'duration',
];

export function exclusionDefinition(kind: ExclusionKind): ExclusionDefinition {
  return EXCLUSION_DEFINITIONS[kind];
}

/** What the bench shows on an exclusion row: the subject, where there is one. */
export function describeExclusion(
  exclusion: Exclusion,
  names: ReadonlyMap<string, string>,
): string {
  switch (exclusion.kind) {
    case 'artist':
      return names.get(exclusion.artistId) ?? exclusion.artistId;
    case 'playlist':
      return names.get(exclusion.playlistId) ?? exclusion.playlistId;
    case 'years':
      return describeYearRange(exclusion.range);
    case 'duration':
      return describeDurationRange(exclusion.range);
    case 'inLibrary':
    case 'heardRecently':
    case 'explicit':
    case 'liveOrRemix':
      return EXCLUSION_DEFINITIONS[exclusion.kind].label;
    default:
      return unreachable(exclusion);
  }
}

export function describeYearRange(range: YearRange): string {
  return range.from === range.to ? String(range.from) : `${String(range.from)}–${String(range.to)}`;
}

export function describeDurationRange(range: DurationRange): string {
  return `${format({ kind: 'trackDuration', ms: range.minMs })}–${format({
    kind: 'trackDuration',
    ms: range.maxMs,
  })}`;
}
