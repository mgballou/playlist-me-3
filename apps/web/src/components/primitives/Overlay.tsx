'use client';

/**
 * An overlay: **borrows attention, gives it back** (§2.9). Picking an artist, a playlist, a
 * genre. It is the middle depth — heavier than a reveal, lighter than a takeover.
 *
 * Two rules meet here and the resolution is worth stating, because it looks like a mistake:
 *
 * - §13 asks for **the platform's own primitive** for dialogs, which supplies focus handling
 *   and dismissal a hand-rolled version gets wrong.
 * - §7 says **nothing may dim the ledger**, and `showModal()` renders in the top layer, where
 *   `z-index` does not reach and the whole viewport goes under one backdrop.
 *
 * So an overlay is a `<dialog>` opened **non-modally**, which keeps it in normal stacking at
 * `--z-overlay` — above the rack, below `--z-ledger`. The two behaviors `showModal` would
 * have supplied for free are supplied here instead: escape closes it, and focus moves into it
 * on open and back to the opener on close. A takeover (`Takeover.tsx`) is the one that goes
 * to the top layer, because a takeover is allowed to cover everything.
 */

import { useEffect, useRef, type ReactNode } from 'react';

export type OverlayProps = {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
};

export function Overlay({ title, onClose, children }: OverlayProps) {
  const panelRef = useRef<HTMLDialogElement | null>(null);
  const openerRef = useRef<Element | null>(null);

  useEffect(() => {
    openerRef.current = document.activeElement;
    const focusable = panelRef.current?.querySelector<HTMLElement>(
      'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();

    return () => {
      if (openerRef.current instanceof HTMLElement) openerRef.current.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="overlay" data-layer="overlay">
      <button
        type="button"
        className="overlay__scrim"
        aria-label={`Close ${title}`}
        onClick={onClose}
      />
      <dialog open ref={panelRef} className="overlay__panel" aria-label={title}>
        <header className="overlay__band">
          <h2 className="overlay__title label">{title}</h2>
          <button type="button" className="act--quiet" onClick={onClose}>
            <span aria-hidden="true">✕</span>
            <span className="visually-hidden">Close {title}</span>
          </button>
        </header>
        <div className="overlay__body">{children}</div>
      </dialog>
    </div>
  );
}
