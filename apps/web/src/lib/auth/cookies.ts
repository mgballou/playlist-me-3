/**
 * Every cookie this app sets, named and shaped in one place. Spec §5.3: tokens live in an
 * encrypted, httpOnly, SameSite=Lax cookie, and no token ever reaches client JavaScript.
 *
 * `httpOnly` is not optional on any of these, and the type says so rather than leaving it to
 * each call site — the verifier leaking into `document.cookie` would undo the whole point of
 * PKCE, and a `boolean` there is one typo away from that.
 */

export const SESSION_COOKIE = 'pm_session';
export const VERIFIER_COOKIE = 'pm_pkce_verifier';
export const STATE_COOKIE = 'pm_pkce_state';
export const RETURN_COOKIE = 'pm_return_to';

/** The handoff cookies live only as long as a person takes to click "agree". */
export const HANDOFF_MAX_AGE_SECONDS = 600;

/** Long enough that a refresh token is what expires the session, not the cookie holding it. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * `SameSite=Lax` rather than `Strict`: the callback is a top-level GET arriving from
 * accounts.spotify.com, and `Strict` would withhold the very cookies the callback exists to
 * read.
 */
export type CookieOptions = {
  readonly httpOnly: true;
  readonly sameSite: 'lax';
  readonly secure: boolean;
  readonly path: string;
  readonly maxAge: number;
};

export function sessionCookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: SESSION_MAX_AGE_SECONDS };
}

export function handoffCookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: HANDOFF_MAX_AGE_SECONDS };
}

/** Same attributes, zero lifetime. A cookie is only cleared by a matching path. */
export function clearedCookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 0 };
}

/** The cookies a callback must clear whether it succeeded or failed. §5.3.1 */
export const HANDOFF_COOKIES = [VERIFIER_COOKIE, STATE_COOKIE, RETURN_COOKIE] as const;

/**
 * Where to send someone after the handoff. Only a path within this app is ever accepted —
 * an absolute URL here is an open redirect wearing a helpful hat.
 */
export function safeReturnPath(candidate: string | undefined | null): string {
  if (candidate === undefined || candidate === null) return '/';
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return '/';
  return candidate;
}
