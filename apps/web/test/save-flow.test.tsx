import { defaultRecipe, encodeRecipe, recipeId } from '@pm/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Frame } from '@/components/shell/Frame';
import type { Connection } from '@/lib/spotify/connection';
import type { SaveOutcome } from '@/lib/workbench/save';
import { makePool } from './support/pool';

const pool = makePool(20);

const stubbed = vi.hoisted(() => {
  const state: { outcome: SaveOutcome | null } = { outcome: null };
  return state;
});

vi.mock('@/lib/actions/save', () => ({
  savePlaylist: async () => stubbed.outcome,
}));

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
        requests: 2,
        cacheHits: 0,
        artistsLookedUp: 5,
        genresAvailable: true,
      },
      requests: 2,
      mode: 'live' as const,
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

const live: Connection = {
  mode: 'live',
  cause: null,
  label: 'connected',
  notice: 'Connected to Spotify.',
  nextStep: null,
};

const ENCODED = (() => {
  const base = defaultRecipe(recipeId('rc-save'), 'Save test');
  return encodeRecipe({
    ...base,
    sources: [{ kind: 'library' }],
    shape: { ...base.shape, target: { kind: 'count', count: 8 }, maxPerArtist: 5 },
  });
})();

const QUOTA_SPENT = {
  kind: 'quotaExceeded',
  title: "This app's daily Spotify quota is spent",
  message: 'It resets, but not today. Retrying now cannot help, so nothing is retrying.',
  retry: 'never',
  retryAfterSeconds: null,
} as const;

const PARTIAL: SaveOutcome = {
  kind: 'partial',
  playlistId: 'pl-made-1',
  url: 'https://open.spotify.com/playlist/pl-made-1',
  added: 100,
  requested: 250,
  batches: 1,
  batchesPlanned: 3,
  error: QUOTA_SPENT,
  mode: 'live',
  requests: 3,
};

const FAILED: SaveOutcome = { kind: 'failed', error: QUOTA_SPENT };

const WRITTEN: SaveOutcome = {
  kind: 'written',
  playlistId: 'pl-made-1',
  url: 'https://open.spotify.com/playlist/pl-made-1',
  added: 250,
  batches: 3,
  coverUploaded: true,
  mode: 'live',
  requests: 5,
};

async function write(settle: RegExp): Promise<void> {
  const user = userEvent.setup();
  window.history.replaceState({}, '', `/?r=${ENCODED}`);
  render(<Frame connection={live} />);
  await screen.findAllByRole('button', { name: /^Lock Track/ }, { timeout: 3000 });
  await user.click(screen.getByRole('button', { name: 'Save to Spotify' }));
  await user.click(screen.getByRole('button', { name: 'Write it' }));
  await screen.findByText(settle, {}, { timeout: 3000 });
}

afterEach(() => {
  stubbed.outcome = null;
  window.history.replaceState({}, '', '/');
});

describe('a save that stopped partway', () => {
  beforeEach(() => {
    stubbed.outcome = PARTIAL;
  });

  it('says how far it got rather than that it failed', async () => {
    await write(/written, in 1 of 3 batches/);
    expect(screen.getByText(/100 of 250 tracks written, in 1 of 3 batches/)).toBeInTheDocument();
  });

  it('names the reason it stopped', async () => {
    await write(/written, in 1 of 3 batches/);
    expect(screen.getByText(/daily Spotify quota is spent/)).toBeInTheDocument();
  });

  it('offers the half-written playlist', async () => {
    await write(/written, in 1 of 3 batches/);
    expect(screen.getByRole('link', { name: 'Open it in Spotify' })).toHaveAttribute(
      'href',
      'https://open.spotify.com/playlist/pl-made-1',
    );
  });

  it('says the playlist was not thrown away', async () => {
    await write(/written, in 1 of 3 batches/);
    expect(screen.getByText(/Nothing was thrown away/)).toBeInTheDocument();
  });

  it('names what happens next', async () => {
    await write(/written, in 1 of 3 batches/);
    expect(screen.getByText(/saving again writes a second playlist/)).toBeInTheDocument();
  });
});

describe('a save that failed outright', () => {
  beforeEach(() => {
    stubbed.outcome = FAILED;
  });

  it('offers no link, because there is no playlist', async () => {
    await write(/daily Spotify quota is spent/);
    expect(screen.queryByRole('link', { name: 'Open it in Spotify' })).toBeNull();
  });
});

describe('a save that ran all the way through', () => {
  beforeEach(() => {
    stubbed.outcome = WRITTEN;
  });

  it('still says it was written', async () => {
    await write(/^Written\./);
    expect(screen.getByText(/250 tracks in 3 batches/)).toBeInTheDocument();
  });
});
