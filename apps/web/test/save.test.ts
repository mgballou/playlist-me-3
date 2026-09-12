import type { TrackId } from '@pm/core';
import { playlistId, trackId } from '@pm/core';
import type { AddTracksInput, RequestOptions } from '@pm/spotify';
import { FakeSpotifyClient, QuotaExceeded } from '@pm/spotify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { savePlaylist } from '@/lib/actions/save';
import type { SpotifyHandle } from '@/lib/spotify/factory';
import type { SaveOutcome, SaveRequest } from '@/lib/workbench/save';

const held = vi.hoisted(() => {
  const state: { handle: SpotifyHandle | null } = { handle: null };
  return state;
});

vi.mock('@/lib/spotify/server', () => ({
  getSpotifyHandle: () => Promise.resolve(held.handle),
}));

const TRACK_TOTAL = 250;

function trackIds(count: number): readonly TrackId[] {
  return Array.from({ length: count }, (_, index) => trackId(`tr-save-${String(index)}`));
}

function saveRequest(count: number): SaveRequest {
  return {
    name: 'A long one',
    description: 'Built by a test.',
    trackIds: trackIds(count),
    isPublic: false,
    coverBase64: 'Zm9v',
  };
}

/**
 * The fake never fails, by design — it is what backs demo mode. This is the smallest stub
 * that reaches the state the hostile read found: the create call goes through, batch one
 * goes through, and batch two is refused for good.
 */
class FailsOnBatchTwo extends FakeSpotifyClient {
  private attempts = 0;

  override async addPlaylistTracks(input: AddTracksInput, options?: RequestOptions): Promise<void> {
    this.attempts += 1;
    if (this.attempts === 2) throw QuotaExceeded.developerQuota();
    return super.addPlaylistTracks(input, options);
  }
}

function partial(outcome: SaveOutcome): Extract<SaveOutcome, { kind: 'partial' }> {
  if (outcome.kind !== 'partial') {
    throw new Error(`expected a partial outcome, got ${outcome.kind}`);
  }
  return outcome;
}

describe('a save refused on batch two of three', () => {
  let client: FailsOnBatchTwo;

  beforeEach(() => {
    client = new FailsOnBatchTwo();
    held.handle = { mode: 'live', client };
  });

  it('does not report a plain failure over a playlist that exists', async () => {
    const outcome = await savePlaylist(saveRequest(TRACK_TOTAL));
    expect(outcome.kind).toBe('partial');
  });

  it('hands back the id of the playlist it left behind', async () => {
    const outcome = partial(await savePlaylist(saveRequest(TRACK_TOTAL)));
    expect(outcome.playlistId).toBe('pl-made-1');
  });

  it('hands back a link to it', async () => {
    const outcome = partial(await savePlaylist(saveRequest(TRACK_TOTAL)));
    expect(outcome.url).toBe('https://open.spotify.com/playlist/pl-made-1');
  });

  it('says how many tracks went in', async () => {
    const outcome = partial(await savePlaylist(saveRequest(TRACK_TOTAL)));
    expect(outcome.added).toBe(100);
  });

  it('says how many were asked for', async () => {
    const outcome = partial(await savePlaylist(saveRequest(TRACK_TOTAL)));
    expect(outcome.requested).toBe(TRACK_TOTAL);
  });

  it('says how many batches went through', async () => {
    const outcome = partial(await savePlaylist(saveRequest(TRACK_TOTAL)));
    expect(outcome.batches).toBe(1);
  });

  it('says how many batches the write was going to take', async () => {
    const outcome = partial(await savePlaylist(saveRequest(TRACK_TOTAL)));
    expect(outcome.batchesPlanned).toBe(3);
  });

  it('carries the reason it stopped', async () => {
    const outcome = partial(await savePlaylist(saveRequest(TRACK_TOTAL)));
    expect(outcome.error.kind).toBe('quotaExceeded');
  });

  it('leaves the half-written playlist where it is', async () => {
    const outcome = partial(await savePlaylist(saveRequest(TRACK_TOTAL)));
    expect(client.playlistContents(playlistId(outcome.playlistId))).toHaveLength(100);
  });

  it('does not try the third batch after the second is refused', async () => {
    await savePlaylist(saveRequest(TRACK_TOTAL));
    expect(client.calls.filter((call) => call.method === 'addPlaylistTracks')).toHaveLength(1);
  });

  it('does not spend a request on a cover for an unfinished playlist', async () => {
    await savePlaylist(saveRequest(TRACK_TOTAL));
    expect(client.calls.filter((call) => call.method === 'uploadPlaylistCover')).toHaveLength(0);
  });

  it('counts the requests it did spend', async () => {
    const outcome = partial(await savePlaylist(saveRequest(TRACK_TOTAL)));
    expect(outcome.requests).toBe(2);
  });

  it('offers no link in demo mode, where the id names nothing', async () => {
    held.handle = { mode: 'demo', cause: 'notConfigured', reasons: [], client };
    const outcome = partial(await savePlaylist(saveRequest(TRACK_TOTAL)));
    expect(outcome.url).toBeNull();
  });
});

describe('a save that runs all the way through', () => {
  beforeEach(() => {
    held.handle = { mode: 'live', client: new FakeSpotifyClient() };
  });

  it('still reports a written playlist', async () => {
    const outcome = await savePlaylist(saveRequest(TRACK_TOTAL));
    expect(outcome.kind).toBe('written');
  });

  it('still counts every track', async () => {
    const outcome = await savePlaylist(saveRequest(TRACK_TOTAL));
    expect(outcome.kind === 'written' ? outcome.added : 0).toBe(TRACK_TOTAL);
  });

  it('still counts every batch', async () => {
    const outcome = await savePlaylist(saveRequest(TRACK_TOTAL));
    expect(outcome.kind === 'written' ? outcome.batches : 0).toBe(3);
  });
});
