'use server';

/**
 * Writing the playlist. **The one irreversible act** (§2.8), and the one that leaves the
 * app's world.
 *
 * Three calls in order, each with a limit from spec §5.1.1 that is honored rather than hoped
 * at:
 *
 * 1. `POST /me/playlists` — `/users/{id}/playlists` was removed.
 * 2. `POST /playlists/{id}/items`, **100 URIs per request**. A thirty-track playlist is one
 *    batch; a two-hundred-track one is two, and the ledger says how many it took.
 * 3. `PUT /playlists/{id}/images` — base64 JPEG, 256 KB or less, answers 202.
 *
 * **The cover is allowed to fail on its own.** A playlist that exists without its cover is a
 * playlist; a save that threw away a written playlist because an image upload was refused
 * would be the worse outcome by a distance. So the cover is attempted last and reported
 * separately (§9: an expected absence is a state, not an error).
 *
 * **The tracks get the same care, and used not to.** Once the create call returns, a playlist
 * exists on the account. A throw on batch two of three used to come back as `failed` with no
 * id and no URL — the interface said the save had not happened over a playlist that had, and
 * the person was left hunting for it. So a failed batch returns `partial`: the id, the link,
 * how many tracks went in and how many batches of how many. The half-written playlist is not
 * deleted, because it is theirs and they may want it.
 *
 * **The cover is not attempted after a failed batch.** It dresses a finished playlist, and
 * the thing that stopped the tracks — a spent quota, an expired token — is the same thing
 * that would refuse the image. Spending another request to find that out twice tells nobody
 * anything.
 *
 * **The retry budget is the client's and is not doubled here.** `LiveSpotifyClient` already
 * retries a rate-limited batch; what reaches this loop is a failure that survived it. A
 * second retry loop at this level would burn the shared quota to say the same thing later.
 *
 * **One state this does not cover, honestly.** If `createPlaylist` times out *after* Spotify
 * made the playlist, the id never comes back and there is nothing here to report — the app
 * cannot name a playlist it was never told the id of. Reporting that would take a read-back
 * of `/me/playlists` to find a playlist this save might have made, which is a guess about
 * someone's account, not a report. It is a different state and it is left alone.
 */

import type { PlaylistId, TrackId } from '@pm/core';
import { ADD_ITEMS_MAX_URIS } from '@pm/spotify';

import { toErrorSurface } from '../errors/surface';
import { getSpotifyHandle } from '../spotify/server';
import type { SaveOutcome, SaveRequest } from '../workbench/save';

const PLAYLIST_URL = 'https://open.spotify.com/playlist/';

function batches(trackIds: readonly TrackId[]): readonly (readonly TrackId[])[] {
  const out: (readonly TrackId[])[] = [];
  for (let at = 0; at < trackIds.length; at += ADD_ITEMS_MAX_URIS) {
    out.push(trackIds.slice(at, at + ADD_ITEMS_MAX_URIS));
  }
  return out;
}

/** Demo mode's id names nothing on Spotify, so there is no link to offer. §12.1 */
function linkTo(mode: 'live' | 'demo', playlistId: PlaylistId): string | null {
  return mode === 'live' ? `${PLAYLIST_URL}${playlistId}` : null;
}

export async function savePlaylist(request: SaveRequest): Promise<SaveOutcome> {
  const handle = await getSpotifyHandle();

  let playlistId: PlaylistId;
  try {
    playlistId = await handle.client.createPlaylist({
      name: request.name,
      description: request.description,
      isPublic: request.isPublic,
    });
  } catch (cause) {
    return { kind: 'failed', error: toErrorSurface(cause) };
  }

  const chunks = batches(request.trackIds);
  let added = 0;
  let written = 0;

  for (const chunk of chunks) {
    try {
      await handle.client.addPlaylistTracks({ playlistId, trackIds: chunk });
    } catch (cause) {
      return {
        kind: 'partial',
        playlistId,
        url: linkTo(handle.mode, playlistId),
        added,
        requested: request.trackIds.length,
        batches: written,
        batchesPlanned: chunks.length,
        error: toErrorSurface(cause),
        mode: handle.mode,
        requests: handle.client.requests.snapshot().total,
      };
    }
    added += chunk.length;
    written += 1;
  }

  let coverUploaded = false;
  if (request.coverBase64 !== undefined && request.coverBase64.length > 0) {
    try {
      await handle.client.uploadPlaylistCover({
        playlistId,
        base64Jpeg: request.coverBase64,
      });
      coverUploaded = true;
    } catch {
      // The playlist is written. A missing cover is a state the interface names, not a
      // reason to throw away work that already succeeded.
    }
  }

  return {
    kind: 'written',
    playlistId,
    url: linkTo(handle.mode, playlistId),
    added: request.trackIds.length,
    batches: chunks.length,
    coverUploaded,
    mode: handle.mode,
    requests: handle.client.requests.snapshot().total,
  };
}
