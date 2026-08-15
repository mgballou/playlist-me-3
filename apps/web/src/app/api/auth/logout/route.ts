/**
 * Drop the session. POST rather than GET, because it changes state and a link prefetch must
 * never sign someone out.
 *
 * Disconnecting is not a dead end: the app keeps working on the fake client afterwards, and
 * the crown says demo mode (§2.7, §12.1).
 */

import { NextResponse, type NextRequest } from 'next/server';

import {
  HANDOFF_COOKIES,
  SESSION_COOKIE,
  clearedCookieOptions,
  safeReturnPath,
} from '@/lib/auth/cookies';
import { isSecureOrigin } from '@/lib/env';

export function POST(request: NextRequest): NextResponse {
  const origin = request.nextUrl.origin;
  const secure = isSecureOrigin(origin);
  const returnTo = safeReturnPath(request.nextUrl.searchParams.get('returnTo'));

  const response = NextResponse.redirect(new URL(returnTo, origin), { status: 303 });
  const cleared = clearedCookieOptions(secure);
  response.cookies.set(SESSION_COOKIE, '', cleared);
  for (const name of HANDOFF_COOKIES) response.cookies.set(name, '', cleared);
  return response;
}
