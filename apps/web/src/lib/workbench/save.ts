/**
 * What writing a playlist takes, and what it hands back. Types only — the action itself is
 * `actions/save.ts`, and a `'use server'` module may export nothing but async functions.
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
      readonly ok: true;
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
  | { readonly ok: false; readonly error: ErrorSurface };
