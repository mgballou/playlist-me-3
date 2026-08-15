'use client';

/**
 * One exclusion, wearing what it removed.
 *
 * The number is the point (§2.3). An exclusion that removed nothing says so plainly rather
 * than showing a zero that reads like a broken counter — "removed nothing" and "has not run"
 * are different facts and §12 says a state meaning *not yet decided* renders nothing at all.
 *
 * `liveOrRemix` carries its "best effort" caveat from the registry, always visible (§12.1).
 * A heuristic presented as certainty is the easiest lie in the project to tell.
 */

import type { Exclusion } from '@pm/core';

import { describeExclusion, exclusionDefinition } from '@/lib/registry/exclusions';

export type ExclusionRowProps = {
  readonly exclusion: Exclusion;
  readonly index: number;
  readonly names: ReadonlyMap<string, string>;
  /** Null before a build has run. Not zero — those are different things. §12 */
  readonly removed: number | null;
  readonly onRemove: () => void;
};

export function ExclusionRow({ exclusion, index, names, removed, onRemove }: ExclusionRowProps) {
  const definition = exclusionDefinition(exclusion.kind);
  const subject = describeExclusion(exclusion, names);

  return (
    <li
      className="row row--block"
      data-kind={exclusion.kind}
      data-headline={definition.headline ? 'true' : 'false'}
    >
      <div className="row__head">
        <span className="row__glyph" aria-hidden="true">
          {definition.glyph}
        </span>

        <span className="row__subject" title={subject}>
          {subject}
        </span>

        <span className="row__count numeric" aria-live="polite">
          {removed === null ? (
            <span className="visually-hidden">Not built yet</span>
          ) : removed === 0 ? (
            <span className="row__zero">caught nothing</span>
          ) : (
            <>
              −{String(removed)}
              <span className="visually-hidden"> tracks removed</span>
            </>
          )}
        </span>

        <button
          type="button"
          className="act--quiet row__remove"
          onClick={onRemove}
          aria-label={`Stop blocking ${definition.label}, ${subject}`}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      {definition.caveat === null ? null : (
        <p className="row__caveat" data-estimate="true">
          {definition.caveat}
        </p>
      )}

      {exclusion.kind === 'playlist' ? (
        <p className="row__meta muted">
          Reading this list is the one exclusion that costs a request, once, when it changes.
        </p>
      ) : null}
      <span className="visually-hidden">Exclusion {String(index + 1)}</span>
    </li>
  );
}
