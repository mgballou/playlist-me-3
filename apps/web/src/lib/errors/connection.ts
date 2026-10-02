/**
 * What the two connection redirects say when they land on the bench. ui-sensibility §2.7:
 * **a dead end is a bug**, and every terminal state names what happens next.
 *
 * `/api/auth/login` sends `/?connect=unavailable` and `/api/auth/callback` sends
 * `/?auth=<reason>`. Both reasons were already computed and already in the URL; nothing read
 * either one, so every way connecting can fail landed on a plain bench and a person who
 * pressed Connect and was refused watched the app do nothing.
 *
 * Two rules shape the copy below.
 *
 * - **The reason string never reaches a screen.** `stateMismatch` is not a sentence, and the
 *   sentence it becomes does not explain the check it names — what a person can do about it is
 *   start the sign-in again, and that is all the sentence says.
 * - **An unrecognized value gets an honest fallback rather than a guess.** The set is closed
 *   where it is written (`AUTH_FAILURE_REASONS`), but a URL is typed by anyone, so a value
 *   outside the set says that the app cannot tell what happened rather than inventing a cause.
 *
 * Reading the search string and describing the outcome are separate functions because they
 * are separately worth asserting: one is parsing, the other is wording.
 */

import { isAuthFailureReason, type AuthFailureReason } from './auth';
import type { ErrorSurface } from './surface';

/** Set by the callback, and carrying an `AuthFailureReason`. */
export const AUTH_PARAM = 'auth';

/** Set by the login route when there are no credentials to connect with. */
export const CONNECT_PARAM = 'connect';

export const CONNECT_UNAVAILABLE = 'unavailable';

/** Both parameters, so one function can take them out of a URL without naming them twice. */
export const CONNECTION_PARAMS = [AUTH_PARAM, CONNECT_PARAM] as const;

export type ConnectionOutcome =
  | { readonly kind: 'handoffFailed'; readonly reason: AuthFailureReason }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'unrecognized' };

/**
 * Null when the URL says nothing about connecting, which is the ordinary case and not a
 * failure. `auth` wins over `connect` when both are present: it is the more specific of the
 * two and only a hand-written URL carries both.
 */
export function connectionOutcomeFromSearch(search: string): ConnectionOutcome | null {
  const params = new URLSearchParams(search);

  const auth = params.get(AUTH_PARAM);
  if (auth !== null) {
    return isAuthFailureReason(auth)
      ? { kind: 'handoffFailed', reason: auth }
      : { kind: 'unrecognized' };
  }

  const connect = params.get(CONNECT_PARAM);
  if (connect !== null) {
    return connect === CONNECT_UNAVAILABLE ? { kind: 'unavailable' } : { kind: 'unrecognized' };
  }

  return null;
}

/**
 * The search string with both parameters gone, and everything else — a shared recipe, above
 * all — left exactly where it was. Leading `?` included when anything survives.
 */
export function withoutConnectionParams(search: string): string {
  const params = new URLSearchParams(search);
  for (const name of CONNECTION_PARAMS) params.delete(name);
  const rest = params.toString();
  return rest.length === 0 ? '' : `?${rest}`;
}

/**
 * Nothing to press. Both of these mean the app has no credentials, so offering Connect again
 * would be a control that can only land back here — §2.7's dead end with a button on it.
 */
const UNAVAILABLE: ErrorSurface = {
  kind: 'connectionFailed',
  title: 'This copy of the app cannot connect to Spotify',
  message:
    'It was built without Spotify credentials, so it stays in demo mode on invented data. Everything on the bench still works, and a recipe you make here still travels as a link.',
  retry: 'never',
  retryAfterSeconds: null,
};

function describeReason(reason: AuthFailureReason): ErrorSurface {
  switch (reason) {
    case 'notConfigured':
      return UNAVAILABLE;

    case 'deniedByUser':
      return {
        kind: 'connectionFailed',
        title: 'Spotify was not given permission',
        message:
          'Nothing was connected and nothing changed. Try again and agree to the permissions, or carry on in demo mode.',
        retry: 'reconnect',
        retryAfterSeconds: null,
      };

    case 'authorizeRefused':
      return {
        kind: 'connectionFailed',
        title: 'Spotify refused the sign-in before it started',
        message:
          'That is this app being turned away rather than you declining anything. Try again; if it happens every time, the fault is in how the app is registered with Spotify.',
        retry: 'reconnect',
        retryAfterSeconds: null,
      };

    case 'stateMismatch':
      return {
        kind: 'connectionFailed',
        title: 'That sign-in did not finish',
        message:
          'Nothing was connected. Start it again from this tab — one left sitting too long, or finished in a different tab, cannot be picked up.',
        retry: 'reconnect',
        retryAfterSeconds: null,
      };

    case 'missingCode':
      return {
        kind: 'connectionFailed',
        title: 'Spotify sent you back with nothing to sign in with',
        message: 'Nothing was connected and nothing changed. Try again.',
        retry: 'reconnect',
        retryAfterSeconds: null,
      };

    case 'refused':
      return {
        kind: 'connectionFailed',
        title: 'Spotify refused the sign-in',
        message:
          'Nothing was connected. Try again; if it happens every time, the fault is in how the app is registered with Spotify rather than in your account.',
        retry: 'reconnect',
        retryAfterSeconds: null,
      };

    case 'malformedGrant':
      return {
        kind: 'connectionFailed',
        title: "Spotify's answer could not be read",
        message:
          'Nothing was connected, because a session we cannot read is not one to keep. Try again.',
        retry: 'reconnect',
        retryAfterSeconds: null,
      };

    case 'unreachable':
      return {
        kind: 'connectionFailed',
        title: 'Spotify could not be reached',
        message: 'Nothing was connected. Check the connection and try again.',
        retry: 'reconnect',
        retryAfterSeconds: null,
      };

    case 'noRefreshToken':
      return {
        kind: 'connectionFailed',
        title: 'Spotify granted access that would have expired within the hour',
        message:
          'It was not kept, rather than handing you a connection that dies part-way through a build. Try again.',
        retry: 'reconnect',
        retryAfterSeconds: null,
      };
  }
}

export function describeConnectionOutcome(outcome: ConnectionOutcome): ErrorSurface {
  switch (outcome.kind) {
    case 'handoffFailed':
      return describeReason(outcome.reason);

    case 'unavailable':
      return UNAVAILABLE;

    case 'unrecognized':
      return {
        kind: 'connectionFailed',
        title: 'That sign-in did not finish',
        message:
          'Nothing was connected, and the app does not recognize the reason it came back with, so it cannot honestly say more than that. Try again.',
        retry: 'reconnect',
        retryAfterSeconds: null,
      };
  }
}
