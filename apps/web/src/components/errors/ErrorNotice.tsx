'use client';

/**
 * The three failures that will actually happen, each with its own words and its own way out.
 * ui-sensibility §9 — "a failure says what broke and what to do".
 *
 * The words come from `toErrorSurface`, decided once on the server. This component chooses
 * nothing but the way out, and there is exactly one per failure:
 *
 * - **rate limited** — the workbench is counting down and will ask again by itself. The
 *   countdown is shown, because a promise of an automatic retry with nothing visible
 *   happening is indistinguishable from being stuck. Once that one retry is spent, the
 *   button appears: §9 asks for a retry, not for a loop.
 * - **quota exceeded** — nothing to press, because pressing cannot help today.
 * - **token expired** — reconnect, and come back to this exact place.
 */

import type { ErrorSurface } from '@/lib/errors/surface';

export type ErrorNoticeProps = {
  readonly error: ErrorSurface;
  /** Where reconnecting should return to. §9 */
  readonly returnTo: string;
  /** Seconds left on the automatic retry, or null when nothing is waiting. */
  readonly retryIn?: number | null | undefined;
  readonly onRetry?: (() => void) | undefined;
};

export function ErrorNotice({ error, returnTo, retryIn, onRetry }: ErrorNoticeProps) {
  const waiting = typeof retryIn === 'number' && retryIn > 0;
  const canPress =
    onRetry !== undefined && !waiting && (error.retry === 'manual' || error.retry === 'automatic');

  return (
    <div className="notice notice--danger" role="alert" data-error-kind={error.kind}>
      <p className="notice__title">{error.title}</p>
      <p className="muted">{error.message}</p>

      {waiting ? (
        <p className="notice__countdown numeric" aria-live="polite">
          Asking again in {String(retryIn)}s
        </p>
      ) : null}

      {error.retry === 'reconnect' ? (
        <a
          className="act--secondary"
          href={`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`}
        >
          Reconnect Spotify
        </a>
      ) : null}

      {canPress ? (
        <button type="button" className="act--secondary" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
