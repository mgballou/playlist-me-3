import { describe, expect, it } from 'vitest';

import { CALLBACK_PATH, readSpotifyEnv, redirectUriFor } from '@/lib/env';

const CONFIGURED = {
  SPOTIFY_CLIENT_ID: 'client-id',
  SESSION_SECRET: 'a-secret-of-at-least-thirty-two-characters',
};

function envOf(source: Record<string, string>) {
  const reading = readSpotifyEnv(source);
  if (reading.kind === 'demo') throw new Error('expected a configured reading');
  return reading.env;
}

describe('reading the redirect URI', () => {
  it('keeps SPOTIFY_REDIRECT_URI exactly as it was set', () => {
    const env = envOf({
      ...CONFIGURED,
      SPOTIFY_REDIRECT_URI: 'https://set.example/api/auth/callback',
    });
    expect(env.configuredRedirectUri).toBe('https://set.example/api/auth/callback');
  });

  it('trims whitespace around the value', () => {
    const env = envOf({
      ...CONFIGURED,
      SPOTIFY_REDIRECT_URI: '  https://set.example/api/auth/callback  ',
    });
    expect(env.configuredRedirectUri).toBe('https://set.example/api/auth/callback');
  });

  it('is empty when the variable is unset, rather than guessing a host', () => {
    expect(envOf(CONFIGURED).configuredRedirectUri).toBe('');
  });
});

describe('resolving the redirect URI against an origin', () => {
  it('uses the configured value when there is one', () => {
    const env = envOf({
      ...CONFIGURED,
      SPOTIFY_REDIRECT_URI: 'https://set.example/api/auth/callback',
    });
    expect(redirectUriFor(env, 'https://deployed.example')).toBe(
      'https://set.example/api/auth/callback',
    );
  });

  it('falls back to the origin the request arrived on, not localhost', () => {
    expect(redirectUriFor(envOf(CONFIGURED), 'https://playlist-me.vercel.app')).toBe(
      'https://playlist-me.vercel.app/api/auth/callback',
    );
  });

  it('still resolves to localhost when that is where the app is running', () => {
    expect(redirectUriFor(envOf(CONFIGURED), 'http://localhost:3000')).toBe(
      'http://localhost:3000/api/auth/callback',
    );
  });

  it('names the callback route once, and the route handler lives at that path', () => {
    expect(CALLBACK_PATH).toBe('/api/auth/callback');
  });
});
