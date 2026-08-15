'use client';

/**
 * The second step of a `search` source: what to search for.
 *
 * Words are required; a genre and a span of years are not, and neither sits there
 * pre-emptively — they are a reveal (§2.6, §10). The obscurity switch lives on the row's
 * tuning rather than here, for the same reason.
 *
 * **Every control has a real label bound to the real control** (§10). Nothing here relies on
 * placeholder text to say what a field is.
 */

import type { Source } from '@pm/core';
import { useState } from 'react';

import { Reveal } from '@/components/primitives/Reveal';

export type SearchSubjectProps = {
  readonly onAdd: (source: Source) => void;
  readonly onCancel: () => void;
};

/** A plausible span for a music catalog, and the bounds the year fields accept. */
const EARLIEST_YEAR = 1900;
const LATEST_YEAR = 2100;

export function SearchSubject({ onAdd, onCancel }: SearchSubjectProps) {
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const years = parseYears(from, to);
  const ready = query.trim().length > 0;

  return (
    <form
      className="draft__form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        onAdd({
          kind: 'search',
          query: query.trim(),
          obscurity: 'any',
          ...(genre.trim().length > 0 ? { genre: genre.trim() } : {}),
          ...(years === null ? {} : { years }),
        });
      }}
    >
      <label className="field">
        <span className="field__label label">Words to search for</span>
        <input
          className="field__input"
          type="text"
          value={query}
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.currentTarget.value);
          }}
        />
      </label>

      <Reveal label="Narrow it" hint="genre, years">
        <label className="field">
          <span className="field__label label">Genre</span>
          <input
            className="field__input"
            type="text"
            value={genre}
            autoComplete="off"
            onChange={(event) => {
              setGenre(event.currentTarget.value);
            }}
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span className="field__label label">From year</span>
            <input
              className="field__input numeric"
              type="number"
              min={EARLIEST_YEAR}
              max={LATEST_YEAR}
              value={from}
              onChange={(event) => {
                setFrom(event.currentTarget.value);
              }}
            />
          </label>
          <label className="field">
            <span className="field__label label">To year</span>
            <input
              className="field__input numeric"
              type="number"
              min={EARLIEST_YEAR}
              max={LATEST_YEAR}
              value={to}
              onChange={(event) => {
                setTo(event.currentTarget.value);
              }}
            />
          </label>
        </div>
      </Reveal>

      <div className="draft__acts">
        <button type="submit" className="act--secondary" disabled={!ready}>
          Add this search
        </button>
        <button type="button" className="act--quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Both ends or neither. A half-filled span is a mistake, not a filter. §10 */
function parseYears(
  from: string,
  to: string,
): { readonly from: number; readonly to: number } | null {
  const start = Number.parseInt(from, 10);
  const end = Number.parseInt(to, 10);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < EARLIEST_YEAR || end > LATEST_YEAR) return null;
  return start <= end ? { from: start, to: end } : { from: end, to: start };
}
