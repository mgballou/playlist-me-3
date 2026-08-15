/**
 * Finish the handoff. Spec §5.3.1.
 *
 * The order here is the whole security of the flow:
 *
 * 1. Clear the handoff cookies **whatever happens** — one attempt, one verifier.
 * 2. Check `state` **before** looking at `code`. A mismatch aborts without exchanging.
 * 3. Exchange, seal the tokens into the encrypted session cookie, and return the person to
 *    exactly where they were (ui-sensibility §9, "token expired — reconnect, and return to
 *    exactly where they were").
 */

import { NextResponse, type NextRequest } from 'next/server';

import {
  HANDOFF_COOKIES,
  RETURN_COOKIE,
  SESSION_COOKIE,
  STATE_COOKIE,
  VERIFIER_COOKIE,
  clearedCookieOptions,
  safeReturnPath,
  sessionCookieOptions,
} from '@/lib/auth/cookies';
import { statesMatch } from '@/lib/auth/pkce';
import { sealSession, sessionFromGrant } from '@/lib/auth/session';
import { exchangeCode } from '@/lib/auth/tokens';
import { AuthHandoffFailed } from '@/lib/errors/auth';
import { isSecureOrigin, readSpotifyEnv } from '@/lib/env';

function withHandoffCleared(response: NextResponse, secure: boolean): NextResponse {
  const cleared = clearedCookieOptions(secure);
  for (const name of HANDOFF_COOKIES) response.cookies.set(name, '', cleared);
  return response;
}

function failed(args: {
  readonly origin: string;
  readonly secure: boolean;
  readonly error: AuthHandoffFailed;
  readonly returnTo: string;
}): NextResponse {
  const url = new URL(args.returnTo, args.origin);
  url.searchParams.set('auth', args.error.reason);
  return withHandoffCleared(NextResponse.redirect(url), args.secure);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = request.nextUrl.origin;
  const secure = isSecureOrigin(origin);
  const returnTo = safeReturnPath(request.cookies.get(RETURN_COOKIE)?.value);
  const fail = (error: AuthHandoffFailed): NextResponse =>
    failed({ origin, secure, error, returnTo });

  const reading = readSpotifyEnv();
  if (reading.kind === 'demo') return fail(AuthHandoffFailed.notConfigured());

  // Checked first, and before the code is so much as read. §5.3.1
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  if (!statesMatch(expectedState, request.nextUrl.searchParams.get('state'))) {
    return fail(AuthHandoffFailed.stateMismatch());
  }

  if (request.nextUrl.searchParams.get('error') !== null) {
    return fail(AuthHandoffFailed.deniedByUser());
  }

  const code = request.nextUrl.searchParams.get('code');
  const verifier = request.cookies.get(VERIFIER_COOKIE)?.value;
  if (code === null || code.length === 0 || verifier === undefined) {
    return fail(AuthHandoffFailed.missingCode());
  }

  const exchanged = await exchangeCode({
    clientId: reading.env.clientId,
    redirectUri: reading.env.redirectUri,
    code,
    verifier,
  });
  if (!exchanged.ok) return fail(exchanged.error);

  const session = sessionFromGrant({ grant: exchanged.value, nowMs: Date.now() });
  if (session === null) return fail(AuthHandoffFailed.noRefreshToken());

  const sealed = await sealSession(session, reading.env.sessionSecret);
  const response = NextResponse.redirect(new URL(returnTo, origin));
  response.cookies.set(SESSION_COOKIE, sealed, sessionCookieOptions(secure));
  return withHandoffCleared(response, secure);
}
