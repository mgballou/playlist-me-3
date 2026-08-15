'use client';

/**
 * An inline reveal: **costs nothing** (§2.9). Source tuning, the build report, a track's
 * detail. It is the depth to reach for by default, and the reason source tuning is never a
 * fifteen-field panel sitting there pre-emptively (§2.6, §10).
 *
 * A collapsed reveal is **inert, not merely hidden** (§7): the body is unmounted, so nobody
 * moving through by keyboard can land inside a panel they cannot see.
 */

import { useId, useState, type ReactNode } from 'react';

export type RevealProps = {
  readonly label: string;
  /** Shown on the closed control when the reveal has something to say about its contents. */
  readonly hint?: string | undefined;
  readonly defaultOpen?: boolean | undefined;
  readonly children: ReactNode;
};

export function Reveal({ label, hint, defaultOpen = false, children }: RevealProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <div className="reveal" data-open={open ? 'true' : 'false'}>
      <button
        type="button"
        className="reveal__toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => {
          setOpen((held) => !held);
        }}
      >
        <span className="reveal__caret" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        <span className="reveal__label label">{label}</span>
        {hint === undefined ? null : <span className="reveal__hint muted">{hint}</span>}
      </button>

      {open ? (
        <div className="reveal__body" id={bodyId}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
