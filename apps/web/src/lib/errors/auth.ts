/**
 * The ways the Spotify handoff can fail, as one typed error with a static factory per
 * reason. CLAUDE.md: never `throw new Error('...')` with a hand-written string.
 *
 * Each reason carries the copy a person sees, because the alternative is a route handler
 * inventing wording at three different call sites.
 *
 * **The reasons are a closed set, and `AUTH_FAILURE_REASONS` is what makes that checkable.**
 * A reason travels to the bench as `?auth=<reason>` and the bench has to decide what a value
 * it does not know means — so the list is a value, not only a type, and `isAuthFailureReason`
 * is the one place that decision is made. The messages below never reach a screen: they are
 * what an `Error` carries, and the sentences a person reads live in `errors/connection.ts`.
 */

export const AUTH_FAILURE_REASONS = [
  'notConfigured',
  'deniedByUser',
  'authorizeRefused',
  'stateMismatch',
  'missingCode',
  'refused',
  'malformedGrant',
  'unreachable',
  'noRefreshToken',
] as const;

export type AuthFailureReason = (typeof AUTH_FAILURE_REASONS)[number];

export function isAuthFailureReason(value: string): value is AuthFailureReason {
  return (AUTH_FAILURE_REASONS as readonly string[]).includes(value);
}

export class AuthHandoffFailed extends Error {
  readonly code = 'authHandoffFailed';

  private constructor(
    message: string,
    readonly reason: AuthFailureReason,
  ) {
    super(message);
    this.name = 'AuthHandoffFailed';
  }

  static notConfigured(): AuthHandoffFailed {
    return new AuthHandoffFailed(
      'This copy of the app has no Spotify credentials, so it is running in demo mode.',
      'notConfigured',
    );
  }

  /** `error=access_denied`, and only that: the person saw the consent screen and said no. */
  static deniedByUser(): AuthHandoffFailed {
    return new AuthHandoffFailed('You did not give the app permission.', 'deniedByUser');
  }

  /**
   * Any other `error=` Spotify sends back from the consent screen. It was folded into
   * `deniedByUser` before this, which told people they had declined something they never saw
   * — an invalid client id and a misregistered redirect URI both arrive this way.
   */
  static authorizeRefused(): AuthHandoffFailed {
    return new AuthHandoffFailed(
      'Spotify refused the authorization request, and not because it was declined.',
      'authorizeRefused',
    );
  }

  /** A mismatch aborts without exchanging the code. §5.3.1 */
  static stateMismatch(): AuthHandoffFailed {
    return new AuthHandoffFailed(
      'That sign-in did not come back the way it left. Nothing was exchanged; try again.',
      'stateMismatch',
    );
  }

  static missingCode(): AuthHandoffFailed {
    return new AuthHandoffFailed(
      'Spotify sent us back without an authorization code.',
      'missingCode',
    );
  }

  static refused(status: number): AuthHandoffFailed {
    return new AuthHandoffFailed(
      `Spotify refused the token exchange (${String(status)}).`,
      'refused',
    );
  }

  static malformedGrant(): AuthHandoffFailed {
    return new AuthHandoffFailed(
      'Spotify sent a token response we could not read.',
      'malformedGrant',
    );
  }

  static unreachable(): AuthHandoffFailed {
    return new AuthHandoffFailed('Spotify could not be reached.', 'unreachable');
  }

  static noRefreshToken(): AuthHandoffFailed {
    return new AuthHandoffFailed(
      'Spotify granted access without a refresh token, so the session would end in an hour.',
      'noRefreshToken',
    );
  }
}
