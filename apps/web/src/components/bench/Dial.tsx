'use client';

/**
 * A dial — a `Knob`, wearing what the registry says about it.
 *
 * The two of these are the most-touched controls in the app (spec §2.4), and in the Console
 * direction they are the headline control rather than a rule with a handle on it: a rotary
 * knob you turn with your hand (ui-sensibility §5).
 *
 * The component owns nothing but the wiring. Everything a person reads comes from
 * `registry/dials.ts` (§12), and everything a person operates comes from `Knob` (§13):
 *
 * - **It always shows its value**, and the value is in words, on the panel, beside the knob.
 * - **`aria-valuetext` names the position in words**, never just the number (§13). "0.75"
 *   tells nobody anything; "mostly things I know" does.
 * - **The honesty line is rendered, always** (§12.1). Depth carries its approximation and
 *   familiarity says plainly that it is exact. Neither is behind a hover, a tooltip or a
 *   reveal, because a caveat nobody sees is not a caveat. It is bound to the slider with
 *   `aria-describedby`, so it is announced with the control rather than sitting near it.
 *
 * Turning a dial costs nothing: it is not part of `resolveKey`, so it never re-fetches and
 * the deck rebuilds instantly from the pool already in hand (§2.10).
 */

import { useId } from 'react';

import { Knob } from '@/components/primitives/Knob';
import type { Travel } from '@/lib/controls/travel';
import type { DialDefinition } from '@/lib/registry/dials';
import {
  DIAL_BIG_STEP,
  DIAL_MAX,
  DIAL_MIN,
  DIAL_STEP,
  dialValueText,
  dialWords,
} from '@/lib/registry/dials';

/** The bounds and the keyboard increments, from the registry rather than from this screen. */
const DIAL_TRAVEL: Travel = {
  min: DIAL_MIN,
  max: DIAL_MAX,
  step: DIAL_STEP,
  bigStep: DIAL_BIG_STEP,
};

export type DialProps = {
  readonly definition: DialDefinition;
  readonly value: number;
  readonly onChange: (value: number) => void;
};

export function Dial({ definition, value, onChange }: DialProps) {
  const noteId = useId();
  const note = definition.approximation ?? definition.exactness;

  return (
    <div className="dial" data-dial={definition.name}>
      <Knob
        label={definition.label}
        value={value}
        travel={DIAL_TRAVEL}
        valueText={dialValueText(definition, value)}
        readout={dialWords(definition, value)}
        lowLabel={definition.lowLabel}
        highLabel={definition.highLabel}
        onChange={onChange}
        describedBy={note === null ? undefined : noteId}
      >
        {note === null ? null : (
          <p
            className="dial__note"
            id={noteId}
            data-estimate={definition.approximation === null ? 'false' : 'true'}
          >
            {note}
          </p>
        )}
      </Knob>
    </div>
  );
}
