/**
 * The heading band, and the one primitive every titled region is built from. §6.
 *
 * A heading gets its weight from **structure**, not from size: the band owns its own surface
 * with a heavy rule beneath it, and the body sits recessed one step back, so heading and
 * content read as one built unit.
 *
 * Four slots and no more — title, glyph, a count or state set to the trailing edge, and
 * actions. A fifth is a smell.
 */

import type { ReactNode } from 'react';

export type ModuleProps = {
  readonly title: string;
  readonly glyph: string;
  /** Already formatted. Numbers come through `format` from `@pm/core`, never hand-built. */
  readonly count?: string | undefined;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
};

export function Module({ title, glyph, count, actions, children }: ModuleProps) {
  return (
    <section className="module" aria-label={title}>
      <header className="module__band">
        <span className="module__glyph" aria-hidden="true">
          {glyph}
        </span>
        <h2 className="module__title">{title}</h2>
        {count === undefined ? null : <span className="module__count numeric">{count}</span>}
        {actions}
      </header>
      <div className="module__body">{children}</div>
    </section>
  );
}
