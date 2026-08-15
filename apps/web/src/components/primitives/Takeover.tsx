'use client';

/**
 * A takeover: **changes where you are** (§2.9). The save confirm, and nothing else in this
 * app — writing to Spotify is the one irreversible act and the one that leaves the app's
 * world, so it confirms once, before it happens (§2.8).
 *
 * This is the platform primitive used the way §13 asks: `showModal()`, top layer, its own
 * backdrop, escape and focus handled by the browser. It is also what makes §2.8's *"every
 * control disables together while a confirm is open"* free rather than hand-maintained — a
 * modal dialog makes the rest of the document inert, so a second input cannot race it.
 */

import { useEffect, useRef, type ReactNode } from 'react';

export type TakeoverProps = {
  readonly title: string;
  /** Called for escape and for the backdrop, so a takeover is never a trap. */
  readonly onClose: () => void;
  readonly children: ReactNode;
};

export function Takeover({ title, onClose, children }: TakeoverProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null || dialog.open) return;

    // `showModal()` is what puts it in the top layer, and it is the whole point of using the
    // platform primitive. It refuses to run on an element that already carries `open`, which
    // is why `open` is set here rather than in the markup — rendering it open and then asking
    // for a modal gives a dialog sitting inline in the document flow, below the fold.
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="takeover"
      data-layer="takeover"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="takeover__band">
        <h2 className="takeover__title">{title}</h2>
      </header>
      <div className="takeover__body">{children}</div>
    </dialog>
  );
}
