/**
 * PKCE, per spec §5.3.1.
 *
 * `code_challenge_method` is `S256`. The verifier is 43–128 characters of CSPRNG output and
 * the challenge is its SHA-256, base64url-encoded without padding. There is no client secret
 * — the token exchange sends `client_id` and `code_verifier` instead, which is why setup asks
 * for exactly one Spotify value.
 *
 * **Nothing in this file may run in the browser.** The verifier is minted server-side and
 * held in a short-lived httpOnly cookie; it never reaches client JavaScript.
 */

/** RFC 7636 §4.1. */
export const VERIFIER_MIN_LENGTH = 43;
export const VERIFIER_MAX_LENGTH = 128;

/** 64 random bytes base64url-encode to 86 characters, comfortably inside the range. */
const VERIFIER_BYTES = 64;

/** 32 random bytes is 43 characters of `state`, which is plenty to bind one attempt. */
const STATE_BYTES = 32;

export const CHALLENGE_METHOD = 'S256';

export type RandomBytes = (length: number) => Uint8Array;

/** Web Crypto, which Node, the edge runtime and the browser all have. */
export const cryptoRandomBytes: RandomBytes = (length) =>
  globalThis.crypto.getRandomValues(new Uint8Array(length));

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function createVerifier(randomBytes: RandomBytes = cryptoRandomBytes): string {
  return base64UrlEncode(randomBytes(VERIFIER_BYTES));
}

export function createState(randomBytes: RandomBytes = cryptoRandomBytes): string {
  return base64UrlEncode(randomBytes(STATE_BYTES));
}

/** The unreserved character set RFC 7636 allows, and the length range it requires. */
export function isValidVerifier(verifier: string): boolean {
  if (verifier.length < VERIFIER_MIN_LENGTH || verifier.length > VERIFIER_MAX_LENGTH) return false;
  return /^[A-Za-z0-9\-._~]+$/.test(verifier);
}

export async function challengeOf(verifier: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Constant-time-ish comparison for `state`. The values are public, so this is belt rather
 * than braces — but a length-leaking `===` on a security check is the kind of thing that
 * reads as carelessness even when it is harmless.
 */
export function statesMatch(expected: string | undefined, returned: string | null): boolean {
  if (expected === undefined || returned === null) return false;
  if (expected.length === 0 || expected.length !== returned.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) {
    difference |= expected.charCodeAt(i) ^ returned.charCodeAt(i);
  }
  return difference === 0;
}
