import { defaultRecipe, encodeRecipe, recipeId } from '@pm/core';
import type { SourceReport } from '@pm/spotify';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Frame } from '@/components/shell/Frame';
import { LIMIT_ORDER, limitCopy, limitsHit } from '@/lib/registry/limits';
import type { Connection } from '@/lib/spotify/connection';
import { makePool } from './support/pool';

const pool = makePool(40);

function report(overrides: Partial<SourceReport> = {}): SourceReport {
  return {
    sourceIndex: 0,
    kind: 'search',
    found: 100,
    contributed: 100,
    duplicates: 0,
    requests: 10,
    hitOffsetCeiling: false,
    hitPageLimit: false,
    hitAlbumLimit: false,
    hitTrackLimit: false,
    empty: false,
    failure: null,
    ...overrides,
  };
}

const CLIPPED: readonly SourceReport[] = [
  report({ sourceIndex: 0, kind: 'search', hitPageLimit: true }),
  report({ sourceIndex: 1, kind: 'newReleases', hitAlbumLimit: true }),
];

vi.mock('@/lib/actions/resolve', () => ({
  resolveWorkbench: vi.fn(async () => ({
    ok: true as const,
    resolved: {
      pool,
      context: {
        libraryTrackIds: [],
        topTrackIds: [],
        recentlyHeardTrackIds: [],
        followedArtistIds: [],
        playlists: [],
      },
      report: {
        sources: CLIPPED,
        poolSize: pool.length,
        requests: 32,
        cacheHits: 0,
        artistsLookedUp: 4,
        genresAvailable: true,
      },
      requests: 32,
      mode: 'demo' as const,
    },
  })),
}));

vi.mock('@/lib/persistence/store', () => ({
  browserStore: () => ({
    read: async () => null,
    write: async () => undefined,
    remove: async () => undefined,
    keys: async () => [],
  }),
}));

const demo: Connection = {
  mode: 'demo',
  cause: 'notConfigured',
  label: 'demo mode',
  notice: 'Demo mode. Every artist, album and track here is invented.',
  nextStep: null,
};

const ENCODED = (() => {
  const base = defaultRecipe(recipeId('rc-limits'), 'Limits test');
  return encodeRecipe({
    ...base,
    sources: [{ kind: 'search', query: 'the', obscurity: 'any' }, { kind: 'newReleases' }],
    shape: { ...base.shape, target: { kind: 'count', count: 8 }, maxPerArtist: 5 },
  });
})();

async function openTheReport(): Promise<void> {
  window.history.replaceState({}, '', `/?r=${ENCODED}`);
  render(<Frame connection={demo} />);
  await screen.findAllByRole('button', { name: /^Lock Track/ }, { timeout: 3000 });
  await userEvent.setup().click(screen.getByRole('button', { name: /Why these/ }));
}

describe('the limit registry', () => {
  it('has copy for every kind it orders', () => {
    expect(LIMIT_ORDER.map((kind) => limitCopy(kind).kind)).toEqual(LIMIT_ORDER);
  });

  it('names no limit for a source that read to the end', () => {
    expect(limitsHit(report())).toEqual([]);
  });

  it('names every limit a source ran into', () => {
    const both = report({ hitPageLimit: true, hitTrackLimit: true });
    expect(limitsHit(both)).toEqual(['trackBudget', 'pageBudget']);
  });

  it('puts Spotify’s own ceiling first, because nobody here can raise it', () => {
    const both = report({ hitOffsetCeiling: true, hitPageLimit: true });
    expect(limitsHit(both)[0]).toBe('offsetCeiling');
  });

  it('offers a next step for every budget it can name', () => {
    const budgets = LIMIT_ORDER.filter((kind) => kind !== 'offsetCeiling');
    expect(budgets.filter((kind) => limitCopy(kind).remedy === null)).toEqual([]);
  });
});

describe('the deck report says where a source stopped reading', () => {
  it('gives the clipped sources a part of their own', async () => {
    await openTheReport();
    expect(screen.getByText('Where a source stopped reading')).toBeInTheDocument();
  });

  it('names the search that ran out of pages', async () => {
    await openTheReport();
    expect(screen.getByText(limitCopy('pageBudget').summary, { exact: false })).toBeInTheDocument();
  });

  it('names the album search that ran out of albums', async () => {
    await openTheReport();
    expect(
      screen.getByText(limitCopy('albumBudget').summary, { exact: false }),
    ).toBeInTheDocument();
  });

  it('says which source each ceiling belongs to', async () => {
    await openTheReport();
    const part = screen.getByText('Where a source stopped reading').closest('section');
    expect(part?.textContent).toContain('New releases');
  });

  it('says nothing about a ceiling nothing hit', async () => {
    await openTheReport();
    expect(screen.queryByText(limitCopy('offsetCeiling').summary, { exact: false })).toBeNull();
  });
});
