import { describe, expect, it } from 'vitest';

import { emptyContext, poolSize, totalDurationMs } from '../src/index';
import { makePool, makeTrack } from './fixtures/index';

describe('emptyContext', () => {
  it('knows no saved tracks', () => {
    expect(emptyContext().libraryTrackIds.size).toBe(0);
  });

  it('knows no top tracks', () => {
    expect(emptyContext().topTrackIds.size).toBe(0);
  });

  it('knows no listening history', () => {
    expect(emptyContext().recentlyHeardTrackIds.size).toBe(0);
  });

  it('knows no followed artists', () => {
    expect(emptyContext().followedArtistIds.size).toBe(0);
  });

  it('knows no playlists', () => {
    expect(emptyContext().playlistTrackIds.size).toBe(0);
  });
});

describe('poolSize', () => {
  it('counts the pool', () => {
    expect(poolSize(makePool())).toBe(80);
  });

  it('counts an empty pool', () => {
    expect(poolSize([])).toBe(0);
  });
});

describe('totalDurationMs', () => {
  it('adds the durations', () => {
    const tracks = [makeTrack({ durationMs: 1000 }), makeTrack({ durationMs: 2500 })];
    expect(totalDurationMs(tracks)).toBe(3500);
  });

  it('is zero for nothing', () => {
    expect(totalDurationMs([])).toBe(0);
  });
});
