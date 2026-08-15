// @vitest-environment node
// Constructs the live client, which reaches for Node's fetch and Web Crypto.
import { FakeSpotifyClient, LiveSpotifyClient } from '@pm/spotify';
import { describe, expect, it } from 'vitest';

import type { Session } from '@/lib/auth/session';
import { readSpotifyEnv } from '@/lib/env';
import { chooseClient, createTokenProvider } from '@/lib/spotify/factory';
import type { TokenFetch } from '@/lib/auth/tokens';
import { describeConnection } from '@/lib/spotify/connection';

const CONFIGURED = {
  SPOTIFY_CLIENT_ID: 'client-id',
  SESSION_SECRET: 'a-secret-of-at-least-thirty-two-characters',
};

const NOW = 1_770_000_000_000;

const session: Session = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: NOW + 3_600_000,
  scope: '',
};

describe('reading the environment', () => {
  it('is configured when both values are present', () => {
    expect(readSpotifyEnv(CONFIGURED).kind).toBe('configured');
  });

  it('is demo mode with no client id', () => {
    expect(readSpotifyEnv({ SESSION_SECRET: CONFIGURED.SESSION_SECRET }).kind).toBe('demo');
  });

  it('is demo mode with no session secret', () => {
    expect(readSpotifyEnv({ SPOTIFY_CLIENT_ID: 'client-id' }).kind).toBe('demo');
  });

  it('says which value is missing', () => {
    const reading = readSpotifyEnv({});
    expect(reading.kind === 'demo' ? reading.reasons : []).toEqual([
      'noClientId',
      'noSessionSecret',
    ]);
  });

  it('refuses a session secret too short to be one', () => {
    const reading = readSpotifyEnv({ SPOTIFY_CLIENT_ID: 'id', SESSION_SECRET: 'short' });
    expect(reading.kind === 'demo' ? reading.reasons : []).toEqual(['sessionSecretTooShort']);
  });

  it('does not throw on an empty environment', () => {
    expect(() => readSpotifyEnv({})).not.toThrow();
  });
});

describe('choosing a client', () => {
  it('is the fake when nothing is configured', () => {
    const handle = chooseClient({ reading: readSpotifyEnv({}), session: null });
    expect(handle.client).toBeInstanceOf(FakeSpotifyClient);
  });

  it('does not throw when nothing is configured', () => {
    expect(() => chooseClient({ reading: readSpotifyEnv({}), session: null })).not.toThrow();
  });

  it('says demo mode is running because nothing is configured', () => {
    const handle = chooseClient({ reading: readSpotifyEnv({}), session: null });
    expect(handle.mode === 'demo' ? handle.cause : null).toBe('notConfigured');
  });

  it('is the fake when configured but nobody has connected', () => {
    const handle = chooseClient({ reading: readSpotifyEnv(CONFIGURED), session: null });
    expect(handle.client).toBeInstanceOf(FakeSpotifyClient);
  });

  it('says demo mode is running because there is no session', () => {
    const handle = chooseClient({ reading: readSpotifyEnv(CONFIGURED), session: null });
    expect(handle.mode === 'demo' ? handle.cause : null).toBe('noSession');
  });

  it('is the live client when configured and connected', () => {
    const handle = chooseClient({ reading: readSpotifyEnv(CONFIGURED), session });
    expect(handle.client).toBeInstanceOf(LiveSpotifyClient);
  });

  it('is the fake when a client id is set but the secret is too short', () => {
    const reading = readSpotifyEnv({ SPOTIFY_CLIENT_ID: 'id', SESSION_SECRET: 'short' });
    expect(chooseClient({ reading, session }).client).toBeInstanceOf(FakeSpotifyClient);
  });
});

describe('what the crown says', () => {
  it('announces demo mode', () => {
    const handle = chooseClient({ reading: readSpotifyEnv({}), session: null });
    expect(describeConnection(handle).label).toBe('demo mode');
  });

  it('says the data is invented', () => {
    const handle = chooseClient({ reading: readSpotifyEnv({}), session: null });
    expect(describeConnection(handle).notice).toContain('invented');
  });

  it('offers the next step when only a connection is missing', () => {
    const handle = chooseClient({ reading: readSpotifyEnv(CONFIGURED), session: null });
    expect(describeConnection(handle).nextStep).toContain('Connect Spotify');
  });

  it('says connected when it is', () => {
    const handle = chooseClient({ reading: readSpotifyEnv(CONFIGURED), session });
    expect(describeConnection(handle).mode).toBe('live');
  });
});

describe('the token provider', () => {
  const env = {
    clientId: 'client-id',
    sessionSecret: CONFIGURED.SESSION_SECRET,
    redirectUri: 'http://x/cb',
  };
  const nearlyExpired: Session = { ...session, expiresAt: NOW + 1000 };

  function counting(): { readonly calls: () => number; readonly fetchImpl: TokenFetch } {
    let calls = 0;
    return {
      calls: () => calls,
      fetchImpl: async () => {
        calls += 1;
        return {
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'access-2', token_type: 'Bearer', expires_in: 3600 }),
        };
      },
    };
  }

  it('does not refresh while the token is fresh', async () => {
    const counter = counting();
    const provider = createTokenProvider({
      env,
      session,
      writeSession: undefined,
      fetchImpl: counter.fetchImpl,
      now: () => NOW,
    });

    await provider();

    expect(counter.calls()).toBe(0);
  });

  it('refreshes ahead of expiry rather than after it', async () => {
    const counter = counting();
    const provider = createTokenProvider({
      env,
      session: nearlyExpired,
      writeSession: undefined,
      fetchImpl: counter.fetchImpl,
      now: () => NOW,
    });

    await expect(provider()).resolves.toBe('access-2');
  });

  it('refreshes once even when many requests ask at the same time', async () => {
    const counter = counting();
    const provider = createTokenProvider({
      env,
      session: nearlyExpired,
      writeSession: undefined,
      fetchImpl: counter.fetchImpl,
      now: () => NOW,
    });

    await Promise.all([provider(), provider(), provider(), provider()]);

    expect(counter.calls()).toBe(1);
  });

  it('writes back a session that keeps the existing refresh token', async () => {
    const counter = counting();
    const written: Session[] = [];
    const provider = createTokenProvider({
      env,
      session: nearlyExpired,
      writeSession: (next) => {
        written.push(next);
      },
      fetchImpl: counter.fetchImpl,
      now: () => NOW,
    });

    await provider();

    expect(written[0]?.refreshToken).toBe('refresh-1');
  });
});
