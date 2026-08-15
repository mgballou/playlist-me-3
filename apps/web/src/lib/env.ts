/**
 * The whole environment surface, read in one place. Spec §5.3.1: the app needs exactly two
 * values, `SPOTIFY_CLIENT_ID` and `SESSION_SECRET`, and **without them it runs in demo mode
 * rather than failing** (§5.1).
 *
 * So nothing here throws. A missing value is an answer — `demo`, with the reasons attached so
 * the crown can say which one is missing rather than shrugging (ui-sensibility §2.7, §12.1).
 */

export type EnvSource = Readonly<Record<string, string | undefined>>;

/** `openssl rand -base64 32` gives 44 characters. Anything under this is not a secret. */
export const MIN_SESSION_SECRET_LENGTH = 32;

/** Matches the redirect URI the README tells you to register. */
export const DEFAULT_REDIRECT_URI = 'http://localhost:3000/api/auth/callback';

export type SpotifyEnv = {
  readonly clientId: string;
  readonly sessionSecret: string;
  readonly redirectUri: string;
};

export type DemoReason = 'noClientId' | 'noSessionSecret' | 'sessionSecretTooShort';

export type EnvReading =
  | { readonly kind: 'configured'; readonly env: SpotifyEnv }
  | { readonly kind: 'demo'; readonly reasons: readonly DemoReason[] };

function trimmed(source: EnvSource, key: string): string {
  return (source[key] ?? '').trim();
}

export function readSpotifyEnv(source: EnvSource = process.env): EnvReading {
  const clientId = trimmed(source, 'SPOTIFY_CLIENT_ID');
  const sessionSecret = trimmed(source, 'SESSION_SECRET');

  const reasons: DemoReason[] = [];
  if (clientId.length === 0) reasons.push('noClientId');
  if (sessionSecret.length === 0) reasons.push('noSessionSecret');
  else if (sessionSecret.length < MIN_SESSION_SECRET_LENGTH) reasons.push('sessionSecretTooShort');

  if (reasons.length > 0) return { kind: 'demo', reasons };

  const redirectUri = trimmed(source, 'SPOTIFY_REDIRECT_URI');
  return {
    kind: 'configured',
    env: {
      clientId,
      sessionSecret,
      redirectUri: redirectUri.length === 0 ? DEFAULT_REDIRECT_URI : redirectUri,
    },
  };
}

/** One line a person can act on, for each way the environment falls short. */
export function describeDemoReason(reason: DemoReason): string {
  switch (reason) {
    case 'noClientId':
      return 'No SPOTIFY_CLIENT_ID is set.';
    case 'noSessionSecret':
      return 'No SESSION_SECRET is set.';
    case 'sessionSecretTooShort':
      return `SESSION_SECRET needs ${String(MIN_SESSION_SECRET_LENGTH)} characters or more.`;
  }
}

/** Cookies go `Secure` off localhost and only off localhost, so `pnpm dev` still works. */
export function isSecureOrigin(origin: string): boolean {
  return origin.startsWith('https://');
}
