// @vitest-environment node
// `jose` wants Node's Web Crypto rather than jsdom's partial one.
import { describe, expect, it } from 'vitest';

import type { Session } from '@/lib/auth/session';
import {
  REFRESH_MARGIN_MS,
  applyRefresh,
  isExpired,
  needsRefresh,
  openSession,
  sealSession,
  sessionFromGrant,
} from '@/lib/auth/session';
import type { TokenGrant } from '@/lib/auth/tokens';
import { parseGrant } from '@/lib/auth/tokens';

const SECRET = 'a-secret-of-at-least-thirty-two-characters';
const NOW = 1_770_000_000_000;

const session: Session = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: NOW + 3_600_000,
  scope: 'user-library-read user-top-read',
};

describe('the sealed cookie', () => {
  it('round-trips the access token', async () => {
    const opened = await openSession(await sealSession(session, SECRET, NOW), SECRET);
    expect(opened?.accessToken).toBe('access-1');
  });

  it('round-trips the refresh token', async () => {
    const opened = await openSession(await sealSession(session, SECRET, NOW), SECRET);
    expect(opened?.refreshToken).toBe('refresh-1');
  });

  it('round-trips the expiry', async () => {
    const opened = await openSession(await sealSession(session, SECRET, NOW), SECRET);
    expect(opened?.expiresAt).toBe(session.expiresAt);
  });

  it('round-trips the granted scope', async () => {
    const opened = await openSession(await sealSession(session, SECRET, NOW), SECRET);
    expect(opened?.scope).toBe(session.scope);
  });

  it('is opaque — the token does not appear in the cookie', async () => {
    const sealed = await sealSession(session, SECRET, NOW);
    expect(sealed).not.toContain('access-1');
  });

  it('refuses a different secret', async () => {
    const sealed = await sealSession(session, SECRET, NOW);
    await expect(openSession(sealed, `${SECRET}-rotated`)).resolves.toBeNull();
  });

  it('refuses a tampered cookie', async () => {
    const sealed = await sealSession(session, SECRET, NOW);
    await expect(openSession(`${sealed}x`, SECRET)).resolves.toBeNull();
  });

  it('refuses something that is not a cookie at all', async () => {
    await expect(openSession('not-a-jwe', SECRET)).resolves.toBeNull();
  });
});

describe('expiry', () => {
  it('is not expired before the hour is up', () => {
    expect(isExpired(session, NOW)).toBe(false);
  });

  it('is expired at the moment it expires', () => {
    expect(isExpired(session, session.expiresAt)).toBe(true);
  });

  it('does not want a refresh with an hour left', () => {
    expect(needsRefresh(session, NOW)).toBe(false);
  });

  it('wants a refresh inside the margin', () => {
    expect(needsRefresh(session, session.expiresAt - REFRESH_MARGIN_MS + 1)).toBe(true);
  });

  it('wants a refresh once expired', () => {
    expect(needsRefresh(session, session.expiresAt + 1)).toBe(true);
  });
});

describe('refreshing', () => {
  const rotating: TokenGrant = {
    accessToken: 'access-2',
    expiresInSeconds: 3600,
    refreshToken: 'refresh-2',
    scope: null,
  };

  const nonRotating: TokenGrant = {
    accessToken: 'access-2',
    expiresInSeconds: 3600,
    refreshToken: null,
    scope: null,
  };

  it('reads a response that omits the refresh token as null', () => {
    expect(parseGrant({ access_token: 'a', token_type: 'Bearer', expires_in: 3600 })).toEqual({
      accessToken: 'a',
      expiresInSeconds: 3600,
      refreshToken: null,
      scope: null,
    });
  });

  it('takes the new access token', () => {
    const refreshed = applyRefresh({ session, grant: rotating, nowMs: NOW });
    expect(refreshed.accessToken).toBe('access-2');
  });

  it('takes a rotated refresh token when one is sent', () => {
    const refreshed = applyRefresh({ session, grant: rotating, nowMs: NOW });
    expect(refreshed.refreshToken).toBe('refresh-2');
  });

  it('keeps the existing refresh token when none is sent', () => {
    const refreshed = applyRefresh({ session, grant: nonRotating, nowMs: NOW });
    expect(refreshed.refreshToken).toBe('refresh-1');
  });

  it('keeps the existing scope when none is sent', () => {
    const refreshed = applyRefresh({ session, grant: nonRotating, nowMs: NOW });
    expect(refreshed.scope).toBe(session.scope);
  });

  it('moves expiry forward from now, not from the old expiry', () => {
    const refreshed = applyRefresh({ session, grant: nonRotating, nowMs: NOW });
    expect(refreshed.expiresAt).toBe(NOW + 3_600_000);
  });

  it('survives a day of non-rotating refreshes', () => {
    let current = session;
    for (let hour = 0; hour < 24; hour += 1) {
      current = applyRefresh({
        session: current,
        grant: nonRotating,
        nowMs: NOW + hour * 3_600_000,
      });
    }
    expect(current.refreshToken).toBe('refresh-1');
  });
});

describe('the first session', () => {
  it('is built from a grant that carries a refresh token', () => {
    const grant: TokenGrant = {
      accessToken: 'a',
      expiresInSeconds: 3600,
      refreshToken: 'r',
      scope: 'user-top-read',
    };
    expect(sessionFromGrant({ grant, nowMs: NOW })?.refreshToken).toBe('r');
  });

  it('refuses a grant with no refresh token, rather than expiring in an hour', () => {
    const grant: TokenGrant = {
      accessToken: 'a',
      expiresInSeconds: 3600,
      refreshToken: null,
      scope: null,
    };
    expect(sessionFromGrant({ grant, nowMs: NOW })).toBeNull();
  });
});

describe('parsing a grant', () => {
  it('refuses a response with no access token', () => {
    expect(parseGrant({ token_type: 'Bearer', expires_in: 3600 })).toBeNull();
  });

  it('refuses a response with no expiry', () => {
    expect(parseGrant({ access_token: 'a', token_type: 'Bearer' })).toBeNull();
  });
});
