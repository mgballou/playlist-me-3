'use client';

/**
 * A fader. The other half of the console (ui-sensibility §5) and the shape for a value that
 * reads better as **travel** than as rotation — how long a playlist is, how many of one act
 * may appear. Both are quantities along a scale, and a scale is a line, not a circle.
 *
 * It owes exactly what the knob owes and gets it from the same place (`lib/controls/travel.ts`):
 * `role="slider"` with real bounds, `aria-valuetext` in words, arrows, shift-arrows, page keys,
 * Home and End. A drag is an addition, never the only route (§13, WCAG 2.5.7).
 *
 * A fader is a cap riding in a machined slot, so the slot takes `--shadow-well` and the cap
 * takes `--surface-top` with `--edge-top` — the same three heights everything else uses, in
 * the one arrangement that makes a groove read as a groove (§5 rule 3).
 */

import { useId, useRef, type CSSProperties } from 'react';

import { fractionOf, keyedValue, snap, valueAtFraction, type Travel } from '@/lib/controls/travel';

export type FaderProps = {
  readonly label: string;
  readonly value: number;
  readonly travel: Travel;
  /** The position in words or in units, for a screen reader. Never a bare number alone. §13 */
  readonly valueText: string;
  /** What is printed at the trailing edge. Already formatted — numbers come from `format`. */
  readonly readout: string;
  readonly onChange: (value: number) => void;
  readonly describedBy?: string | undefined;
  /** A note under the control, where one is owed. */
  readonly note?: string | undefined;
};

export function Fader({
  label,
  value,
  travel,
  valueText,
  readout,
  onChange,
  describedBy,
  note,
}: FaderProps) {
  const labelId = useId();
  const noteId = useId();
  const slotRef = useRef<HTMLDivElement | null>(null);
  const capRef = useRef<HTMLSpanElement | null>(null);
  const dragging = useRef(false);

  const settled = snap(travel, value);
  const fraction = fractionOf(travel, settled);
  const style: CSSProperties = { '--fader-fraction': String(fraction) } as CSSProperties;

  /**
   * Where the pointer is along the slot. The cap has width, so the usable run is the slot
   * less one cap — otherwise the ends are unreachable and the readout stops short of both.
   */
  const fractionAt = (clientX: number): number | null => {
    const slot = slotRef.current;
    if (slot === null) return null;
    const box = slot.getBoundingClientRect();
    const cap = capRef.current?.offsetWidth ?? 0;
    const run = box.width - cap;
    if (run <= 0) return null;
    return Math.min(1, Math.max(0, (clientX - box.left - cap / 2) / run));
  };

  const moveTo = (clientX: number): void => {
    const at = fractionAt(clientX);
    if (at === null) return;
    const next = valueAtFraction(travel, at);
    if (next !== settled) onChange(next);
  };

  return (
    <div className="fader">
      <div className="fader__head">
        <span className="fader__label label" id={labelId}>
          {label}
        </span>
        <output className="fader__readout numeric">{readout}</output>
      </div>

      <div
        ref={slotRef}
        className="fader__slot"
        style={style}
        role="slider"
        tabIndex={0}
        aria-labelledby={labelId}
        aria-describedby={note === undefined ? describedBy : noteId}
        aria-valuemin={travel.min}
        aria-valuemax={travel.max}
        aria-valuenow={settled}
        aria-valuetext={valueText}
        aria-orientation="horizontal"
        onKeyDown={(event) => {
          const next = keyedValue(travel, settled, event);
          if (next === null) return;
          event.preventDefault();
          if (next !== settled) onChange(next);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.dataset['sliding'] = 'true';
          event.currentTarget.focus();
          moveTo(event.clientX);
        }}
        onPointerMove={(event) => {
          if (!dragging.current) return;
          moveTo(event.clientX);
        }}
        onPointerUp={(event) => {
          dragging.current = false;
          event.currentTarget.releasePointerCapture(event.pointerId);
          delete event.currentTarget.dataset['sliding'];
        }}
        onPointerCancel={(event) => {
          dragging.current = false;
          delete event.currentTarget.dataset['sliding'];
        }}
      >
        <span className="fader__fill" aria-hidden="true" />
        <span ref={capRef} className="fader__cap" aria-hidden="true" />
      </div>

      {note === undefined ? null : (
        <p className="fader__note muted" id={noteId}>
          {note}
        </p>
      )}
    </div>
  );
}
