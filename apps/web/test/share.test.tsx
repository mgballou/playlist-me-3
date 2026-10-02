import { defaultRecipe, encodeRecipe, encodeShare, poolStamp, recipeId } from '@pm/core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Frame } from '@/components/shell/Frame';
import type { Connection } from '@/lib/spotify/connection';
import { makePool } from './support/pool';

const pool = makePool(60);

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
        sources: [],
        poolSize: pool.length,
        requests: 4,
        cacheHits: 0,
        artistsLookedUp: 5,
        genresAvailable: true,
      },
      requests: 4,
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
  const base = defaultRecipe(recipeId('rc-share'), 'Share test');
  return encodeRecipe({
    ...base,
    sources: [{ kind: 'library' }],
    shape: { ...base.shape, target: { kind: 'count', count: 8 }, maxPerArtist: 5 },
  });
})();

const RECIPE = (() => {
  const base = defaultRecipe(recipeId('rc-share'), 'Share test');
  return {
    ...base,
    sources: [{ kind: 'library' } as const],
    shape: { ...base.shape, target: { kind: 'count' as const, count: 8 }, maxPerArtist: 5 },
  };
})();

function linkWithStamp(stamp: string): string {
  return `/?r=${encodeShare({ recipe: RECIPE, seed: 99, locks: [], rejects: [], poolStamp: stamp })}`;
}

function rebuiltNotice(): HTMLElement | null {
  return screen.queryByText(/rebuilt, not the deck that was shared/);
}

function slotTitles(): readonly string[] {
  return screen.getAllByRole('listitem').flatMap((item) => {
    const title = item.querySelector('.slot__title');
    return title === null ? [] : [title.textContent ?? ''];
  });
}

async function openApp(url: string): Promise<void> {
  window.history.replaceState({}, '', url);
  render(<Frame connection={demo} />);
  await screen.findAllByRole('button', { name: /^Lock Track/ }, { timeout: 3000 });
}

function captureClipboard(): { readonly last: () => string } {
  const written: string[] = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        written.push(text);
      },
    },
  });
  return { last: () => written[written.length - 1] ?? '' };
}

async function copyLink(user: ReturnType<typeof userEvent.setup>): Promise<string> {
  const clipboard = captureClipboard();
  await user.click(screen.getByRole('button', { name: 'Shelf' }));
  await user.click(screen.getByRole('button', { name: 'Copy a link' }));
  return clipboard.last();
}

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('a shared link reproduces the deck', () => {
  it('gives the same deck on two fresh loads', async () => {
    const user = userEvent.setup();
    await openApp(`/?r=${ENCODED}`);
    const link = await copyLink(user);
    const search = link.slice(link.indexOf('?'));
    cleanup();

    await openApp(search);
    const first = slotTitles();
    cleanup();

    await openApp(search);
    const second = slotTitles();

    expect(second).toEqual(first);
  });

  it('carries the locks, so a re-roll on the far side holds them', async () => {
    const user = userEvent.setup();
    await openApp(`/?r=${ENCODED}`);
    await user.click(screen.getAllByRole('button', { name: /^Lock Track/ })[0]!);
    const held = slotTitles()[0];
    const link = await copyLink(user);
    const search = link.slice(link.indexOf('?'));
    cleanup();

    await openApp(search);
    await user.click(screen.getByRole('button', { name: 'Re-roll' }));

    expect(slotTitles()[0]).toBe(held);
  });
});

/**
 * Finding 2 of the 9 September hostile read, through the app the person actually uses. The
 * pool is the same pool, so the stamp matched and the bench claimed the deck was exact while
 * the three banished tracks sat back in it.
 */
describe('a shared link carries what was banished', () => {
  async function banishThree(user: ReturnType<typeof userEvent.setup>): Promise<readonly string[]> {
    const gone: string[] = [];
    for (let round = 0; round < 3; round += 1) {
      const title = slotTitles()[0] ?? '';
      gone.push(title);
      await user.click(screen.getByRole('button', { name: `Reject ${title}` }));
    }
    return gone;
  }

  it('opens on the same slots the sharer was looking at', async () => {
    const user = userEvent.setup();
    await openApp(`/?r=${ENCODED}`);
    await banishThree(user);
    const mine = slotTitles();
    const link = await copyLink(user);
    cleanup();

    await openApp(link.slice(link.indexOf('?')));

    expect(slotTitles()).toEqual(mine);
  });

  it('leaves the banished tracks out on the far side', async () => {
    const user = userEvent.setup();
    await openApp(`/?r=${ENCODED}`);
    const gone = await banishThree(user);
    const link = await copyLink(user);
    cleanup();

    await openApp(link.slice(link.indexOf('?')));

    expect(slotTitles().filter((title) => gone.includes(title))).toEqual([]);
  });
});

describe('a link whose pool has moved says so', () => {
  it('says the deck was rebuilt when the pool no longer matches the stamp', async () => {
    await openApp(linkWithStamp('a-pool-that-is-gone'));
    expect(rebuiltNotice()).toBeInTheDocument();
  });

  it('says nothing when the pool is the one the deck was built from', async () => {
    await openApp(linkWithStamp(poolStamp(pool)));
    expect(rebuiltNotice()).toBeNull();
  });

  it('stops claiming anything once the deck is re-rolled', async () => {
    const user = userEvent.setup();
    await openApp(linkWithStamp('a-pool-that-is-gone'));
    await user.click(screen.getByRole('button', { name: 'Re-roll' }));
    expect(rebuiltNotice()).toBeNull();
  });
});
