/**
 * The ways the Spotify handoff can fail, as one typed error with a static factory per
 * reason. CLAUDE.md: never `throw new Error('...')` with a hand-written string.
 *
 * Each reason carries the copy a person sees, because the alternative is a route handler
 * inventing wording at three different call sites.
 */

export type AuthFailureReason =
  | 'notConfigured'
  | 'deniedByUser'
  | 'stateMismatch'
  | 'missingCode'
  | 'refused'
  | 'malformedGrant'
  | 'unreachable'
  | 'noRefreshToken';

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

  static deniedByUser(): AuthHandoffFailed {
    return new AuthHandoffFailed('You did not give the app permission.', 'deniedByUser');
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
