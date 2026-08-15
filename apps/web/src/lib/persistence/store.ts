/**
 * The narrow storage the app needs. Spec §6: **no database.** Recipes live in IndexedDB,
 * export as JSON, and encode into a URL.
 *
 * IndexedDB is behind an interface for one reason worth the indirection: everything above it
 * — what a saved recipe is, how a place is kept, how the codec round-trips — is then
 * testable without a browser, and the browser store is left with nothing in it but the
 * `open`/`get`/`put` dance.
 */

import { StorageFailed } from '../errors/app';

export type KeyValueStore = {
  read(key: string): Promise<unknown>;
  write(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<readonly string[]>;
};

export const DATABASE_NAME = 'playlist-me';
export const DATABASE_VERSION = 1;
export const OBJECT_STORE = 'kv';

export function memoryStore(seed: ReadonlyMap<string, unknown> = new Map()): KeyValueStore {
  const entries = new Map<string, unknown>(seed);
  return {
    async read(key) {
      return entries.get(key) ?? null;
    },
    async write(key, value) {
      entries.set(key, value);
    },
    async remove(key) {
      entries.delete(key);
    },
    async keys() {
      return [...entries.keys()];
    },
  };
}

function promised<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(StorageFailed.request(request.error?.message ?? 'unknown'));
    };
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(OBJECT_STORE)) {
        request.result.createObjectStore(OBJECT_STORE);
      }
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(StorageFailed.open());
    };
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  try {
    return await promised(run(database.transaction(OBJECT_STORE, mode).objectStore(OBJECT_STORE)));
  } finally {
    database.close();
  }
}

/** Only ever constructed in the browser. `isStorageAvailable` is the guard. */
export function indexedDbStore(): KeyValueStore {
  return {
    async read(key) {
      return withStore<unknown>('readonly', (store) => store.get(key));
    },
    async write(key, value) {
      await withStore('readwrite', (store) => store.put(value, key));
    },
    async remove(key) {
      await withStore('readwrite', (store) => store.delete(key));
    },
    async keys() {
      const found = await withStore<IDBValidKey[]>('readonly', (store) => store.getAllKeys());
      return found.filter((key): key is string => typeof key === 'string');
    },
  };
}

export function isStorageAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

/**
 * The browser store where there is one, and an in-memory store where there is not — a
 * private window with storage refused still runs the app, it just forgets on reload.
 */
export function browserStore(): KeyValueStore {
  return isStorageAvailable() ? indexedDbStore() : memoryStore();
}
