'use client';

/**
 * A dial. The two of these are the most-touched controls in the app (spec §2.4), so they get
 * everything §10 and §13 ask of a slider and one thing more:
 *
 * - **A real slider.** `input[type=range]`, so keyboard steps, page steps, home and end all
 *   come from the platform rather than from a hand-rolled div with a drag handler.
 * - **It always shows its value**, and the value is in words as well as on the rule.
 * - **`aria-valuetext` names the position in words**, never just the number (§13). "0.75"
 *   tells nobody anything; "mostly things I know" does.
 * - **The honesty line is rendered, always** (§12.1). Depth carries its approximation and
 *   familiarity says plainly that it is exact. Neither is behind a hover, a tooltip or a
 *   reveal, because a caveat nobody sees is not a caveat.
 *
 * Moving a dial costs nothing: it is not part of `resolveKey`, so it never re-fetches and the
 * deck rebuilds instantly from the pool already in hand (§2.10).
 */

import { useId } from 'react';

import type { DialDefinition } from '@/lib/registry/dials';
import { DIAL_MAX, DIAL_MIN, DIAL_STEP, dialValueText, dialWords } from '@/lib/registry/dials';

export type DialProps = {
  readonly definition: DialDefinition;
  readonly value: number;
  readonly onChange: (value: number) => void;
};

export function Dial({ definition, value, onChange }: DialProps) {
  const inputId = useId();
  const noteId = useId();

  const note = definition.approximation ?? definition.exactness;

  return (
    <div className="dial" data-dial={definition.name}>
      <div className="dial__head">
        <label className="dial__label label" htmlFor={inputId}>
          {definition.label}
        </label>
        <output className="dial__value numeric" htmlFor={inputId}>
          {dialWords(definition, value)}
        </output>
      </div>

      <input
        id={inputId}
        className="dial__input"
        type="range"
        min={DIAL_MIN}
        max={DIAL_MAX}
        step={DIAL_STEP}
        value={value}
        aria-valuetext={dialValueText(definition, value)}
        aria-describedby={note === null ? undefined : noteId}
        onChange={(event) => {
          onChange(Number(event.currentTarget.value));
        }}
      />

      <div className="dial__ends muted">
        <span>{definition.lowLabel}</span>
        <span>{definition.highLabel}</span>
      </div>

      {note === null ? null : (
        <p
          className="dial__note"
          id={noteId}
          data-estimate={definition.approximation === null ? 'false' : 'true'}
        >
          {note}
        </p>
      )}
    </div>
  );
}
