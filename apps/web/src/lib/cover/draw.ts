/**
 * Painting a `CoverPlan`. **One function renders all three uses** (§11.1): the shelf card,
 * the save preview, and the JPEG uploaded to Spotify.
 *
 * It adds no decisions. Every mark's position and size came out of `plan.ts`; this scales
 * them to the square it is given and fills them with tokens read by `palette.ts`. That split
 * is what lets the interesting half — is the fingerprint deterministic, does it differ across
 * recipes — be a plain assertion, while the raster stays a person's job (§15).
 *
 * **It reads at 64px**, which is its size on the shelf, so everything here is sized as a
 * fraction of the square and the line weights have floors.
 */

import type { CoverPlan } from './plan';
import { COVER_GEOMETRY } from './plan';
import type { CoverPalette } from './palette';

export type DrawCoverInput = {
  readonly ctx: CanvasRenderingContext2D;
  readonly plan: CoverPlan;
  /** The square's side in device-independent pixels. */
  readonly size: number;
  readonly palette: CoverPalette;
};

/** Fractions of the square. Named so the drawing reads as a layout rather than as numbers. */
const RULE_WEIGHT = 0.012;
const MIN_RULE_PX = 1;
const NAME_TOP = 0.7;
const NAME_LINE_HEIGHT = 0.082;
const NAME_SIZE = 0.075;
const DIAL_Y = 0.93;
const DIAL_GAP = 0.06;
const NOTCH_RADIUS = 0.022;
const INSET = 0.06;

function rule(size: number): number {
  return Math.max(MIN_RULE_PX, size * RULE_WEIGHT);
}

export function drawCover({ ctx, plan, size, palette }: DrawCoverInput): void {
  ctx.save();
  ctx.clearRect(0, 0, size, size);

  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, size, size);

  if (plan.empty) {
    drawEmpty(ctx, size, palette);
    ctx.restore();
    return;
  }

  drawBands({ ctx, plan, size, palette });
  drawBars({ ctx, plan, size, palette });
  drawName({ ctx, plan, size, palette });
  drawDials({ ctx, plan, size, palette });

  // The ink edge, last, so nothing sits on top of it. The cover is a printed object. §5
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = rule(size) * 2;
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, size - ctx.lineWidth, size - ctx.lineWidth);

  ctx.restore();
}

/** One band per source, width by its share of the pool, filled with its source tone. §11.1 */
function drawBands({ ctx, plan, size, palette }: DrawCoverInput): void {
  const top = COVER_GEOMETRY.bandsTop * size;
  const height = (COVER_GEOMETRY.bandsBottom - COVER_GEOMETRY.bandsTop) * size;

  for (const band of plan.bands) {
    const tone = palette.tones.get(band.tone);
    if (tone === undefined) continue;
    ctx.fillStyle = tone;
    ctx.fillRect(band.start * size, top, Math.max(1, band.width * size), height);
  }

  // A hairline between bands, so two adjacent tones of similar lightness stay two bands.
  ctx.fillStyle = palette.ink;
  for (const band of plan.bands.slice(1)) {
    ctx.fillRect(band.start * size, top, rule(size), height);
  }
}

/** One solid ink bar per exclusion, struck across the bands it removed from. §11.1 */
function drawBars({ ctx, plan, size, palette }: DrawCoverInput): void {
  ctx.fillStyle = palette.ink;
  for (const bar of plan.bars) {
    ctx.fillRect(0, bar.y * size, bar.width * size, Math.max(1, bar.height * size));
  }
}

/**
 * Below this the name is dropped. §11.1 asks the cover to read at 64px, and at 64px a
 * three-line name is four pixels tall — not small text, dirt. The bands, the bars and the
 * notches carry the fingerprint at that size, which is what makes it legible; the name is
 * what tells two similar recipes apart when there is room to read it.
 */
const NAME_MIN_SIZE = 96;

function drawName({ ctx, plan, size, palette }: DrawCoverInput): void {
  if (plan.nameLines.length === 0 || size < NAME_MIN_SIZE) return;
  ctx.fillStyle = palette.ink;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 ${String(size * NAME_SIZE)}px ${palette.displayFont}`;

  plan.nameLines.forEach((line, index) => {
    ctx.fillText(line.toUpperCase(), size * INSET, size * (NAME_TOP + index * NAME_LINE_HEIGHT));
  });
}

/** The two dials as notched rules. Notch position is the dial value, and only that. §11.1 */
function drawDials({ ctx, plan, size, palette }: DrawCoverInput): void {
  const width = (1 - INSET * 2 - DIAL_GAP) / 2;
  const weight = rule(size);

  plan.notches.forEach((notch, index) => {
    const left = INSET + index * (width + DIAL_GAP);
    ctx.fillStyle = palette.ink;
    ctx.fillRect(left * size, size * DIAL_Y - weight / 2, width * size, weight);

    const x = (left + width * notch.position) * size;
    ctx.beginPath();
    ctx.arc(x, size * DIAL_Y, size * NOTCH_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = palette.accent;
    ctx.fill();
    ctx.lineWidth = weight;
    ctx.strokeStyle = palette.ink;
    ctx.stroke();
  });
}

/**
 * A recipe with no sources draws the empty state, not a blank square (§11.1) — an outline
 * and one accent notch, so an unstarted recipe on the shelf reads as unstarted rather than
 * as broken.
 */
function drawEmpty(ctx: CanvasRenderingContext2D, size: number, palette: CoverPalette): void {
  const weight = rule(size) * 2;
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = weight;
  ctx.strokeRect(weight / 2, weight / 2, size - weight, size - weight);

  ctx.setLineDash([size * 0.05, size * 0.05]);
  ctx.lineWidth = rule(size);
  ctx.beginPath();
  ctx.moveTo(size * INSET, size / 2);
  ctx.lineTo(size * (1 - INSET), size / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * NOTCH_RADIUS * 1.6, 0, Math.PI * 2);
  ctx.fillStyle = palette.accent;
  ctx.fill();
  ctx.lineWidth = rule(size);
  ctx.stroke();
}
