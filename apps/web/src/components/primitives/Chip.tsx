'use client';

/**
 * A kind, wearing its tone. §12: **no screen decides what color a state is** — the tone
 * arrives as a semantic token name from the registry and this turns it into a look. One
 * place, and one only.
 *
 * §5.1: a source tone **never fills a control that acts**. It tints a swatch and the chip's
 * edge; the label stays in ink. That is what keeps a chip from being mistaken for the one
 * color that means act.
 */

import { toneStyle } from '@/lib/registry/tone';

export type ChipProps = {
  readonly label: string;
  readonly glyph: string;
  /** A semantic token name, e.g. `--source-artist`. Never a color. */
  readonly tone?: string | undefined;
};

export function Chip({ label, glyph, tone }: ChipProps) {
  return (
    <span
      className="chip"
      data-toned={tone === undefined ? 'false' : 'true'}
      style={tone === undefined ? undefined : toneStyle(tone)}
    >
      <span className="chip__swatch" aria-hidden="true">
        {glyph}
      </span>
      <span className="chip__label label">{label}</span>
    </span>
  );
}
