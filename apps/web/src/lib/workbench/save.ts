/**
 * What writing a playlist takes, and what it hands back. Types only — the action itself is
 * `actions/save.ts`, and a `'use server'` module may export nothing but async functions.
 *
 * **There are three outcomes, not two.** A save that creates the playlist and then fails on
 * the second batch of tracks has not failed: a playlist exists, it holds the tracks the
 * batches before it wrote, and it is on the account whether the app admits it or not.
 * Reporting that as `failed` threw away the id, the link and the count, and left the person
 * looking for a playlist the interface had just denied making. So `partial` is its own arm,
 * carrying everything needed to say "a hundred of two hundred and fifty written, here it is".
 */

import type { TrackId } from '@pm/core';

import type { ErrorSurface } from '../errors/surface';

export type SaveRequest = {
  readonly name: string;
  readonly description: string;
  readonly trackIds: readonly TrackId[];
  readonly isPublic: boolean;
  /** Base64 JPEG, no data URI prefix. Absent when the browser could not draw one. */
  readonly coverBase64?: string | undefined;
};

export type SaveOutcome =
  | {
      readonly kind: 'written';
      readonly playlistId: string;
      /** Null in demo mode, where the id names nothing on Spotify. §12.1 — no false links. */
      readonly url: string | null;
      readonly added: number;
      /** How many `POST /playlists/{id}/items` calls it took, at 100 URIs each. §5.1.1 */
      readonly batches: number;
      /** False when the playlist was written and the cover was not. An absence, not a failure. */
      readonly coverUploaded: boolean;
      readonly mode: 'live' | 'demo';
      readonly requests: number;
    }
  | {
      readonly kind: 'partial';
      /** The playlist exists. It is not deleted, and this is where it is. */
      readonly playlistId: string;
      /** Null in demo mode, as above. */
      readonly url: string | null;
      /** Tracks actually written — the batches that went through, summed. */
      readonly added: number;
      /** Tracks the save was asked for, so the interface can say "100 of 250". */
      readonly requested: number;
      readonly batches: number;
      readonly batchesPlanned: number;
      /** Why it stopped. The same surface a total failure carries, and it names the way out. */
      readonly error: ErrorSurface;
      readonly mode: 'live' | 'demo';
      readonly requests: number;
    }
  | { readonly kind: 'failed'; readonly error: ErrorSurface };
