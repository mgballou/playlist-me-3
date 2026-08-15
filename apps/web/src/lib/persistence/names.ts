/**
 * Human names for the ids a recipe holds.
 *
 * A `Recipe` is data and only data (CLAUDE.md), so it carries an `ArtistId` and never an
 * artist's name — which is right, and which would leave the bench showing `ar-17` after a
 * reload. This is the small side table that fixes that: id to name, written when a picker
 * resolves one, read when a row renders.
 *
 * It is **presentation only**. Nothing reads it to decide anything, a missing entry falls
 * back to the id, and it is deliberately not part of the encoded recipe — a shared link
 * carries intent, and the person opening it resolves the names against their own Spotify.
 */

import { z } from 'zod';

import type { KeyValueStore } from './store';

export const NAMES_KEY = 'names';

/** Enough for every id a recipe could plausibly name, and bounded so it cannot grow forever. */
const MAX_NAMES = 500;

const namesSchema = z.record(z.string(), z.string());

export async function loadNames(store: KeyValueStore): Promise<ReadonlyMap<string, string>> {
  const parsed = namesSchema.safeParse(await store.read(NAMES_KEY));
  return parsed.success ? new Map(Object.entries(parsed.data)) : new Map();
}

export async function saveNames(
  store: KeyValueStore,
  names: ReadonlyMap<string, string>,
): Promise<void> {
  const entries = [...names.entries()].slice(-MAX_NAMES);
  await store.write(NAMES_KEY, Object.fromEntries(entries));
}
