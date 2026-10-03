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
import { PAGE_MAX_LIMIT, QuotaExceeded } from '@pm/spotify';

import type { ContextPayload, ResolveRequest } from './resolve-request';

/**
 * How many pages one set may take. A set is read a page at a time, each page waiting on the
 * one before, so this is a ceiling on how long a resolve waits for it — and every resolve
 * waits again, because the client starts cold and the person is re-read on every resolve.
 *
 * Twenty is inside what one source already spends: the resolver reads its sources one
 * request after another, an artist source at its album ceiling takes thirteen before its
 * first genre lookup, and the lookups alone may take sixty. A list shorter than the ceiling
 * ends early and costs what it always did, so only a person the old ceilings misread pays
 * more. `docs/read-caps.md` has the measurement.
 */
const PAGES_PER_SET = 20;

/**
 * Ceilings on what learning about the person costs. Familiarity is measured rather than
 * estimated (§3.5), and this is its price — paid once per resolve, not once per dial move.
 *
 * They are exported because a number a person is told about is a number a test can pin, and
 * because the interface prints the read beside them.
 */
export const CONTEXT_LIMITS = {
  /** Backs `inLibrary` and familiarity. A clipped read lets a saved track through. */
  savedTracks: PAGES_PER_SET * PAGE_MAX_LIMIT,
  /**
   * Above Spotify's own ceiling, so it never binds: the endpoint serves fifty per range and
   * answers the second page empty. That empty page is what lets the read call itself whole
   * without trusting a `total`, and it is the only request this ceiling buys.
   */
  topTracks: 100,
  /** Spotify keeps fifty plays and no more. One request, and the ceiling is theirs, not ours. */
  recentlyPlayed: 50,
  /** Familiarity only, the weakest signal, but a clipped read misjudges every act past it. */
  followedArtists: PAGES_PER_SET * PAGE_MAX_LIMIT,
  /** Backs the headline exclusion. A clipped read puts blocked tracks on the deck. */
  playlistTracks: PAGES_PER_SET * PAGE_MAX_LIMIT,
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
  // One wait, not two. Each set pages on its own, so a resolve waits on the longest of them.
  // The blocked playlists used to start only once the four sets above had finished, which made
  // the wait the slowest set plus the slowest playlist.
  const [saved, top, recent, followed, playlists] = await Promise.all([
    attempt(async () => client.getSavedTracks({ maxItems: CONTEXT_LIMITS.savedTracks })),
    attempt(async () => client.getTopTracks('mediumTerm', { maxItems: CONTEXT_LIMITS.topTracks })),
    attempt(async () => client.getRecentlyPlayed({ maxItems: CONTEXT_LIMITS.recentlyPlayed })),
    attempt(async () => client.getFollowedArtists({ maxItems: CONTEXT_LIMITS.followedArtists })),
    Promise.all(
      request.excludedPlaylistIds.map(async (id) => {
        const read = slice(
          await attempt(async () =>
            client.getPlaylistTracks(id, { maxItems: CONTEXT_LIMITS.playlistTracks }),
          ),
        );
        return { playlistId: id, trackIds: idsOf(read), coverage: read.coverage };
      }),
    ),
  ]);

  const library = slice(saved);
  const topTracks = slice(top);
  const recentlyHeard = slice(recent);
  const follows = slice(followed);
  const followedArtistIds: readonly ArtistId[] = follows.items.map((artist) => artist.id);

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
