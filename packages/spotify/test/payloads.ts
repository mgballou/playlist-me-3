/** Hand-written wire payloads, shaped like Spotify's and invented like everything else. */

type Json = Record<string, unknown>;

export function artistPayload(overrides: Json = {}): Json {
  return { id: 'ar-101', name: 'Velvet Kettle', genres: ['glasshouse pop'], ...overrides };
}

export function albumPayload(overrides: Json = {}): Json {
  return {
    id: 'al-201',
    name: 'Neon Tide',
    release_date: '1974-03-11',
    release_date_precision: 'day',
    total_tracks: 9,
    artists: [{ id: 'ar-101', name: 'Velvet Kettle' }],
    ...overrides,
  };
}

export function simplifiedTrackPayload(overrides: Json = {}): Json {
  return {
    id: 'tr-301',
    name: 'Copper Hallway',
    artists: [{ id: 'ar-101', name: 'Velvet Kettle' }],
    duration_ms: 214_000,
    explicit: false,
    track_number: 4,
    disc_number: 1,
    ...overrides,
  };
}

export function trackPayload(overrides: Json = {}): Json {
  return { ...simplifiedTrackPayload(), album: albumPayload(), ...overrides };
}

export function userPlaylistPayload(overrides: Json = {}): Json {
  return { id: 'pl-401', name: 'Kids Jams', tracks: { total: 40 }, ...overrides };
}

/** `items` takes nulls because playlist pages carry them — a deleted entry, a dead list. */
export function pagePayload(items: readonly (Json | null)[], overrides: Json = {}): Json {
  return { items, limit: 20, offset: 0, total: items.length, next: null, ...overrides };
}
