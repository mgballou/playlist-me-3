/**
 * Typed errors for the client boundary. CLAUDE.md: every error is a class with a static
 * factory and a stable code — never `throw new Error('...')` with a hand-written string.
 *
 * The distinction that matters most here is `RateLimited` versus `QuotaExceeded` (§5.2).
 * One resolves in seconds and is worth retrying; the other does not resolve today and
 * retrying it burns the shared per-developer-account budget for everyone on the app.
 */

/** Every error this package throws carries a stable machine-readable code. */
export abstract class SpotifyError extends Error {
  abstract readonly code: string;

  /** True when calling again shortly could plausibly work. */
  abstract readonly retryable: boolean;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** 429 with a `Retry-After`. Resolves in seconds. §5.2 */
export class RateLimited extends SpotifyError {
  readonly code = 'rateLimited';
  readonly retryable = true;

  private constructor(
    message: string,
    readonly retryAfterSeconds: number,
    readonly attempts: number,
  ) {
    super(message);
  }

  static retryAfter(seconds: number): RateLimited {
    return new RateLimited(`Spotify asked us to wait ${String(seconds)}s.`, seconds, 0);
  }

  static givingUp(seconds: number, attempts: number): RateLimited {
    return new RateLimited(
      `Still rate limited after ${String(attempts)} attempts; last wait was ${String(seconds)}s.`,
      seconds,
      attempts,
    );
  }
}

/**
 * The per-developer-account quota is spent. Distinct from `RateLimited` on purpose: this
 * one is never retried in a loop, because the loop cannot fix it and the attempts count
 * against the same budget. §5.2
 */
export class QuotaExceeded extends SpotifyError {
  readonly code = 'quotaExceeded';
  readonly retryable = false;

  private constructor(
    message: string,
    readonly reason: string,
  ) {
    super(message);
  }

  static developerQuota(): QuotaExceeded {
    return new QuotaExceeded(
      "This Spotify app's daily request quota is spent. It resets, but not today.",
      'QUOTA_EXCEEDED',
    );
  }

  static reported(reason: string): QuotaExceeded {
    return new QuotaExceeded(`Spotify refused the request: ${reason}.`, reason);
  }
}

/** 401, or no token at all. The session needs refreshing or rebuilding. */
export class AuthFailed extends SpotifyError {
  readonly code = 'authFailed';
  readonly retryable = false;

  private constructor(message: string) {
    super(message);
  }

  static tokenRejected(): AuthFailed {
    return new AuthFailed('Spotify rejected the access token.');
  }

  static noToken(): AuthFailed {
    return new AuthFailed('No access token was available.');
  }

  static missingScope(scope: string): AuthFailed {
    return new AuthFailed(`This session is missing the ${scope} permission.`);
  }
}

/** 404. Ordinary: a recipe can outlive the thing it names. */
export class NotFound extends SpotifyError {
  readonly code = 'notFound';
  readonly retryable = false;

  private constructor(
    message: string,
    readonly endpoint: string,
  ) {
    super(message);
  }

  static at(endpoint: string): NotFound {
    return new NotFound(`Spotify has nothing at ${endpoint}.`, endpoint);
  }
}

/** Any other unhappy status, or a transport failure. */
export class RequestFailed extends SpotifyError {
  readonly code = 'requestFailed';

  private constructor(
    message: string,
    readonly endpoint: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
  }

  static status(endpoint: string, status: number): RequestFailed {
    return new RequestFailed(
      `${endpoint} answered ${String(status)}.`,
      endpoint,
      status,
      status >= 500,
    );
  }

  static network(endpoint: string, detail: string): RequestFailed {
    return new RequestFailed(`${endpoint} could not be reached: ${detail}.`, endpoint, 0, true);
  }

  static aborted(endpoint: string): RequestFailed {
    return new RequestFailed(`${endpoint} was cancelled.`, endpoint, 0, false);
  }
}

/**
 * The response parsed as JSON but did not match the schema. Raw zod errors never leave
 * this package — callers get an endpoint and a field path they can report.
 */
export class MalformedResponse extends SpotifyError {
  readonly code = 'malformedResponse';
  readonly retryable = false;

  private constructor(
    message: string,
    readonly endpoint: string,
    readonly path: string,
  ) {
    super(message);
  }

  static at(endpoint: string, path: string): MalformedResponse {
    const where = path.length > 0 ? `"${path}"` : 'the body';
    return new MalformedResponse(
      `${endpoint} sent something unexpected in ${where}.`,
      endpoint,
      path,
    );
  }

  static notJson(endpoint: string): MalformedResponse {
    return new MalformedResponse(`${endpoint} did not send JSON.`, endpoint, '');
  }
}

/**
 * We were about to send a request Spotify would refuse. Caught before it costs anything,
 * because every one of these limits is documented in §5.1.1.
 */
export class InvalidRequest extends SpotifyError {
  readonly code = 'invalidRequest';
  readonly retryable = false;

  private constructor(message: string) {
    super(message);
  }

  static searchLimit(limit: number, max: number): InvalidRequest {
    return new InvalidRequest(
      `Search takes at most ${String(max)} per page; got ${String(limit)}.`,
    );
  }

  static searchOffset(offset: number, max: number): InvalidRequest {
    return new InvalidRequest(
      `Search cannot look past result ${String(max)}; got offset ${String(offset)}.`,
    );
  }

  static pageLimit(limit: number, max: number): InvalidRequest {
    return new InvalidRequest(
      `That endpoint takes at most ${String(max)} per page; got ${String(limit)}.`,
    );
  }

  static tooManyUris(count: number, max: number): InvalidRequest {
    return new InvalidRequest(
      `Adding items takes ${String(max)} URIs per request; got ${String(count)}.`,
    );
  }

  static coverTooLarge(bytes: number, max: number): InvalidRequest {
    return new InvalidRequest(
      `A cover must be ${String(max)} bytes or less once encoded; got ${String(bytes)}.`,
    );
  }

  static emptyBatch(): InvalidRequest {
    return new InvalidRequest('There is nothing to add to the playlist.');
  }
}
