/**
 * The synthetic catalog behind `FakeSpotifyClient`.
 *
 * **Every artist, album and track name here is invented.** Nothing is scraped, nothing is
 * borrowed, and nothing presents itself as real Spotify content — CLAUDE.md's honesty
 * rules, and the reason demo mode can ship at all. The names are deliberately odd so that
 * nobody could mistake one for a band they have heard of.
 *
 * It is also the catalog a portfolio reviewer sees, so it is built to be worth looking at:
 * fifty acts across thirteen invented genres, three decades apart at the ends, real
 * collaborations, a plausible spread of durations and track positions, a scattering of
 * live and remaster suffixes so the `liveOrRemix` exclusion visibly does something — and a
 * kids-music cluster with a playlist built from it, so the headline exclusion (*never
 * anything off this playlist*, §2.3) can be demonstrated with no Spotify account at all.
 *
 * Generation is deterministic: one seeded generator, no `Math.random`, no clock. The same
 * catalog every run, in every environment, which is what lets Playwright assert on it.
 */

import type { AlbumId, ArtistId, PlaylistId, TopRange, TrackId } from '@pm/core';
import { albumId, artistId, playlistId, trackId } from '@pm/core';

/** Shown wherever demo data is. Demo mode says it is demo mode (§5.1). */
export const DEMO_NOTICE =
  'Demo mode. Every artist, album and track here is invented — none of it is real Spotify data.';

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type FixtureArtist = {
  readonly id: ArtistId;
  readonly name: string;
  readonly genres: readonly string[];
  /** Backs `tag:hipster`. Obscurity is applied at fetch, not at score (§3.5). */
  readonly hipster: boolean;
};

export type FixtureTrack = {
  readonly id: TrackId;
  readonly title: string;
  readonly artistIds: readonly ArtistId[];
  readonly durationMs: number;
  readonly explicit: boolean;
  readonly trackNumber: number;
};

/**
 * Spotify's album groups, which is what `CatalogDepth` filters on (§2.2.0). `appears_on`
 * is not stored — the fake works it out from guest credits, which is what it is.
 */
export const FIXTURE_ALBUM_GROUPS = ['album', 'single', 'compilation'] as const;
export type FixtureAlbumGroup = (typeof FIXTURE_ALBUM_GROUPS)[number];

export type FixtureAlbum = {
  readonly id: AlbumId;
  readonly title: string;
  readonly group: FixtureAlbumGroup;
  readonly artistIds: readonly ArtistId[];
  /** Kept at Spotify's three precisions so the mapper's parsing is exercised in demo too. */
  readonly releaseDate: string;
  readonly releaseYear: number;
  readonly hipster: boolean;
  /** Backs `tag:new`, which is how `newReleases` is implemented (§2.2). */
  readonly isNew: boolean;
  readonly tracks: readonly FixtureTrack[];
};

export type FixturePlaylist = {
  readonly id: PlaylistId;
  readonly name: string;
  readonly description: string;
  readonly trackIds: readonly TrackId[];
};

export type DemoCatalog = {
  readonly artists: readonly FixtureArtist[];
  readonly albums: readonly FixtureAlbum[];
  readonly playlists: readonly FixturePlaylist[];
  readonly savedTrackIds: readonly TrackId[];
  readonly topTrackIds: Readonly<Record<TopRange, readonly TrackId[]>>;
  readonly recentlyPlayedTrackIds: readonly TrackId[];
  readonly followedArtistIds: readonly ArtistId[];
  readonly user: { readonly id: string; readonly displayName: string };
};

// ---------------------------------------------------------------------------
// A generator with no ambient randomness
// ---------------------------------------------------------------------------

type Rng = {
  next(): number;
  int(maxExclusive: number): number;
  between(min: number, max: number): number;
  chance(probability: number): boolean;
};

/** A plain LCG. Deterministic, short, and nobody's cryptography depends on it. */
function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  return {
    next,
    int: (maxExclusive) => Math.floor(next() * Math.max(1, maxExclusive)),
    between: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (probability) => next() < probability,
  };
}

function pick<T>(rng: Rng, items: readonly [T, ...T[]]): T {
  return items[rng.int(items.length)] ?? items[0];
}

// ---------------------------------------------------------------------------
// Invented genres
// ---------------------------------------------------------------------------

export const DEMO_GENRES = [
  'glasshouse pop',
  'porch folk',
  'harbour dub',
  'cassette jazz',
  'brick funk',
  'gravel country',
  'sunroom ambient',
  'paper punk',
  'attic soul',
  'kettle techno',
  'lantern metal',
  'playground pop',
  'nursery folk',
] as const;

/** The kids cluster, which the demo's headline exclusion is built to shut out. §2.3 */
export const KIDS_GENRES = ['playground pop', 'nursery folk'] as const;

// ---------------------------------------------------------------------------
// The roster. Hand-written, so it reads like a scene rather than a seed dump.
// ---------------------------------------------------------------------------

type RosterEntry = {
  readonly name: string;
  readonly genre: (typeof DEMO_GENRES)[number];
  readonly secondGenre?: (typeof DEMO_GENRES)[number];
  readonly firstYear: number;
  readonly albums: number;
  readonly hipster: boolean;
};

const ROSTER: readonly RosterEntry[] = [
  { name: 'Velvet Kettle', genre: 'glasshouse pop', firstYear: 1972, albums: 4, hipster: false },
  { name: 'The Ostrich Parade', genre: 'paper punk', firstYear: 1978, albums: 3, hipster: false },
  {
    name: 'Marla Vane and the Housefires',
    genre: 'attic soul',
    secondGenre: 'brick funk',
    firstYear: 1969,
    albums: 4,
    hipster: false,
  },
  { name: 'Concrete Orchard', genre: 'brick funk', firstYear: 1974, albums: 3, hipster: false },
  { name: 'Hexagon Sunrise', genre: 'sunroom ambient', firstYear: 1981, albums: 3, hipster: true },
  { name: 'Bramblewire', genre: 'porch folk', firstYear: 1971, albums: 4, hipster: false },
  { name: 'Fenwick Drift', genre: 'cassette jazz', firstYear: 1968, albums: 5, hipster: false },
  {
    name: 'The Wire Fence Choir',
    genre: 'gravel country',
    firstYear: 1976,
    albums: 3,
    hipster: false,
  },
  { name: 'Nettle and Nail', genre: 'paper punk', firstYear: 1983, albums: 3, hipster: true },
  {
    name: 'Saltmarsh Sound System',
    genre: 'harbour dub',
    firstYear: 1979,
    albums: 4,
    hipster: false,
  },
  { name: 'Junction Twelve', genre: 'kettle techno', firstYear: 1990, albums: 4, hipster: false },
  { name: 'Plaster Saints', genre: 'lantern metal', firstYear: 1985, albums: 3, hipster: false },
  {
    name: 'Odile Pram',
    genre: 'glasshouse pop',
    secondGenre: 'sunroom ambient',
    firstYear: 1988,
    albums: 3,
    hipster: true,
  },
  { name: 'The Tin Verandah', genre: 'porch folk', firstYear: 1992, albums: 3, hipster: false },
  { name: 'Cormorant Bakery', genre: 'cassette jazz', firstYear: 1994, albums: 2, hipster: true },
  { name: 'Duster Fields', genre: 'gravel country', firstYear: 1986, albums: 4, hipster: false },
  { name: 'Halogen Aunt', genre: 'paper punk', firstYear: 1996, albums: 3, hipster: true },
  {
    name: 'The Moss Committee',
    genre: 'sunroom ambient',
    firstYear: 1998,
    albums: 3,
    hipster: false,
  },
  { name: 'Bellhop Sinclair', genre: 'attic soul', firstYear: 1991, albums: 3, hipster: false },
  {
    name: 'Pylon and Larch',
    genre: 'harbour dub',
    secondGenre: 'kettle techno',
    firstYear: 1993,
    albums: 3,
    hipster: true,
  },
  { name: 'Static Greenhouse', genre: 'kettle techno', firstYear: 1999, albums: 4, hipster: false },
  { name: 'Marrowbone Ferry', genre: 'lantern metal', firstYear: 1995, albums: 3, hipster: true },
  {
    name: 'The Paperweight Sea',
    genre: 'glasshouse pop',
    firstYear: 2001,
    albums: 3,
    hipster: false,
  },
  { name: 'Quilty Norton', genre: 'porch folk', firstYear: 2003, albums: 3, hipster: true },
  { name: 'Ambergris Motel', genre: 'cassette jazz', firstYear: 2005, albums: 3, hipster: false },
  {
    name: 'Threadbare Cousins',
    genre: 'gravel country',
    firstYear: 2000,
    albums: 4,
    hipster: false,
  },
  {
    name: 'Kitchen Fires',
    genre: 'brick funk',
    secondGenre: 'attic soul',
    firstYear: 2002,
    albums: 3,
    hipster: false,
  },
  { name: 'The Vinegar Hills', genre: 'paper punk', firstYear: 2007, albums: 3, hipster: true },
  {
    name: 'Lantern Pike Choir',
    genre: 'sunroom ambient',
    firstYear: 2009,
    albums: 2,
    hipster: true,
  },
  { name: 'Sable Ostrich', genre: 'attic soul', firstYear: 2004, albums: 3, hipster: false },
  { name: 'Toll Booth Prophets', genre: 'harbour dub', firstYear: 2006, albums: 3, hipster: false },
  { name: 'Neon Allotment', genre: 'kettle techno', firstYear: 2011, albums: 3, hipster: true },
  { name: 'Ferrous Wren', genre: 'lantern metal', firstYear: 2008, albums: 3, hipster: false },
  {
    name: 'Wednesday Aerials',
    genre: 'glasshouse pop',
    firstYear: 2013,
    albums: 3,
    hipster: false,
  },
  {
    name: 'The Rushlight Orchestra',
    genre: 'porch folk',
    secondGenre: 'cassette jazz',
    firstYear: 2015,
    albums: 3,
    hipster: true,
  },
  { name: 'Corduroy Atlas', genre: 'cassette jazz', firstYear: 2017, albums: 2, hipster: true },
  {
    name: 'Gantry and Foxglove',
    genre: 'gravel country',
    firstYear: 2012,
    albums: 3,
    hipster: false,
  },
  { name: 'Rubber Sermon', genre: 'brick funk', firstYear: 2014, albums: 3, hipster: false },
  { name: 'The Broadcast Ferns', genre: 'paper punk', firstYear: 2019, albums: 2, hipster: true },
  {
    name: 'Slow Weather Club',
    genre: 'sunroom ambient',
    firstYear: 2021,
    albums: 2,
    hipster: true,
  },
  { name: 'Ivory Grocer', genre: 'attic soul', firstYear: 2016, albums: 3, hipster: false },
  { name: 'Modem Harvest', genre: 'kettle techno', firstYear: 2023, albums: 2, hipster: true },
  { name: 'Copper Kestrel', genre: 'harbour dub', firstYear: 2018, albums: 3, hipster: false },
  { name: 'Anvil Meadow', genre: 'lantern metal', firstYear: 2020, albums: 2, hipster: false },
  {
    name: 'The Bathtime Band',
    genre: 'playground pop',
    firstYear: 2010,
    albums: 4,
    hipster: false,
  },
  { name: 'Captain Wiggle', genre: 'playground pop', firstYear: 2012, albums: 3, hipster: false },
  { name: 'Marmalade Mouse', genre: 'nursery folk', firstYear: 2009, albums: 3, hipster: false },
  {
    name: 'Dinosaur Breakfast',
    genre: 'playground pop',
    secondGenre: 'nursery folk',
    firstYear: 2015,
    albums: 3,
    hipster: false,
  },
  { name: 'The Wobbly Wheels', genre: 'nursery folk', firstYear: 2013, albums: 3, hipster: false },
  {
    name: 'Sock Puppet Symphony',
    genre: 'playground pop',
    firstYear: 2018,
    albums: 3,
    hipster: false,
  },
];

// ---------------------------------------------------------------------------
// Title vocabulary
// ---------------------------------------------------------------------------

const ADJECTIVES = [
  'Paper',
  'Copper',
  'Velvet',
  'Quiet',
  'Northern',
  'Hollow',
  'Amber',
  'Restless',
  'Iron',
  'Slow',
  'Bright',
  'Salt',
  'Winter',
  'Neon',
  'Marble',
  'Crooked',
  'Lantern',
  'Rust',
  'Glass',
  'Feather',
] as const;

const NOUNS = [
  'Harbour',
  'Kettle',
  'Orchard',
  'Ladder',
  'Signal',
  'Weather',
  'Postcard',
  'Engine',
  'Meadow',
  'Chorus',
  'Window',
  'Lighthouse',
  'Rooftop',
  'Cassette',
  'Bicycle',
  'Almanac',
  'Hallway',
  'Anchor',
  'Pocket',
  'Tide',
] as const;

const VERBS = [
  'Waiting on',
  'Counting',
  'Burning',
  'Leaving',
  'Holding',
  'Rewiring',
  'Painting',
  'Following',
] as const;

const KIDS_ADJECTIVES = [
  'Wiggly',
  'Bubbly',
  'Sleepy',
  'Giggly',
  'Bouncy',
  'Tiny',
  'Rainbow',
  'Muddy',
  'Snuggly',
  'Zippy',
] as const;

const KIDS_NOUNS = [
  'Song',
  'Dance',
  'Parade',
  'Train',
  'Party',
  'Boots',
  'Sandwich',
  'Nap',
  'Balloon',
  'Puddle',
] as const;

/**
 * Suffix markers, in the positions Spotify actually puts them (§3.4) — after a spaced
 * dash or inside brackets — so the `liveOrRemix` exclusion has real work to do in demo.
 */
const RELEASE_SUFFIXES = [
  ' - Live at the Foundry',
  ' - Live in Rotterdam',
  ' (Radio Edit)',
  ' - 2011 Remaster',
  ' - 2019 Remaster',
  ' (Instrumental)',
  ' - Karaoke Version',
  ' - Junction Twelve Remix',
] as const;

/**
 * Studio titles that carry a marker word nowhere near suffix position. They exist to keep
 * the demo honest about §3.4: a filter that deleted these would be worse than no filter.
 */
const DECOY_TITLES = [
  'Long Live the Hallway',
  'Live Wire Bakery',
  'The Remix Is a Rumour',
  'Instrumental Weather Report',
  'Live Oak County',
] as const;

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

const CATALOG_SEED = 0x504c4d45;
const LATEST_YEAR = 2026;

function albumTitle(rng: Rng): string {
  const shape = rng.int(4);
  if (shape === 0) return `${pick(rng, ADJECTIVES)} ${pick(rng, NOUNS)}`;
  if (shape === 1) return `The ${pick(rng, NOUNS)} Sessions`;
  if (shape === 2) return `${pick(rng, NOUNS)} and ${pick(rng, NOUNS)}`;
  return `${pick(rng, VERBS)} the ${pick(rng, NOUNS)}`;
}

function trackTitle(rng: Rng): string {
  const shape = rng.int(4);
  if (shape === 0) return `${pick(rng, ADJECTIVES)} ${pick(rng, NOUNS)}`;
  if (shape === 1) return `${pick(rng, VERBS)} ${pick(rng, NOUNS)}`;
  if (shape === 2) return `The ${pick(rng, ADJECTIVES)} ${pick(rng, NOUNS)}`;
  return `${pick(rng, NOUNS)} in ${pick(rng, ADJECTIVES)} ${pick(rng, NOUNS)}`;
}

function kidsAlbumTitle(rng: Rng): string {
  return rng.chance(0.5)
    ? `${pick(rng, KIDS_ADJECTIVES)} ${pick(rng, KIDS_NOUNS)}`
    : `Songs for a ${pick(rng, KIDS_ADJECTIVES)} Morning`;
}

function kidsTrackTitle(rng: Rng): string {
  return rng.chance(0.5)
    ? `${pick(rng, KIDS_ADJECTIVES)} ${pick(rng, KIDS_NOUNS)}`
    : `The ${pick(rng, KIDS_NOUNS)} ${pick(rng, KIDS_NOUNS)}`;
}

/** One of Spotify's three precisions, so demo data exercises all three. §2.2 */
function releaseDate(rng: Rng, year: number): string {
  const precision = rng.int(6);
  if (precision === 0) return String(year);
  const month = String(rng.between(1, 12)).padStart(2, '0');
  if (precision === 1) return `${year}-${month}`;
  return `${year}-${month}-${String(rng.between(1, 28)).padStart(2, '0')}`;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

function isKids(entry: RosterEntry): boolean {
  const kids: readonly string[] = KIDS_GENRES;
  return kids.includes(entry.genre);
}

export function buildDemoCatalog(): DemoCatalog {
  const rng = seededRng(CATALOG_SEED);

  const artists: FixtureArtist[] = ROSTER.map((entry, index) => ({
    id: artistId(`ar-${pad(index + 1, 3)}`),
    name: entry.name,
    genres: entry.secondGenre === undefined ? [entry.genre] : [entry.genre, entry.secondGenre],
    hipster: entry.hipster,
  }));

  const guestPool = artists.filter((_, index) => {
    const entry = ROSTER[index];
    return entry !== undefined && !isKids(entry);
  });

  const albums: FixtureAlbum[] = [];
  let albumCounter = 0;
  let trackCounter = 0;
  let decoyCounter = 0;

  const makeAlbum = (entry: RosterEntry, artist: FixtureArtist, year: number): FixtureAlbum => {
    const kids = isKids(entry);
    albumCounter += 1;
    const roll = rng.next();
    const group: FixtureAlbumGroup = roll < 0.62 ? 'album' : roll < 0.88 ? 'single' : 'compilation';
    const trackCount =
      group === 'single' ? rng.between(1, 3) : kids ? rng.between(8, 14) : rng.between(6, 12);

    const tracks: FixtureTrack[] = [];
    for (let position = 1; position <= trackCount; position += 1) {
      trackCounter += 1;

      // A guest credit on roughly one track in twelve: collaboration is the only
      // artist-similarity signal left (§2.2), so the demo has to actually contain some.
      // Guests come from the grown-up roster — a nursery act turning up on a metal record
      // would put kids music where the demo's headline exclusion cannot see it.
      const guest = guestPool[rng.int(guestPool.length)];
      const credits: ArtistId[] = [artist.id];
      if (!kids && rng.chance(0.08) && guest !== undefined && guest.id !== artist.id) {
        credits.push(guest.id);
      }

      const base = kids ? kidsTrackTitle(rng) : trackTitle(rng);
      const decoy = !kids && rng.chance(0.02);
      const marked = !kids && !decoy && rng.chance(0.09);
      const title = decoy
        ? (DECOY_TITLES[decoyCounter++ % DECOY_TITLES.length] ?? base)
        : marked
          ? `${base}${pick(rng, RELEASE_SUFFIXES)}`
          : base;

      tracks.push({
        id: trackId(`tr-${pad(trackCounter, 5)}`),
        title,
        artistIds: credits,
        durationMs: kids ? rng.between(58, 155) * 1000 : rng.between(96, 486) * 1000,
        explicit: !kids && rng.chance(0.11),
        trackNumber: position,
      });
    }

    return {
      id: albumId(`al-${pad(albumCounter, 4)}`),
      title: kids ? kidsAlbumTitle(rng) : albumTitle(rng),
      group,
      artistIds: [artist.id],
      releaseDate: releaseDate(rng, year),
      releaseYear: year,
      hipster: entry.hipster,
      isNew: year >= LATEST_YEAR - 1,
      tracks,
    };
  };

  ROSTER.forEach((entry, artistIndex) => {
    const artist = artists[artistIndex];
    if (artist === undefined) return;

    for (let release = 0; release < entry.albums; release += 1) {
      albums.push(
        makeAlbum(
          entry,
          artist,
          Math.min(LATEST_YEAR, entry.firstYear + release * rng.between(2, 5)),
        ),
      );
    }

    // Anyone still working gets a record out in the last two years, so `tag:new` has a
    // shelf worth searching rather than a curiosity.
    if (entry.firstYear >= 2010) {
      albums.push(makeAlbum(entry, artist, rng.chance(0.5) ? LATEST_YEAR : LATEST_YEAR - 1));
    }
  });

  const allTracks = albums.flatMap((album) => album.tracks);
  const kidsArtistIds = new Set(
    ROSTER.flatMap((entry, index) => {
      const artist = artists[index];
      return isKids(entry) && artist !== undefined ? [artist.id] : [];
    }),
  );

  const kidsTracks = allTracks.filter((track) =>
    track.artistIds.some((id) => kidsArtistIds.has(id)),
  );
  const grownTracks = allTracks.filter(
    (track) => !track.artistIds.some((id) => kidsArtistIds.has(id)),
  );

  const everyNth = <T>(items: readonly T[], step: number, count: number): readonly T[] => {
    const out: T[] = [];
    for (let i = 0; i < items.length && out.length < count; i += step) {
      const item = items[i];
      if (item !== undefined) out.push(item);
    }
    return out;
  };

  const playlists: FixturePlaylist[] = [
    {
      id: playlistId('pl-kids-jams'),
      name: 'Kids Jams (demo)',
      description:
        'The playlist the app exists to exclude: half a listening history, none of it chosen.',
      trackIds: everyNth(kidsTracks, 2, 40).map((track) => track.id),
    },
    {
      id: playlistId('pl-late-shift'),
      name: 'Late Shift (demo)',
      description: 'Long nights, invented bands.',
      trackIds: everyNth(grownTracks, 17, 28).map((track) => track.id),
    },
    {
      id: playlistId('pl-road-salt'),
      name: 'Road Salt (demo)',
      description: 'Winter driving, invented bands.',
      trackIds: everyNth(grownTracks, 23, 24).map((track) => track.id),
    },
  ];

  // A listening history that looks like the problem the app solves: a big pile of grown-up
  // music with a seam of kids music running right through it (§1.1).
  const savedTrackIds = [
    ...everyNth(grownTracks, 11, 90).map((track) => track.id),
    ...everyNth(kidsTracks, 5, 20).map((track) => track.id),
  ];

  const topTrackIds: Record<TopRange, readonly TrackId[]> = {
    shortTerm: [
      ...everyNth(kidsTracks, 3, 14).map((track) => track.id),
      ...everyNth(grownTracks, 41, 16).map((track) => track.id),
    ],
    mediumTerm: everyNth(grownTracks, 29, 30).map((track) => track.id),
    longTerm: everyNth(grownTracks, 37, 30).map((track) => track.id),
  };

  return {
    artists,
    albums,
    playlists,
    savedTrackIds,
    topTrackIds,
    recentlyPlayedTrackIds: everyNth(allTracks, 53, 25).map((track) => track.id),
    followedArtistIds: everyNth(artists, 4, 12).map((artist) => artist.id),
    user: { id: 'demo-user', displayName: 'Demo Listener' },
  };
}

/** Built once, at module load, from a fixed seed. No clock, no ambient randomness. */
export const demoCatalog: DemoCatalog = buildDemoCatalog();

/** The playlist behind the demo of the headline exclusion. §2.3 */
export const KIDS_PLAYLIST_ID: PlaylistId = playlistId('pl-kids-jams');
