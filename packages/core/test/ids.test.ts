import { describe, expect, it } from 'vitest';

import {
  InvalidId,
  albumId,
  artistId,
  isAlbumId,
  isArtistId,
  isPlaylistId,
  isRecipeId,
  isTrackId,
  playlistId,
  recipeId,
  trackId,
} from '../src/index';
import { captureError } from './fixtures/index';

describe('id constructors', () => {
  it('keeps the underlying string', () => {
    expect(trackId('tr-001')).toBe('tr-001');
  });

  it('rejects a blank track id', () => {
    expect(captureError(() => trackId('   '))).toBeInstanceOf(InvalidId);
  });

  it('rejects a non-string artist id', () => {
    expect(captureError(() => artistId(7))).toBeInstanceOf(InvalidId);
  });

  it('names the id kind on the error', () => {
    expect(InvalidId.empty('AlbumId').idKind).toBe('AlbumId');
  });

  it('rejects an empty album id', () => {
    expect(captureError(() => albumId(''))).toBeInstanceOf(InvalidId);
  });

  it('rejects an empty playlist id', () => {
    expect(captureError(() => playlistId(''))).toBeInstanceOf(InvalidId);
  });

  it('rejects an empty recipe id', () => {
    expect(captureError(() => recipeId(''))).toBeInstanceOf(InvalidId);
  });

  it('carries a stable code', () => {
    expect(InvalidId.empty('TrackId').code).toBe('invalidId');
  });
});

describe('id guards', () => {
  it('accepts a usable track id', () => {
    expect(isTrackId('tr-001')).toBe(true);
  });

  it('refuses a blank string', () => {
    expect(isTrackId('  ')).toBe(false);
  });

  it('refuses a number', () => {
    expect(isArtistId(1)).toBe(false);
  });

  it('refuses null', () => {
    expect(isAlbumId(null)).toBe(false);
  });

  it('accepts a usable playlist id', () => {
    expect(isPlaylistId('pl-kids')).toBe(true);
  });

  it('accepts a usable recipe id', () => {
    expect(isRecipeId('rc-1')).toBe(true);
  });
});
