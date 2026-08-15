/**
 * The third use of the one drawing: the JPEG Spotify takes. Spec §5.1.1 —
 * `PUT /playlists/{id}/images` wants base64 JPEG, 256 KB or less, and answers 202.
 *
 * Nothing here draws. It makes an offscreen square, hands it to `drawCover`, and steps the
 * quality down until the encoding fits the ceiling. Quality is stepped rather than fixed
 * because the cover is flat color fields — most recipes encode far under the limit, and the
 * few with eight bands and a long name should lose a little fidelity rather than fail.
 */

import { COVER_MAX_BYTES } from '@pm/spotify';

import { drawCover } from './draw';
import type { CoverPalette } from './palette';
import type { CoverPlan } from './plan';
import { COVER_SIDE } from './plan';

/** Tried in order, highest first. Flat color fields survive the drop with no visible cost. */
const QUALITY_STEPS = [0.92, 0.8, 0.65, 0.5] as const;

const DATA_URI_PREFIX = /^data:image\/jpeg;base64,/;

export type CoverJpeg = {
  /** Base64, with no data URI prefix — which is the shape `CoverUploadInput` asks for. */
  readonly base64: string;
  readonly quality: number;
  readonly bytes: number;
};

/**
 * Null when the browser gives no 2D context, or when even the lowest quality will not fit.
 * The save flow treats a missing cover as a state rather than a failure (§9): the playlist
 * is still written, and it says the cover did not go up.
 */
export function coverJpeg(plan: CoverPlan, palette: CoverPalette): CoverJpeg | null {
  const canvas = document.createElement('canvas');
  canvas.width = COVER_SIDE;
  canvas.height = COVER_SIDE;

  const ctx = canvas.getContext('2d');
  if (ctx === null) return null;

  drawCover({ ctx, plan, size: COVER_SIDE, palette });

  for (const quality of QUALITY_STEPS) {
    const base64 = canvas.toDataURL('image/jpeg', quality).replace(DATA_URI_PREFIX, '');
    if (base64.length > 0 && base64.length <= COVER_MAX_BYTES) {
      return { base64, quality, bytes: base64.length };
    }
  }

  return null;
}
