/**
 * Filling a `ContextPayload`: what the app learns about the person, and how much of it.
 *
 * This is the impure half of spec §3.1 that reads the person rather than the pool, and it
 * lives beside the payload type rather than inside the server action so it can be driven by
 * `FakeSpotifyClient` in a test. The action is the only export that Next publishes.
 *
 * **The ceilings below are the price of knowing the person** (§3.5, §5.2), and until now
 * they were also silent. Every read hands back how much of its list it saw, that travels in
 * the payload, and `reject` puts it on the exclusion that consulted it. Nothing here fetches
 * a total: it arrives in the same body as the items.
 */

import type { ArtistId, TrackId } from '@pm/core';
import type { ListSlice, SpotifyClient } from '@pm/spotify';
import { QuotaExceeded } from '@pm/spotify';

import type { ContextPayload, ResolveRequest } from './resolve-request';

/**
 * Ceilings on what learning about the person costs. Familiarity is measured rather than
 * estimated (§3.5), and this is its price — paid once per resolve, not once per dial move.
 *
 * They are exported because a number a person is told about is a number a test can pin, and
 * because the interface prints the read beside them.
 */
export const CONTEXT_LIMITS = {
  savedTracks: 200,
  topTracks: 100,
  recentlyPlayed: 50,
  followedArtists: 50,
  playlistTracks: 400,
} as const;

/** A read that either came back or did not. Never an empty array standing in for both. */
type Read<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

/**
 * One set failing loses that set, not the resolve — a recipe can outlive a playlist. A spent
 * quota is different and ends the whole thing, because every further request would burn
 * budget that cannot succeed (§5.2).
 *
 * It answers with an outcome rather than the empty array it used to substitute. A playlist
 * that could not be read blocks nothing, and *"your kids playlist has nothing in common with
 * this recipe"* and *"we could not read your kids playlist"* must not be the same screen.
 */
async function attempt<T>(run: () => Promise<T>): Promise<Read<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (cause) {
    if (cause instanceof QuotaExceeded) throw cause;
    return { ok: false };
  }
}

/** A failed read holds nothing and says so, which is the whole point of the type. */
function slice<T>(read: Read<ListSlice<T>>): ListSlice<T> {
  return read.ok ? read.value : { items: [], coverage: { kind: 'unread' } };
}

function idsOf<T extends { readonly id: TrackId }>(read: ListSlice<T>): readonly TrackId[] {
  return read.items.map((item) => item.id);
}

export async function resolveContext(
  client: SpotifyClient,
  request: ResolveRequest,
): Promise<ContextPayload> {
  const [saved, top, recent, followed] = await Promise.all([
    attempt(async () => client.getSavedTracks({ maxItems: CONTEXT_LIMITS.savedTracks })),
    attempt(async () => client.getTopTracks('mediumTerm', { maxItems: CONTEXT_LIMITS.topTracks })),
    attempt(async () => client.getRecentlyPlayed({ maxItems: CONTEXT_LIMITS.recentlyPlayed })),
    attempt(async () => client.getFollowedArtists({ maxItems: CONTEXT_LIMITS.followedArtists })),
  ]);

  const library = slice(saved);
  const topTracks = slice(top);
  const recentlyHeard = slice(recent);
  const follows = slice(followed);
  const followedArtistIds: readonly ArtistId[] = follows.items.map((artist) => artist.id);

  const playlists = await Promise.all(
    request.excludedPlaylistIds.map(async (id) => {
      const read = slice(
        await attempt(async () =>
          client.getPlaylistTracks(id, { maxItems: CONTEXT_LIMITS.playlistTracks }),
        ),
      );
      return { playlistId: id, trackIds: idsOf(read), coverage: read.coverage };
    }),
  );

  return {
    libraryTrackIds: idsOf(library),
    topTrackIds: idsOf(topTracks),
    recentlyHeardTrackIds: idsOf(recentlyHeard),
    followedArtistIds,
    playlists,
    coverage: {
      libraryTrackIds: library.coverage,
      topTrackIds: topTracks.coverage,
      recentlyHeardTrackIds: recentlyHeard.coverage,
      followedArtistIds: follows.coverage,
    },
  };
}
