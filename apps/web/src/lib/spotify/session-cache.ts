/**
 * Where the person's reads are kept between server actions.
 *
 * `cache.ts` in `@pm/spotify` promised this from the start — the cache is an interface "so
 * the web app can hand in one backed by storage that survives a reload". The web app never
 * did, so every server action built a client with an empty store and read the whole person
 * again. This module is the web app finally handing one in.
 *
 * **The key is the session id, and nothing else.** Two people must never see one store, so
 * the store is chosen by `Session.sid` — a random label minted at login, not a token, not a
 * Spotify user id, not anything derived from either. A cookie old enough to carry no id gets
 * no shared store at all, which is the behavior this app had until now.
 *
 * **It lives in this process and it forgets.** A restart empties it and nothing is written to
 * disk, so no token and no library outlives the server. Inside one process an entry is
 * dropped `SESSION_CACHE_TTL_MS` after its last use, and at most `MAX_CACHED_SESSIONS` are
 * held — the least recently used goes first. Both numbers bound memory rather than
 * correctness: forgetting early costs a read, and that is all it costs.
 *
 * There is no timer. Expiry is swept on the next look, so an idle process holds nothing open
 * and a test can drive the clock itself.
 */

import type { CacheFactory, EntityCache } from '@pm/spotify';
import { createMemoryCache } from '@pm/spotify';

/**
 * Fifteen minutes of not being used. Long enough to cover a sitting at the bench — the
 * session's worth of edits this exists to make cheap — and short enough that a track saved on
 * a phone shows up in familiarity without a sign-out.
 */
export const SESSION_CACHE_TTL_MS = 15 * 60_000;

/**
 * Twenty people at once. A full set of reads for one person is a few hundred kilobytes of
 * tracks; twenty is a few megabytes, which is a number worth naming rather than discovering.
 */
export const MAX_CACHED_SESSIONS = 20;

export type SessionCaches = {
  /**
   * The named stores belonging to one session, or `undefined` when there is no session to
   * key them to — in which case the caller gets the per-request behavior it always had.
   */
  forSession(sid: string | null): CacheFactory | undefined;
  /** How many sessions are held. Tests read it; nothing else should. */
  readonly size: number;
};

type Entry = {
  /**
   * Name to store. The value type follows the name at every call site and cannot be written
   * down here, which is the one place this file needs a cast.
   */
  readonly stores: Map<string, unknown>;
  usedAt: number;
};

export type SessionCachesOptions = {
  readonly now?: (() => number) | undefined;
  readonly ttlMs?: number | undefined;
  readonly maxSessions?: number | undefined;
};

/**
 * A factory over one session's stores. It hands back **the same store for the same name**,
 * which is where it differs from `memoryCacheFactory`: that one is claimed once by one
 * client, and this one is claimed again by every client the session builds.
 */
function factoryOver(stores: Map<string, unknown>): CacheFactory {
  return <T>(name: string): EntityCache<T> => {
    const held = stores.get(name);
    // The name decides the type at the only places these are claimed — the client's
    // constructor and `CachedSpotifyClient`'s — and no signature can say so for a map.
    if (held !== undefined) return held as EntityCache<T>;
    const made = createMemoryCache<T>();
    stores.set(name, made);
    return made;
  };
}

export function createSessionCaches(options: SessionCachesOptions = {}): SessionCaches {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? SESSION_CACHE_TTL_MS;
  const maxSessions = options.maxSessions ?? MAX_CACHED_SESSIONS;
  const sessions = new Map<string, Entry>();

  function sweep(at: number): void {
    for (const [sid, entry] of sessions) {
      if (at - entry.usedAt >= ttlMs) sessions.delete(sid);
    }
  }

  /** Insertion order is use order, because a used entry is re-inserted at the end. */
  function evictOldest(): void {
    while (sessions.size > maxSessions) {
      const oldest = sessions.keys().next();
      if (oldest.done === true) return;
      sessions.delete(oldest.value);
    }
  }

  return {
    forSession(sid) {
      if (sid === null) return undefined;

      const at = now();
      sweep(at);

      const held = sessions.get(sid);
      const entry: Entry = held ?? { stores: new Map<string, unknown>(), usedAt: at };
      entry.usedAt = at;
      sessions.delete(sid);
      sessions.set(sid, entry);
      evictOldest();

      return factoryOver(entry.stores);
    },
    get size() {
      return sessions.size;
    },
  };
}

/**
 * The one the app uses. A module-level value is process-wide by construction, which is the
 * point — it is what outlives a server action. Every test builds its own instead.
 */
export const sessionCaches = createSessionCaches();
