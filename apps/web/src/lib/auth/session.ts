/**
 * The session: Spotify's tokens, sealed in an encrypted cookie. Spec §5.3, §5.3.1.
 *
 * Two decisions here are load-bearing.
 *
 * **Encrypted, not signed.** A signed cookie is readable by anyone holding it; these are
 * bearer tokens for someone's music account. `jose`'s JWE with `dir` + `A256GCM` over a key
 * derived from `SESSION_SECRET` means the cookie is opaque even to whoever copies it.
 *
 * **Refresh tokens may or may not rotate.** Spotify's response "might not include a new
 * refresh token" — when it does not, the existing one keeps working. `applyRefresh` is the
 * one place that decides, it is pure, and it is tested, because handling only the rotating
 * case is the bug that logs everyone out an hour in.
 */

import { EncryptJWT, jwtDecrypt } from 'jose';
import { z } from 'zod';

import type { TokenGrant } from './tokens';

export type Session = {
  readonly accessToken: string;
  readonly refreshToken: string;
  /** Epoch milliseconds. Absolute, so a cookie that sat in a closed laptop is still right. */
  readonly expiresAt: number;
  /** The scopes Spotify actually granted, which need not be the scopes we asked for. */
  readonly scope: string;
};

/**
 * Refresh this far ahead of expiry. Spec §5.3.1: refresh happens server-side, ahead of
 * expiry, on demand rather than on a timer — so this is the "ahead of" and a request is the
 * "on demand".
 */
export const REFRESH_MARGIN_MS = 60_000;

const claimsSchema = z.object({
  at: z.string().min(1),
  rt: z.string().min(1),
  xa: z.number().finite(),
  sc: z.string(),
});

const ENCRYPTION = { alg: 'dir', enc: 'A256GCM' } as const;

/** A256GCM wants exactly 32 bytes, and a passphrase is not one. */
async function keyOf(secret: string): Promise<Uint8Array> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return new Uint8Array(digest);
}

export async function sealSession(
  session: Session,
  secret: string,
  nowMs: number = Date.now(),
): Promise<string> {
  const key = await keyOf(secret);
  return new EncryptJWT({
    at: session.accessToken,
    rt: session.refreshToken,
    xa: session.expiresAt,
    sc: session.scope,
  })
    .setProtectedHeader(ENCRYPTION)
    .setIssuedAt(Math.floor(nowMs / 1000))
    .setExpirationTime('30d')
    .encrypt(key);
}

/**
 * Returns null rather than throwing. A cookie signed with a rotated secret, a tampered
 * cookie and no cookie at all are the same answer to the only question the app asks: is
 * there a session. Demo mode is the fallback in every case (§5.1).
 */
export async function openSession(sealed: string, secret: string): Promise<Session | null> {
  try {
    const key = await keyOf(secret);
    const { payload } = await jwtDecrypt(sealed, key, { contentEncryptionAlgorithms: ['A256GCM'] });
    const claims = claimsSchema.safeParse(payload);
    if (!claims.success) return null;
    return {
      accessToken: claims.data.at,
      refreshToken: claims.data.rt,
      expiresAt: claims.data.xa,
      scope: claims.data.sc,
    };
  } catch {
    return null;
  }
}

export function isExpired(session: Session, nowMs: number): boolean {
  return session.expiresAt <= nowMs;
}

export function needsRefresh(session: Session, nowMs: number): boolean {
  return session.expiresAt - nowMs <= REFRESH_MARGIN_MS;
}

/** A grant plus the session it renews. The refresh token survives its own absence. §5.3.1 */
export function applyRefresh(args: {
  readonly session: Session;
  readonly grant: TokenGrant;
  readonly nowMs: number;
}): Session {
  const { session, grant, nowMs } = args;
  return {
    accessToken: grant.accessToken,
    refreshToken: grant.refreshToken ?? session.refreshToken,
    expiresAt: nowMs + grant.expiresInSeconds * 1000,
    scope: grant.scope ?? session.scope,
  };
}

/** The first session, from the authorization code exchange. There, a refresh token is required. */
export function sessionFromGrant(args: {
  readonly grant: TokenGrant;
  readonly nowMs: number;
}): Session | null {
  const { grant, nowMs } = args;
  if (grant.refreshToken === null) return null;
  return {
    accessToken: grant.accessToken,
    refreshToken: grant.refreshToken,
    expiresAt: nowMs + grant.expiresInSeconds * 1000,
    scope: grant.scope ?? '',
  };
}
