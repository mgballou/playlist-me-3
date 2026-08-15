/**
 * The one boundary where `unknown` becomes typed. CLAUDE.md: zod validates every external
 * response here, once; nothing downstream re-checks shapes.
 *
 * Two rules govern what is required and what is optional:
 *
 * 1. **We only describe fields we consume.** `popularity`, `followers`,
 *    `available_markets`, `preview_url` and `external_ids` are gone or going for
 *    development-mode apps (§1.2), so nothing here reads them and no schema names them.
 *    Unknown keys are stripped rather than rejected, so a field returning or vanishing
 *    cannot break a parse.
 * 2. **`artist.genres` is optional and may be empty.** Spotify marks it deprecated
 *    (§3.5.1) and already returns `[]` for an unclassified artist, so the empty array is
 *    the normal case. It defaults to `[]` rather than failing, which is what lets
 *    coherence scoring degrade to source provenance the day the field disappears.
 */

import type { ZodType, infer as Infer } from 'zod';
import { z } from 'zod';

import { MalformedResponse } from './errors';

/**
 * Validates one response body. The only entry point — a raw `ZodError` never escapes
 * this module, because callers cannot do anything useful with one.
 */
export function parseResponse<S extends ZodType>(
  schema: S,
  value: unknown,
  endpoint: string,
): Infer<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  const issue = result.error.issues[0];
  const path = issue === undefined ? '' : issue.path.map((part) => String(part)).join('.');
  throw MalformedResponse.at(endpoint, path);
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

const id = z.string().min(1);

/** The artist stub carried on a track or an album. Never carries genres. */
export const artistRefSchema = z.object({
  id,
  name: z.string(),
});

/**
 * `GET /artists/{id}`. `genres` is optional twice over: absent for a deprecation that has
 * already been announced, and empty for an artist Spotify has not classified. §3.5.1
 */
export const artistSchema = z.object({
  id,
  name: z.string(),
  genres: z.array(z.string()).optional().default([]),
});

/**
 * `release_date` arrives at one of three precisions, which `release_date_precision`
 * names but does not guarantee. `map.ts` reads the year off the string itself.
 */
export const albumSchema = z.object({
  id,
  name: z.string(),
  release_date: z.string(),
  release_date_precision: z.enum(['year', 'month', 'day']).optional(),
  total_tracks: z.number().int().nonnegative(),
  artists: z.array(artistRefSchema),
  album_type: z.string().optional(),
  album_group: z.string().optional(),
});

/**
 * A track as `GET /albums/{id}/tracks` returns it: no album object and no release date,
 * because both are the album's. Mapping one needs the album alongside it.
 */
export const simplifiedTrackSchema = z.object({
  id,
  name: z.string(),
  artists: z.array(artistRefSchema),
  duration_ms: z.number().int().nonnegative(),
  explicit: z.boolean(),
  track_number: z.number().int().positive(),
  disc_number: z.number().int().positive().optional(),
});

/** A track from search, the library, a playlist or the top list. Carries its album. */
export const trackSchema = simplifiedTrackSchema.extend({
  album: albumSchema,
});

function pageOf<S extends ZodType>(item: S) {
  return z.object({
    items: z.array(item),
    limit: z.number().int().nonnegative().optional(),
    offset: z.number().int().nonnegative().optional(),
    total: z.number().int().nonnegative().optional(),
    next: z.string().nullable().optional(),
  });
}

// ---------------------------------------------------------------------------
// Response bodies
// ---------------------------------------------------------------------------

export const albumTracksPageSchema = pageOf(simplifiedTrackSchema);
export const artistAlbumsPageSchema = pageOf(albumSchema);
export const trackPageSchema = pageOf(trackSchema);

/** `GET /search`. Both halves are optional — you get back only the types you asked for. */
export const searchResponseSchema = z.object({
  tracks: pageOf(trackSchema).optional(),
  albums: pageOf(albumSchema).optional(),
});

export const savedTracksPageSchema = pageOf(z.object({ track: trackSchema }));

/**
 * A playlist can hold a local file, a podcast episode, or a hole where a track used to
 * be. None of those are tracks, and none should fail a page of two hundred that are. The
 * `catch` turns each into `null`, which the client drops.
 */
export const playlistItemsPageSchema = pageOf(
  z.object({ track: trackSchema.nullable().catch(null) }),
);

/**
 * `GET /me/playlists`. `tracks.total` is the only count Spotify gives for a playlist you
 * have not read, and it is the number the picker shows.
 *
 * A page of these carries the same holes a page of items does — a playlist the person
 * followed and someone else has since deleted comes back as `null` — so each entry is
 * caught to `null` and the client drops it, exactly as `playlistItemsPageSchema` does.
 */
export const userPlaylistSchema = z.object({
  id,
  name: z.string(),
  tracks: z.object({ total: z.number().int().nonnegative() }).nullable().optional(),
});

export const userPlaylistsPageSchema = pageOf(userPlaylistSchema.nullable().catch(null));

export const recentlyPlayedPageSchema = z.object({
  items: z.array(z.object({ track: trackSchema })),
  next: z.string().nullable().optional(),
});

/** `GET /me/following?type=artist` pages by cursor rather than by offset. */
export const followedArtistsResponseSchema = z.object({
  artists: z.object({
    items: z.array(artistSchema),
    next: z.string().nullable().optional(),
    cursors: z.object({ after: z.string().nullable().optional() }).optional(),
  }),
});

export const playlistSchema = z.object({
  id,
  name: z.string(),
  external_urls: z.object({ spotify: z.string() }).optional(),
});

export const snapshotSchema = z.object({ snapshot_id: z.string() });

export const currentUserSchema = z.object({
  id,
  display_name: z.string().nullable().optional(),
});

/**
 * The error envelope. `reason` is what separates a rate limit that clears in seconds from
 * a quota that does not clear today (§5.2), so it is read on every unhappy status.
 */
export const errorResponseSchema = z.object({
  error: z.object({
    status: z.number().int().optional(),
    message: z.string().optional(),
    reason: z.string().optional(),
  }),
});

export type ArtistRefPayload = Infer<typeof artistRefSchema>;
export type ArtistPayload = Infer<typeof artistSchema>;
export type AlbumPayload = Infer<typeof albumSchema>;
export type SimplifiedTrackPayload = Infer<typeof simplifiedTrackSchema>;
export type TrackPayload = Infer<typeof trackSchema>;
export type UserPlaylistPayload = Infer<typeof userPlaylistSchema>;
export type SearchResponsePayload = Infer<typeof searchResponseSchema>;
export type ErrorResponsePayload = Infer<typeof errorResponseSchema>;
