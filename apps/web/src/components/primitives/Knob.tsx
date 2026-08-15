'use client';

/**
 * A knob. The headline control of the Console direction (ui-sensibility §5) and the shape the
 * two most-touched settings in the app now wear.
 *
 * It is a rotary control you turn, so it owes everything a real slider owes and one thing
 * more — a rotary control with no keyboard is a picture of a knob:
 *
 * - **`role="slider"` with real bounds** and `aria-valuetext` naming the position in words,
 *   never just the number (§13). The words come from the caller, which reads them out of the
 *   registry, so no screen invents copy about what a setting means (§12).
 * - **Full keyboard operation.** Arrows step, shift and an arrow step larger, page keys step
 *   larger, Home and End jump to the ends. The map lives in `lib/controls/travel.ts` so a
 *   knob and a fader cannot drift apart.
 * - **Drag is an addition, never the only way** (§13, WCAG 2.5.7). Vertical, up for more, at
 *   a fixed ratio — an accelerating drag cannot be returned to a value you already found.
 *
 * The geometry: a 270° sweep starting at -135°, drawn on a 70-unit square at r=27. The cap is
 * an element rather than a circle in the SVG, so it can carry the real `--shadow-raised` and
 * `--edge-top` that make it read as machined rather than as drawn (§5 rule 3).
 *
 * Motion goes to zero under a reduced-motion preference and time does not (§8): the pointer
 * stops sweeping to its new angle, the arc still changes over a real duration.
 */

import { useId, useRef, type CSSProperties, type ReactNode } from 'react';

import { draggedValue, fractionOf, keyedValue, snap, type Travel } from '@/lib/controls/travel';

/** The 270° sweep, in the units the SVG is authored in. */
const SWEEP_DEGREES = 270;
const SWEEP_START = -135;
const ARC_LENGTH = 127;

export type KnobProps = {
  readonly label: string;
  readonly value: number;
  readonly travel: Travel;
  /** The position in words. Goes to `aria-valuetext` and is printed under the label. §13 */
  readonly valueText: string;
  /** What is printed beside the knob. Usually the same words, without the label prefix. */
  readonly readout: string;
  /** The two ends, printed left and right of the sweep the way a panel prints them. */
  readonly lowLabel: string;
  readonly highLabel: string;
  readonly onChange: (value: number) => void;
  readonly describedBy?: string | undefined;
  /** An honesty note or anything else that belongs under the control. §12.1 */
  readonly children?: ReactNode;
};

export function Knob({
  label,
  value,
  travel,
  valueText,
  readout,
  lowLabel,
  highLabel,
  onChange,
  describedBy,
  children,
}: KnobProps) {
  const labelId = useId();
  const dialRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ readonly startY: number; readonly startValue: number } | null>(null);

  const settled = snap(travel, value);
  const fraction = fractionOf(travel, settled);
  const angle = SWEEP_START + fraction * SWEEP_DEGREES;

  const arc: CSSProperties = { strokeDashoffset: ARC_LENGTH * (1 - fraction) };
  const pointer: CSSProperties = { rotate: `${String(angle)}deg` };

  return (
    <div className="knob">
      <div className="knob__body">
        <div
          ref={dialRef}
          className="knob__dial"
          role="slider"
          tabIndex={0}
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          aria-valuemin={travel.min}
          aria-valuemax={travel.max}
          aria-valuenow={settled}
          aria-valuetext={valueText}
          aria-orientation="vertical"
          onKeyDown={(event) => {
            const next = keyedValue(travel, settled, event);
            if (next === null) return;
            event.preventDefault();
            if (next !== settled) onChange(next);
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            drag.current = { startY: event.clientY, startValue: settled };
            event.currentTarget.setPointerCapture(event.pointerId);
            event.currentTarget.dataset['turning'] = 'true';
            dialRef.current?.focus();
          }}
          onPointerMove={(event) => {
            const held = drag.current;
            if (held === null) return;
            const next = draggedValue(travel, held.startValue, held.startY - event.clientY);
            if (next !== settled) onChange(next);
          }}
          onPointerUp={(event) => {
            drag.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
            delete event.currentTarget.dataset['turning'];
          }}
          onPointerCancel={(event) => {
            drag.current = null;
            delete event.currentTarget.dataset['turning'];
          }}
        >
          <svg className="knob__arc" viewBox="0 0 70 70" aria-hidden="true" focusable="false">
            <circle className="knob__track" cx="35" cy="35" r="27" transform="rotate(135 35 35)" />
            <circle
              className="knob__value"
              cx="35"
              cy="35"
              r="27"
              transform="rotate(135 35 35)"
              style={arc}
            />
          </svg>

          <span className="knob__cap" aria-hidden="true">
            <span className="knob__pointer" style={pointer} />
          </span>
        </div>

        <div className="knob__text">
          <span className="knob__label label" id={labelId}>
            {label}
          </span>
          <output className="knob__readout numeric">{readout}</output>
          <div className="knob__ends muted">
            <span className="knob__end">{lowLabel}</span>
            <span className="knob__end knob__end--high">{highLabel}</span>
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}
