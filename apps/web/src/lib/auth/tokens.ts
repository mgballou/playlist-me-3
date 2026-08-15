/**
 * Talking to `accounts.spotify.com`. Spec §5.3.1.
 *
 * Both calls send `client_id` and no client secret, because PKCE does not use one. The
 * exchange sends `code_verifier`; the refresh does not.
 *
 * `refresh_token` is **optional in the response**, and the type says so. Everything
 * downstream is forced to decide what happens when it is absent, which is the point —
 * `applyRefresh` keeps the existing one.
 */

import type { Result } from '@pm/core';
import { err, ok } from '@pm/core';
import { z } from 'zod';

import { AuthHandoffFailed } from '../errors/auth';
import { CHALLENGE_METHOD } from './pkce';
import { SCOPE_PARAMETER } from './scopes';

export const SPOTIFY_ACCOUNTS_BASE = 'https://accounts.spotify.com';
export const AUTHORIZE_URL = `${SPOTIFY_ACCOUNTS_BASE}/authorize`;
export const TOKEN_URL = `${SPOTIFY_ACCOUNTS_BASE}/api/token`;

export type TokenGrant = {
  readonly accessToken: string;
  readonly expiresInSeconds: number;
  /** Null when Spotify chose not to rotate it. Keep the one you have. §5.3.1 */
  readonly refreshToken: string | null;
  /** Null when the response omitted it, which means "unchanged", not "none". */
  readonly scope: string | null;
};

/** The slice of `fetch` these two calls use, named so a test can stub it. */
export type TokenFetch = (
  url: string,
  init: {
    readonly method: string;
    readonly headers: Record<string, string>;
    readonly body: string;
  },
) => Promise<{ readonly ok: boolean; readonly status: number; json(): Promise<unknown> }>;

const grantSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string(),
  expires_in: z.number().finite().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
});

export function parseGrant(body: unknown): TokenGrant | null {
  const parsed = grantSchema.safeParse(body);
  if (!parsed.success) return null;
  return {
    accessToken: parsed.data.access_token,
    expiresInSeconds: parsed.data.expires_in,
    refreshToken: parsed.data.refresh_token ?? null,
    scope: parsed.data.scope ?? null,
  };
}

export function authorizeUrl(args: {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly state: string;
  readonly challenge: string;
}): string {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    state: args.state,
    scope: SCOPE_PARAMETER,
    code_challenge_method: CHALLENGE_METHOD,
    code_challenge: args.challenge,
  });
  return `${AUTHORIZE_URL}?${query.toString()}`;
}

const platformFetch: TokenFetch = (url, init) =>
  fetch(url, { method: init.method, headers: init.headers, body: init.body });

async function post(
  form: URLSearchParams,
  fetchImpl: TokenFetch,
): Promise<Result<TokenGrant, AuthHandoffFailed>> {
  let response: Awaited<ReturnType<TokenFetch>>;
  try {
    response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
  } catch {
    return err(AuthHandoffFailed.unreachable());
  }

  if (!response.ok) return err(AuthHandoffFailed.refused(response.status));

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return err(AuthHandoffFailed.malformedGrant());
  }

  const grant = parseGrant(body);
  return grant === null ? err(AuthHandoffFailed.malformedGrant()) : ok(grant);
}

export function exchangeCode(args: {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly code: string;
  readonly verifier: string;
  readonly fetchImpl?: TokenFetch | undefined;
}): Promise<Result<TokenGrant, AuthHandoffFailed>> {
  return post(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code: args.code,
      redirect_uri: args.redirectUri,
      client_id: args.clientId,
      code_verifier: args.verifier,
    }),
    args.fetchImpl ?? platformFetch,
  );
}

export function refreshGrant(args: {
  readonly clientId: string;
  readonly refreshToken: string;
  readonly fetchImpl?: TokenFetch | undefined;
}): Promise<Result<TokenGrant, AuthHandoffFailed>> {
  return post(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: args.refreshToken,
      client_id: args.clientId,
    }),
    args.fetchImpl ?? platformFetch,
  );
}
