import { describe, expect, it } from 'vitest';

import { createMemoryCache, memoryCacheFactory, nullCacheFactory } from '../src/index';

describe('createMemoryCache', () => {
  it('returns what was put in', () => {
    const cache = createMemoryCache<number>();
    cache.set('ar-1', 4);
    expect(cache.get('ar-1')).toBe(4);
  });

  it('returns undefined for a key it never saw', () => {
    expect(createMemoryCache<number>().get('ar-1')).toBeUndefined();
  });

  it('reports membership', () => {
    const cache = createMemoryCache<string>();
    cache.set('al-1', 'Neon Tide');
    expect(cache.has('al-1')).toBe(true);
  });

  it('overwrites an existing key', () => {
    const cache = createMemoryCache<string>();
    cache.set('al-1', 'first');
    cache.set('al-1', 'second');
    expect(cache.get('al-1')).toBe('second');
  });

  it('deletes', () => {
    const cache = createMemoryCache<string>();
    cache.set('al-1', 'Neon Tide');
    cache.delete('al-1');
    expect(cache.has('al-1')).toBe(false);
  });

  it('clears', () => {
    const cache = createMemoryCache<string>();
    cache.set('al-1', 'Neon Tide');
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('counts what it holds', () => {
    const cache = createMemoryCache<string>();
    cache.set('al-1', 'one');
    cache.set('al-2', 'two');
    expect(cache.size).toBe(2);
  });
});

describe('memoryCacheFactory', () => {
  it('hands out a working cache', () => {
    const cache = memoryCacheFactory()<number>('artists');
    cache.set('ar-1', 9);
    expect(cache.get('ar-1')).toBe(9);
  });

  it('keeps named stores apart', () => {
    const factory = memoryCacheFactory();
    const artists = factory<number>('artists');
    const albums = factory<number>('albums');
    artists.set('shared-key', 1);
    expect(albums.get('shared-key')).toBeUndefined();
  });
});

describe('nullCacheFactory', () => {
  it('forgets everything immediately', () => {
    const cache = nullCacheFactory()<number>('artists');
    cache.set('ar-1', 9);
    expect(cache.get('ar-1')).toBeUndefined();
  });

  it('holds nothing', () => {
    expect(nullCacheFactory()<number>('artists').size).toBe(0);
  });
});
