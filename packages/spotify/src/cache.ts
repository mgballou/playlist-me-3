/**
 * Caching by entity id. Spec §5.2: artists and albums change rarely and the batch forms
 * that made them cheap are gone, so the same artist fetched forty times during one build
 * should cost one request.
 *
 * The cache is an interface with an in-memory default so the web app can hand in one
 * backed by storage that survives a reload without this package knowing about the DOM.
 * It is generic per entity rather than a bag of `unknown`, which keeps every read typed
 * without a cast.
 */

export type EntityCache<T> = {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  has(key: string): boolean;
  delete(key: string): void;
  clear(): void;
  readonly size: number;
};

/** Named so a persistent implementation can keep artists and albums in separate stores. */
export type CacheFactory = <T>(name: string) => EntityCache<T>;

export function createMemoryCache<T>(): EntityCache<T> {
  const store = new Map<string, T>();
  return {
    get: (key) => store.get(key),
    set: (key, value) => {
      store.set(key, value);
    },
    has: (key) => store.has(key),
    delete: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    get size() {
      return store.size;
    },
  };
}

/**
 * The default factory: a fresh in-memory store per name, for the life of the client.
 *
 * Each store is claimed once, at construction, which is why the factory hands back a new
 * one every call rather than memoizing by name — memoizing would need a heterogeneous map
 * and therefore a cast, to solve a problem nobody has.
 */
export function memoryCacheFactory(): CacheFactory {
  return <T>(): EntityCache<T> => createMemoryCache<T>();
}

/** A factory that keeps nothing, for tests that want every call to reach the client. */
export function nullCacheFactory(): CacheFactory {
  return <T>(): EntityCache<T> => ({
    get: () => undefined,
    set: () => undefined,
    has: () => false,
    delete: () => undefined,
    clear: () => undefined,
    size: 0,
  });
}
