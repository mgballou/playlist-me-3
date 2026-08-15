import { defaultRecipe, encodeRecipe, recipeId } from '@pm/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

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

/** A recipe naming one `library` source, encoded by `@pm/core`. The shared link is the
 * shortest route to a non-empty bench that still goes through the real restore path. */
const ENCODED = (() => {
  const base = defaultRecipe(recipeId('rc-deck'), 'Deck test');
  return encodeRecipe({
    ...base,
    sources: [{ kind: 'library' }],
    shape: { ...base.shape, target: { kind: 'count', count: 8 }, maxPerArtist: 5 },
  });
})();

async function benchWithTracks(): Promise<void> {
  window.history.replaceState({}, '', `/?r=${ENCODED}`);
  render(<Frame connection={demo} />);
  await screen.findAllByRole('button', { name: /^Lock Track/ }, { timeout: 3000 });
}

function slotTitles(): readonly string[] {
  return screen.getAllByRole('listitem').flatMap((item) => {
    const title = item.querySelector('.slot__title');
    return title === null ? [] : [title.textContent ?? ''];
  });
}

describe('the tinkering loop', () => {
  it('fills the deck once a source resolves', async () => {
    await benchWithTracks();
    expect(slotTitles().length).toBeGreaterThan(0);
  });

  it('holds a locked track at its slot across a re-roll', async () => {
    const user = userEvent.setup();
    await benchWithTracks();

    const before = slotTitles();
    const firstTitle = before[0];
    await user.click(screen.getAllByRole('button', { name: /^Lock Track/ })[0]!);
    await user.click(screen.getByRole('button', { name: 'Re-roll' }));

    expect(slotTitles()[0]).toBe(firstTitle);
  });

  it('turns the unlocked slots over on a re-roll', async () => {
    const user = userEvent.setup();
    await benchWithTracks();

    const before = slotTitles();
    await user.click(screen.getByRole('button', { name: 'Re-roll' }));

    expect(slotTitles().join('|')).not.toBe(before.join('|'));
  });

  it('reports a lock as pressed', async () => {
    const user = userEvent.setup();
    await benchWithTracks();
    const lock = screen.getAllByRole('button', { name: /^Lock Track/ })[0]!;
    await user.click(lock);
    expect(screen.getAllByRole('button', { name: /^Unlock Track/ })[0]).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('removes a rejected track from the deck', async () => {
    const user = userEvent.setup();
    await benchWithTracks();

    const doomed = slotTitles()[0]!;
    await user.click(screen.getAllByRole('button', { name: /^Reject Track/ })[0]!);

    expect(slotTitles()).not.toContain(doomed);
  });

  it('never brings a rejected track back on a re-roll', async () => {
    const user = userEvent.setup();
    await benchWithTracks();

    const doomed = slotTitles()[0]!;
    await user.click(screen.getAllByRole('button', { name: /^Reject Track/ })[0]!);
    await user.click(screen.getByRole('button', { name: 'Re-roll' }));
    await user.click(screen.getByRole('button', { name: 'Re-roll' }));

    expect(slotTitles()).not.toContain(doomed);
  });

  it('keeps a reject undoable for the life of the build', async () => {
    const user = userEvent.setup();
    await benchWithTracks();

    await user.click(screen.getAllByRole('button', { name: /^Reject Track/ })[0]!);
    await user.click(screen.getByRole('button', { name: /Rejected/ }));

    expect(screen.getByRole('button', { name: 'Put it back' })).toBeInTheDocument();
  });

  it('restores a rejected track when the reject is undone', async () => {
    const user = userEvent.setup();
    await benchWithTracks();

    const doomed = slotTitles()[0]!;
    await user.click(screen.getAllByRole('button', { name: /^Reject Track/ })[0]!);
    await user.click(screen.getByRole('button', { name: /Rejected/ }));
    await user.click(screen.getByRole('button', { name: 'Put it back' }));

    expect(slotTitles()).toContain(doomed);
  });
});

describe('the deck region has one accent', () => {
  it('gives it to re-roll', async () => {
    await benchWithTracks();
    const deck = screen.getByRole('region', { name: 'Deck' });
    expect(within(deck).getByRole('button', { name: 'Re-roll' })).toHaveClass('act');
  });

  it('gives it to nothing else', async () => {
    await benchWithTracks();
    const deck = screen.getByRole('region', { name: 'Deck' });
    const accents = within(deck)
      .getAllByRole('button')
      .filter((button) => button.className.split(/\s+/).includes('act'));
    expect(accents).toHaveLength(1);
  });
});

describe('the build report is inline, not hidden', () => {
  it('is reachable from the deck', async () => {
    await benchWithTracks();
    expect(screen.getByRole('button', { name: /Why these/ })).toBeInTheDocument();
  });

  it('says where the tracks came from', async () => {
    const user = userEvent.setup();
    await benchWithTracks();
    await user.click(screen.getByRole('button', { name: /Why these/ }));
    expect(screen.getByText('Where the tracks came from')).toBeInTheDocument();
  });
});

describe('a collapsed reveal is inert, not merely hidden', () => {
  it('does not render its body while closed', async () => {
    await benchWithTracks();
    expect(screen.queryByText('Where the tracks came from')).toBeNull();
  });

  it('says it is collapsed', async () => {
    await benchWithTracks();
    expect(screen.getByRole('button', { name: /Why these/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});
