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
 */

import type { TrackId } from '@pm/core';
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

export async function savePlaylist(request: SaveRequest): Promise<SaveOutcome> {
  const handle = await getSpotifyHandle();

  try {
    const playlistId = await handle.client.createPlaylist({
      name: request.name,
      description: request.description,
      isPublic: request.isPublic,
    });

    const chunks = batches(request.trackIds);
    for (const chunk of chunks) {
      await handle.client.addPlaylistTracks({ playlistId, trackIds: chunk });
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
      ok: true,
      playlistId,
      // Demo mode's id names nothing on Spotify, so there is no link to offer. Offering one
      // would be the interface claiming a write that did not happen. §12.1
      url: handle.mode === 'live' ? `${PLAYLIST_URL}${playlistId}` : null,
      added: request.trackIds.length,
      batches: chunks.length,
      coverUploaded,
      mode: handle.mode,
      requests: handle.client.requests.snapshot().total,
    };
  } catch (cause) {
    return { ok: false, error: toErrorSurface(cause) };
  }
}
