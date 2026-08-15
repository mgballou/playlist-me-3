// @vitest-environment node
// Web Crypto and the route handlers both want a real Node runtime rather than jsdom's.
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { GET as callback } from '@/app/api/auth/callback/route';
import { STATE_COOKIE, VERIFIER_COOKIE } from '@/lib/auth/cookies';
import {
  VERIFIER_MAX_LENGTH,
  VERIFIER_MIN_LENGTH,
  challengeOf,
  createState,
  createVerifier,
  isValidVerifier,
  statesMatch,
} from '@/lib/auth/pkce';
import { authorizeUrl } from '@/lib/auth/tokens';

/** RFC 7636 appendix B. */
const RFC_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

describe('the challenge', () => {
  it('is the S256 digest of the verifier, base64url without padding', async () => {
    await expect(challengeOf(RFC_VERIFIER)).resolves.toBe(RFC_CHALLENGE);
  });

  it('carries no padding', async () => {
    const challenge = await challengeOf(createVerifier());
    expect(challenge).not.toContain('=');
  });

  it('differs for a verifier that differs by one character', async () => {
    const [a, b] = await Promise.all([
      challengeOf('a'.repeat(43)),
      challengeOf(`${'a'.repeat(42)}b`),
    ]);
    expect(a).not.toBe(b);
  });
});

describe('the verifier', () => {
  it('is at least 43 characters', () => {
    expect(createVerifier().length).toBeGreaterThanOrEqual(VERIFIER_MIN_LENGTH);
  });

  it('is at most 128 characters', () => {
    expect(createVerifier().length).toBeLessThanOrEqual(VERIFIER_MAX_LENGTH);
  });

  it('uses only the unreserved character set', () => {
    expect(isValidVerifier(createVerifier())).toBe(true);
  });

  it('is different every time', () => {
    const minted = new Set(Array.from({ length: 50 }, () => createVerifier()));
    expect(minted.size).toBe(50);
  });

  it('rejects a verifier that is too short', () => {
    expect(isValidVerifier('too-short')).toBe(false);
  });
});

describe('state', () => {
  it('is different every time', () => {
    const minted = new Set(Array.from({ length: 50 }, () => createState()));
    expect(minted.size).toBe(50);
  });

  it('matches itself', () => {
    const state = createState();
    expect(statesMatch(state, state)).toBe(true);
  });

  it('does not match a different value', () => {
    expect(statesMatch(createState(), createState())).toBe(false);
  });

  it('does not match when nothing was stored', () => {
    expect(statesMatch(undefined, 'anything')).toBe(false);
  });

  it('does not match when nothing came back', () => {
    expect(statesMatch(createState(), null)).toBe(false);
  });
});

describe('the authorize URL', () => {
  it('asks for S256', () => {
    const url = new URL(
      authorizeUrl({ clientId: 'id', redirectUri: 'http://x/cb', state: 's', challenge: 'c' }),
    );
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('never carries the verifier', () => {
    const verifier = createVerifier();
    const url = authorizeUrl({
      clientId: 'id',
      redirectUri: 'http://x/cb',
      state: 's',
      challenge: 'c',
    });
    expect(url).not.toContain(verifier);
  });
});

describe('the callback', () => {
  const env = {
    SPOTIFY_CLIENT_ID: 'client-id',
    SESSION_SECRET: 'x'.repeat(40),
    SPOTIFY_REDIRECT_URI: 'http://localhost:3000/api/auth/callback',
  };

  function request(query: string, cookies: Record<string, string>): NextRequest {
    const built = new NextRequest(`http://localhost:3000/api/auth/callback${query}`);
    for (const [name, value] of Object.entries(cookies)) built.cookies.set(name, value);
    return built;
  }

  it('does not exchange the code when state does not match', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('the callback must not reach the network on a state mismatch');
      }),
    );
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);

    const response = await callback(
      request('?code=abc&state=returned', { [STATE_COOKIE]: 'expected', [VERIFIER_COOKIE]: 'v' }),
    );

    expect(new URL(response.headers.get('location') ?? '').searchParams.get('auth')).toBe(
      'stateMismatch',
    );
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('clears the verifier cookie on a mismatch', async () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);

    const response = await callback(
      request('?code=abc&state=returned', { [STATE_COOKIE]: 'expected', [VERIFIER_COOKIE]: 'v' }),
    );

    expect(response.cookies.get(VERIFIER_COOKIE)?.value).toBe('');
    vi.unstubAllEnvs();
  });

  it('sets the verifier cookie httpOnly, so client JavaScript can never read it', async () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const { GET: login } = await import('@/app/api/auth/login/route');

    const response = await login(new NextRequest('http://localhost:3000/api/auth/login'));

    expect(response.cookies.get(VERIFIER_COOKIE)?.httpOnly).toBe(true);
    vi.unstubAllEnvs();
  });

  it('never puts the verifier in the redirect it sends the browser', async () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const { GET: login } = await import('@/app/api/auth/login/route');

    const response = await login(new NextRequest('http://localhost:3000/api/auth/login'));
    const verifier = response.cookies.get(VERIFIER_COOKIE)?.value ?? '';

    expect(response.headers.get('location')).not.toContain(verifier);
    vi.unstubAllEnvs();
  });

  it('runs demo mode rather than failing when nothing is configured', async () => {
    vi.stubEnv('SPOTIFY_CLIENT_ID', '');
    vi.stubEnv('SESSION_SECRET', '');
    const { GET: login } = await import('@/app/api/auth/login/route');

    const response = await login(new NextRequest('http://localhost:3000/api/auth/login'));

    expect(response.headers.get('location')).toContain('connect=unavailable');
    vi.unstubAllEnvs();
  });
});
