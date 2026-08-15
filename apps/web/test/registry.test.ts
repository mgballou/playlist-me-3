// @vitest-environment node
// Reads the registry files off disk, so it wants a real file URL rather than jsdom's.
import type { ExclusionKind, SourceKind } from '@pm/core';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { EXCLUSION_DEFINITIONS, EXCLUSION_ORDER } from '@/lib/registry/exclusions';
import { ORDER_DEFINITIONS } from '@/lib/registry/order';
import { shortfallCopy } from '@/lib/registry/shortfall';
import { SOURCE_DEFINITIONS, SOURCE_ORDER } from '@/lib/registry/sources';
import { toneStyle } from '@/lib/registry/tone';

/**
 * §12: **presentation follows data.** Each enumerated kind carries its own tone, glyph and
 * label in one registry, and adding a kind makes it render correctly everywhere with no UI
 * change. These are the assertions that make that claim checkable rather than aspirational.
 */

const SOURCE_KINDS: readonly SourceKind[] = [
  'artist',
  'track',
  'search',
  'playlist',
  'library',
  'topTracks',
  'followedArtists',
  'newReleases',
];

const EXCLUSION_KINDS: readonly ExclusionKind[] = [
  'artist',
  'playlist',
  'inLibrary',
  'heardRecently',
  'years',
  'duration',
  'explicit',
  'liveOrRemix',
];

describe('every source kind is in the registry', () => {
  it.each(SOURCE_KINDS)('%s has a definition', (kind) => {
    expect(SOURCE_DEFINITIONS[kind]).toBeDefined();
  });

  it.each(SOURCE_KINDS)('%s has a tone', (kind) => {
    expect(SOURCE_DEFINITIONS[kind].tone).toMatch(/^--source-/);
  });

  it.each(SOURCE_KINDS)('%s has a glyph', (kind) => {
    expect(SOURCE_DEFINITIONS[kind].glyph.length).toBeGreaterThan(0);
  });

  it.each(SOURCE_KINDS)('%s has a label', (kind) => {
    expect(SOURCE_DEFINITIONS[kind].label.length).toBeGreaterThan(0);
  });

  it('offers every kind on the bench', () => {
    expect([...SOURCE_ORDER].sort()).toEqual([...SOURCE_KINDS].sort());
  });

  it('gives each kind its own tone', () => {
    const tones = SOURCE_KINDS.map((kind) => SOURCE_DEFINITIONS[kind].tone);
    expect(new Set(tones).size).toBe(SOURCE_KINDS.length);
  });
});

describe('every exclusion kind is in the registry', () => {
  it.each(EXCLUSION_KINDS)('%s has a definition', (kind) => {
    expect(EXCLUSION_DEFINITIONS[kind]).toBeDefined();
  });

  it.each(EXCLUSION_KINDS)('%s has a label', (kind) => {
    expect(EXCLUSION_DEFINITIONS[kind].label.length).toBeGreaterThan(0);
  });

  it('offers every kind on the bench', () => {
    expect([...EXCLUSION_ORDER].sort()).toEqual([...EXCLUSION_KINDS].sort());
  });

  it('puts the two headline kinds first', () => {
    expect(EXCLUSION_ORDER.slice(0, 2)).toEqual(['playlist', 'inLibrary']);
  });

  it('marks the playlist block as headline', () => {
    expect(EXCLUSION_DEFINITIONS.playlist.headline).toBe(true);
  });

  it('marks the library block as headline', () => {
    expect(EXCLUSION_DEFINITIONS.inLibrary.headline).toBe(true);
  });

  it('marks nothing else as headline', () => {
    const headline = EXCLUSION_KINDS.filter((kind) => EXCLUSION_DEFINITIONS[kind].headline);
    expect(headline).toHaveLength(2);
  });
});

describe('every ordering strategy has words', () => {
  it.each(['shuffle', 'byRelease', 'artistClustered', 'sourceInterleaved'] as const)(
    '%s has a label',
    (strategy) => {
      expect(ORDER_DEFINITIONS[strategy].label.length).toBeGreaterThan(0);
    },
  );
});

describe('every shortfall names its constraint and its remedy', () => {
  const REASONS = ['emptyPool', 'poolExhausted', 'maxPerArtist', 'maxPerArtistBelowOne'] as const;

  it.each(REASONS)('%s names the binding constraint', (reason) => {
    expect(shortfallCopy(reason).summary.length).toBeGreaterThan(0);
  });

  it.each(REASONS)('%s names what happens next', (reason) => {
    expect(shortfallCopy(reason).remedy).not.toBeNull();
  });

  it.each(REASONS)('%s never says "no results"', (reason) => {
    expect(shortfallCopy(reason).summary).not.toMatch(/no results/i);
  });

  it('gives each reason its own words', () => {
    const summaries = REASONS.map((reason) => shortfallCopy(reason).summary);
    expect(new Set(summaries).size).toBe(REASONS.length);
  });
});

describe('a tone becomes a look in one place', () => {
  it('sets the chip tone from the token', () => {
    expect(toneStyle('--source-artist')).toEqual({ '--chip-tone': 'var(--source-artist)' });
  });
});

describe('no screen decides a color', () => {
  const sources = ['sources.ts', 'exclusions.ts', 'dials.ts', 'order.ts', 'shortfall.ts'].map(
    (file) =>
      readFileSync(fileURLToPath(new URL(`../src/lib/registry/${file}`, import.meta.url)), 'utf8'),
  );

  it.each(sources.map((_, index) => index))('registry file %i holds no raw color', (index) => {
    expect(sources[index]).not.toMatch(/oklch\(|#[0-9a-fA-F]{6}\b/);
  });
});
