'use client';

/**
 * The subject step for the two exclusions that take a span: years, and running times.
 *
 * Both ends are required and both are validated at the boundary, naming the field that
 * failed (§10). A span whose ends are the wrong way round is corrected rather than refused —
 * the person meant a span, and which end they typed first is not information.
 */

import type { Exclusion } from '@pm/core';
import { useState } from 'react';

const EARLIEST_YEAR = 1900;
const LATEST_YEAR = 2100;
const MS_PER_SECOND = 1000;

/** Sensible ends for a track, in seconds. Not API limits — judgments about music. */
const SHORTEST_SECONDS = 0;
const LONGEST_SECONDS = 3600;

export type RangeSubjectProps = {
  readonly kind: 'years' | 'duration';
  readonly onAdd: (exclusion: Exclusion) => void;
  readonly onCancel: () => void;
};

export function RangeSubject({ kind, onAdd, onCancel }: RangeSubjectProps) {
  const [low, setLow] = useState('');
  const [high, setHigh] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const isYears = kind === 'years';
  const bounds = isYears
    ? { min: EARLIEST_YEAR, max: LATEST_YEAR }
    : { min: SHORTEST_SECONDS, max: LONGEST_SECONDS };

  return (
    <form
      className="draft__form"
      onSubmit={(event) => {
        event.preventDefault();
        const from = Number.parseInt(low, 10);
        const to = Number.parseInt(high, 10);

        if (!Number.isFinite(from)) {
          setProblem(isYears ? 'The first year is missing.' : 'The shortest time is missing.');
          return;
        }
        if (!Number.isFinite(to)) {
          setProblem(isYears ? 'The last year is missing.' : 'The longest time is missing.');
          return;
        }
        if (from < bounds.min || to > bounds.max) {
          setProblem(`Keep both between ${String(bounds.min)} and ${String(bounds.max)}.`);
          return;
        }

        const start = Math.min(from, to);
        const end = Math.max(from, to);
        onAdd(
          isYears
            ? { kind: 'years', range: { from: start, to: end } }
            : {
                kind: 'duration',
                range: { minMs: start * MS_PER_SECOND, maxMs: end * MS_PER_SECOND },
              },
        );
      }}
    >
      <div className="field-row">
        <label className="field">
          <span className="field__label label">{isYears ? 'From year' : 'Shorter than'}</span>
          <input
            className="field__input numeric"
            type="number"
            min={bounds.min}
            max={bounds.max}
            value={low}
            onChange={(event) => {
              setLow(event.currentTarget.value);
              setProblem(null);
            }}
          />
          {isYears ? null : <span className="field__note muted">seconds</span>}
        </label>

        <label className="field">
          <span className="field__label label">{isYears ? 'To year' : 'Longer than'}</span>
          <input
            className="field__input numeric"
            type="number"
            min={bounds.min}
            max={bounds.max}
            value={high}
            onChange={(event) => {
              setHigh(event.currentTarget.value);
              setProblem(null);
            }}
          />
          {isYears ? null : <span className="field__note muted">seconds</span>}
        </label>
      </div>

      {problem === null ? null : (
        <p className="field__problem" role="alert">
          {problem}
        </p>
      )}

      <div className="draft__acts">
        <button type="submit" className="act--secondary">
          Block this span
        </button>
        <button type="button" className="act--quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
