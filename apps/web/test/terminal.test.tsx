import { defaultRecipe, encodeRecipe, recipeId } from '@pm/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Frame } from '@/components/shell/Frame';
import type { Connection } from '@/lib/spotify/connection';
import { makePool } from './support/pool';

/**
 * §2.7: **a dead end is a bug.** Every terminal state names what happens next, and the way
 * out it offers has to answer the constraint that is actually binding — an offer that relaxes
 * the wrong thing is a dead end with a button on it.
 */

const pool = makePool(20);

vi.mock('@/lib/actions/resolve', () => ({
  resolveWorkbench: vi.fn(async () => ({
    ok: true as const,
    resolved: {
      pool,
      context: {
        libraryTrackIds: pool.map((track) => track.id),
        topTrackIds: [],
        recentlyHeardTrackIds: [],
        followedArtistIds: [],
        playlists: [],
      },
      report: {
        sources: [],
        poolSize: pool.length,
        requests: 2,
        cacheHits: 0,
        artistsLookedUp: 5,
        genresAvailable: true,
      },
      requests: 2,
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

/** Every pooled track is in the library, and the library is blocked. Nothing can survive. */
const BLOCKED_OUT = (() => {
  const base = defaultRecipe(recipeId('rc-zero'), 'Blocked out');
  return encodeRecipe({
    ...base,
    sources: [{ kind: 'library' }],
    exclusions: [{ kind: 'inLibrary' }],
  });
})();

/** A pool of twenty against a target of two hundred: short, but not empty. */
const TOO_SHORT = (() => {
  const base = defaultRecipe(recipeId('rc-short'), 'Too short');
  return encodeRecipe({
    ...base,
    sources: [{ kind: 'library' }],
    shape: { ...base.shape, target: { kind: 'count', count: 200 }, maxPerArtist: 10 },
  });
})();

async function bench(encoded: string, settle: RegExp): Promise<void> {
  window.history.replaceState({}, '', `/?r=${encoded}`);
  render(<Frame connection={demo} />);
  await screen.findByText(settle, {}, { timeout: 3000 });
}

/** The shortfall line is assembled from three nodes, so it is read as one string. */
function shortfallLine(): string {
  return document.querySelector('.deck__short')?.textContent ?? '';
}

async function shortBench(): Promise<void> {
  window.history.replaceState({}, '', `/?r=${TOO_SHORT}`);
  render(<Frame connection={demo} />);
  await screen.findAllByRole('button', { name: /^Lock Track/ }, { timeout: 3000 });
}

describe('a build that reached zero tracks', () => {
  it('names the binding constraint rather than saying no results', async () => {
    await bench(BLOCKED_OUT, /Nothing survived/);
    const lead = document.querySelector('.deck .empty__lead')?.textContent ?? '';
    expect(lead).toMatch(/the blocks removed everything the sources found/);
  });

  it('offers the way out that answers that constraint', async () => {
    await bench(BLOCKED_OUT, /Nothing survived/);
    expect(screen.getByRole('button', { name: 'Drop the last block' })).toBeInTheDocument();
  });

  it('does not offer to relax a limit that is not binding', async () => {
    await bench(BLOCKED_OUT, /Nothing survived/);
    expect(screen.queryByRole('button', { name: 'Allow one more per artist' })).toBeNull();
  });

  it('cannot be saved', async () => {
    await bench(BLOCKED_OUT, /Nothing survived/);
    expect(screen.getByRole('button', { name: 'Save to Spotify' })).toBeDisabled();
  });
});

describe('a pool short of the target', () => {
  it('says how short it is', async () => {
    await shortBench();
    expect(shortfallLine()).toMatch(/180 tracks short of the target/);
  });

  it('names what would fix it', async () => {
    await shortBench();
    expect(shortfallLine()).toMatch(/Widen a source, or ask for fewer tracks/);
  });

  it('still lets what it did build be saved', async () => {
    await shortBench();
    expect(screen.getByRole('button', { name: 'Save to Spotify' })).toBeEnabled();
  });

  it('reports the shortfall in the ledger too', async () => {
    await shortBench();
    const ledger = document.querySelector('.ledger__summary')?.textContent ?? '';
    expect(ledger).toMatch(/the pool ran out before the target\./);
  });

  it('keeps the ledger line short, without the remedy', async () => {
    await shortBench();
    const ledger = document.querySelector('.ledger__summary')?.textContent ?? '';
    expect(ledger).not.toMatch(/Widen a source/);
  });
});
