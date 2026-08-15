'use server';

/**
 * The impure half of spec §3.1, and the only part of the loop that touches the network.
 *
 * It runs on the server because that is where the tokens are and where they stay (§5.3).
 * What comes back is the resolved pool, the person's own sets, the resolve report and what
 * it cost — data, all of it, and nothing that could be used to call Spotify again.
 *
 * The client does everything else. `build` is pure and instant, so re-roll, lock, reject and
 * reorder happen in the browser against the pool already in hand (ui-sensibility §2.10).
 * **Never re-fetch to re-roll.**
 */

import type { ArtistId, TrackId } from '@pm/core';
import type { SpotifyClient } from '@pm/spotify';
import { QuotaExceeded, resolveSources } from '@pm/spotify';

import { toErrorSurface } from '../errors/surface';
import { getSpotifyHandle } from '../spotify/server';
import type { ResolveOutcome } from '../workbench/outcome';
import type { ContextPayload, ResolveRequest } from '../workbench/resolve-request';

/**
 * Ceilings on what learning about the person costs. Familiarity is measured rather than
 * estimated (§3.5), and this is its price — paid once per resolve, not once per dial move.
 */
const CONTEXT_LIMITS = {
  savedTracks: 200,
  topTracks: 100,
  recentlyPlayed: 50,
  followedArtists: 50,
  playlistTracks: 400,
} as const;

/**
 * One source failing loses that source, not the resolve — a recipe can outlive a playlist. A
 * spent quota is different and ends the whole thing, because every further request would burn
 * budget that cannot succeed (§5.2).
 */
async function attempt<T>(fallback: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (cause) {
    if (cause instanceof QuotaExceeded) throw cause;
    return fallback;
  }
}

async function resolveContext(
  client: SpotifyClient,
  request: ResolveRequest,
): Promise<ContextPayload> {
  const [saved, top, recent, followed] = await Promise.all([
    attempt<readonly TrackId[]>([], async () =>
      (await client.getSavedTracks({ maxItems: CONTEXT_LIMITS.savedTracks })).map(
        (track) => track.id,
      ),
    ),
    attempt<readonly TrackId[]>([], async () =>
      (await client.getTopTracks('mediumTerm', { maxItems: CONTEXT_LIMITS.topTracks })).map(
        (track) => track.id,
      ),
    ),
    attempt<readonly TrackId[]>([], async () =>
      (await client.getRecentlyPlayed({ maxItems: CONTEXT_LIMITS.recentlyPlayed })).map(
        (track) => track.id,
      ),
    ),
    attempt<readonly ArtistId[]>([], async () =>
      (await client.getFollowedArtists({ maxItems: CONTEXT_LIMITS.followedArtists })).map(
        (artist) => artist.id,
      ),
    ),
  ]);

  const playlists = await Promise.all(
    request.excludedPlaylistIds.map(async (id) => ({
      playlistId: id,
      trackIds: await attempt<readonly TrackId[]>([], async () =>
        (await client.getPlaylistTracks(id, { maxItems: CONTEXT_LIMITS.playlistTracks })).map(
          (track) => track.id,
        ),
      ),
    })),
  );

  return {
    libraryTrackIds: saved,
    topTrackIds: top,
    recentlyHeardTrackIds: recent,
    followedArtistIds: followed,
    playlists,
  };
}

export async function resolveWorkbench(request: ResolveRequest): Promise<ResolveOutcome> {
  const handle = await getSpotifyHandle();

  try {
    const resolved = await resolveSources({ client: handle.client, sources: request.sources });
    const context = await resolveContext(handle.client, request);

    return {
      ok: true,
      resolved: {
        pool: resolved.pool,
        context,
        report: resolved.report,
        requests: handle.client.requests.snapshot().total,
        mode: handle.mode,
      },
    };
  } catch (cause) {
    return { ok: false, error: toErrorSurface(cause) };
  }
}
