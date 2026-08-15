/**
 * Three failures will actually happen, and each gets its own words. ui-sensibility §9:
 *
 * - **Rate limited** — resolves in seconds. Say how many, and retry automatically.
 * - **Quota exceeded** — does not resolve today. Say so plainly; do not retry in a loop.
 * - **Token expired** — reconnect, and return to exactly where they were.
 *
 * The client already hands back distinct typed errors (§5.2), so this is a mapping rather
 * than a guess. It runs on the server, at the edge of a server action, because an `Error`
 * instance does not survive the trip to the browser — the surface is plain data by design.
 *
 * **The rate-limit copy was a lie and is not any more.** `RateLimited` only escapes the
 * client after its own retries are spent, so "carrying on by itself" described something
 * nothing did. Rather than soften the words, the retry was built: `useWorkbenchState` counts
 * the wait down and re-issues the resolve once — once, never in a loop, because a loop would
 * burn the shared per-developer-account quota (§5.2). If that second attempt is refused too,
 * `ErrorNotice` hands the decision to the person. So the sentence is now true and the
 * behavior is bounded, which the original was not and the softened version would not be
 * either.
 */

import { AuthFailed, QuotaExceeded, RateLimited, SpotifyError } from '@pm/spotify';

export type ErrorKind = 'rateLimited' | 'quotaExceeded' | 'tokenExpired' | 'failed';

/** What the interface should do next, decided here rather than in a component. */
export type RetryPolicy = 'automatic' | 'never' | 'reconnect' | 'manual';

export type ErrorSurface = {
  readonly kind: ErrorKind;
  readonly title: string;
  readonly message: string;
  readonly retry: RetryPolicy;
  /** Set only for `rateLimited`, where the wait is knowable and worth stating. */
  readonly retryAfterSeconds: number | null;
};

export function toErrorSurface(cause: unknown): ErrorSurface {
  if (cause instanceof RateLimited) {
    const seconds = Math.max(1, Math.ceil(cause.retryAfterSeconds));
    return {
      kind: 'rateLimited',
      title: 'Spotify asked us to slow down',
      message: `Waiting ${String(seconds)} seconds, then asking again.`,
      retry: 'automatic',
      retryAfterSeconds: seconds,
    };
  }

  if (cause instanceof QuotaExceeded) {
    return {
      kind: 'quotaExceeded',
      title: "This app's daily Spotify quota is spent",
      message: 'It resets, but not today. Retrying now cannot help, so nothing is retrying.',
      retry: 'never',
      retryAfterSeconds: null,
    };
  }

  if (cause instanceof AuthFailed) {
    return {
      kind: 'tokenExpired',
      title: 'The Spotify connection expired',
      message: 'Reconnect and you will come straight back here — your recipe is kept.',
      retry: 'reconnect',
      retryAfterSeconds: null,
    };
  }

  return {
    kind: 'failed',
    title: 'That did not work',
    message:
      cause instanceof SpotifyError ? cause.message : 'Something failed on the way to Spotify.',
    retry: 'manual',
    retryAfterSeconds: null,
  };
}
