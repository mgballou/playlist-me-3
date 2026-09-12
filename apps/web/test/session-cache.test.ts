// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { SESSION_CACHE_TTL_MS, createSessionCaches } from '@/lib/spotify/session-cache';

const NOW = 1_770_000_000_000;

function clock(start = NOW): { readonly now: () => number; advance: (ms: number) => void } {
  let at = start;
  return {
    now: () => at,
    advance: (ms) => {
      at += ms;
    },
  };
}

describe('one store per session', () => {
  it('hands the same store back to the next client', () => {
    const caches = createSessionCaches({ now: () => NOW });
    caches.forSession('a')?.<number>('savedTracks').set('me:200', 7);

    expect(caches.forSession('a')?.<number>('savedTracks').get('me:200')).toBe(7);
  });

  it('keeps named stores apart inside one session', () => {
    const caches = createSessionCaches({ now: () => NOW });
    const factory = caches.forSession('a');
    factory?.<number>('savedTracks').set('shared', 1);

    expect(factory?.<number>('topTracks').get('shared')).toBeUndefined();
  });

  it('never shows one person another person’s read', () => {
    const caches = createSessionCaches({ now: () => NOW });
    caches.forSession('a')?.<number>('savedTracks').set('me:200', 7);

    expect(caches.forSession('b')?.<number>('savedTracks').get('me:200')).toBeUndefined();
  });

  it('holds both people at once', () => {
    const caches = createSessionCaches({ now: () => NOW });
    caches.forSession('a');
    caches.forSession('b');

    expect(caches.size).toBe(2);
  });

  it('gives a cookie with no id no store at all', () => {
    const caches = createSessionCaches({ now: () => NOW });

    expect(caches.forSession(null)).toBeUndefined();
  });

  it('holds nothing for a cookie with no id', () => {
    const caches = createSessionCaches({ now: () => NOW });
    caches.forSession(null);

    expect(caches.size).toBe(0);
  });
});

describe('forgetting', () => {
  it('drops a session that has sat unused', () => {
    const time = clock();
    const caches = createSessionCaches({ now: time.now });
    caches.forSession('a')?.<number>('savedTracks').set('me:200', 7);

    time.advance(SESSION_CACHE_TTL_MS);

    expect(caches.forSession('a')?.<number>('savedTracks').get('me:200')).toBeUndefined();
  });

  it('keeps a session that is still being used', () => {
    const time = clock();
    const caches = createSessionCaches({ now: time.now });
    caches.forSession('a')?.<number>('savedTracks').set('me:200', 7);

    time.advance(SESSION_CACHE_TTL_MS - 1);
    caches.forSession('a');
    time.advance(SESSION_CACHE_TTL_MS - 1);

    expect(caches.forSession('a')?.<number>('savedTracks').get('me:200')).toBe(7);
  });

  it('holds no more sessions than it says it will', () => {
    const caches = createSessionCaches({ now: () => NOW, maxSessions: 2 });
    caches.forSession('a');
    caches.forSession('b');
    caches.forSession('c');

    expect(caches.size).toBe(2);
  });

  it('drops the least recently used first', () => {
    const caches = createSessionCaches({ now: () => NOW, maxSessions: 2 });
    caches.forSession('a')?.<number>('savedTracks').set('me:200', 7);
    caches.forSession('b');
    caches.forSession('a');
    caches.forSession('c');

    expect(caches.forSession('a')?.<number>('savedTracks').get('me:200')).toBe(7);
  });

  it('drops what it evicted', () => {
    const caches = createSessionCaches({ now: () => NOW, maxSessions: 2 });
    caches.forSession('a');
    caches.forSession('b')?.<number>('savedTracks').set('me:200', 7);
    caches.forSession('a');
    caches.forSession('c');

    expect(caches.forSession('b')?.<number>('savedTracks').get('me:200')).toBeUndefined();
  });
});
