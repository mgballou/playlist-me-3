'use client';

/**
 * The cover on screen — the shelf card and the save preview, both from the one drawing
 * (§11.1). The third use, the uploaded JPEG, goes through `lib/cover/export.ts` and the same
 * `drawCover`.
 *
 * The canvas is scaled by the device pixel ratio so a 64px cover on the shelf is drawn at
 * whatever the screen actually has. It carries a real `role="img"` and a name that describes
 * the recipe rather than the picture, because "generated cover art" tells nobody anything.
 */

import type { BuildReport, Recipe } from '@pm/core';
import { useEffect, useMemo, useRef } from 'react';

import { drawCover } from '@/lib/cover/draw';
import { readCoverPalette } from '@/lib/cover/palette';
import { coverPlan } from '@/lib/cover/plan';

export type CoverArtProps = {
  readonly recipe: Recipe;
  readonly report?: BuildReport | null | undefined;
  /** Its side in CSS pixels. The shelf uses 64, which is the size it is designed for. */
  readonly size: number;
};

export function CoverArt({ recipe, report, size }: CoverArtProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const plan = useMemo(() => coverPlan(recipe, report ?? null), [recipe, report]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    // The palette is read first on purpose: where the tokens cannot be read there is nothing
    // to draw with, and asking for a context we will not use is noise in a test log.
    const palette = readCoverPalette(document.documentElement);
    if (palette === null) return;

    const ctx = canvas.getContext('2d');
    if (ctx === null) return;

    const ratio = window.devicePixelRatio;
    canvas.width = Math.round(size * ratio);
    canvas.height = Math.round(size * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    drawCover({ ctx, plan, size, palette });
  }, [plan, size]);

  return (
    <canvas
      ref={canvasRef}
      className="cover"
      role="img"
      aria-label={describeCover(recipe)}
      style={{ width: `${String(size)}px`, height: `${String(size)}px` }}
    />
  );
}

/** What the picture means, said once. A fingerprint you can learn is worth naming. §11.1 */
function describeCover(recipe: Recipe): string {
  const sources = recipe.sources.length;
  const exclusions = recipe.exclusions.length;
  if (sources === 0) return `Cover for ${recipe.name}: no sources yet`;
  return `Cover for ${recipe.name}: ${String(sources)} sources, ${String(exclusions)} blocks`;
}
