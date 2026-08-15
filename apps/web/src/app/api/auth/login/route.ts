/**
 * Start the Authorization Code + PKCE handoff. Spec §5.3.1.
 *
 * The verifier and `state` are minted here, on the server, and leave only inside httpOnly
 * cookies. Nothing in this route puts either one in a URL fragment, a body, or a cookie the
 * browser can read.
 *
 * Missing credentials are not an error: the app is in demo mode and says so (§5.1), so this
 * sends the person back to the bench with a reason rather than throwing a 500 at them.
 */

import { NextResponse, type NextRequest } from 'next/server';

import {
  STATE_COOKIE,
  VERIFIER_COOKIE,
  RETURN_COOKIE,
  handoffCookieOptions,
  safeReturnPath,
} from '@/lib/auth/cookies';
import { challengeOf, createState, createVerifier } from '@/lib/auth/pkce';
import { authorizeUrl } from '@/lib/auth/tokens';
import { isSecureOrigin, readSpotifyEnv } from '@/lib/env';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = request.nextUrl.origin;
  const reading = readSpotifyEnv();

  if (reading.kind === 'demo') {
    return NextResponse.redirect(new URL('/?connect=unavailable', origin));
  }

  const verifier = createVerifier();
  const state = createState();
  const challenge = await challengeOf(verifier);
  const returnTo = safeReturnPath(request.nextUrl.searchParams.get('returnTo'));

  const response = NextResponse.redirect(
    authorizeUrl({
      clientId: reading.env.clientId,
      redirectUri: reading.env.redirectUri,
      state,
      challenge,
    }),
  );

  const options = handoffCookieOptions(isSecureOrigin(origin));
  response.cookies.set(VERIFIER_COOKIE, verifier, options);
  response.cookies.set(STATE_COOKIE, state, options);
  response.cookies.set(RETURN_COOKIE, returnTo, options);
  return response;
}
