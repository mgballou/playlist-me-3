/**
 * Typed errors and the Result type the engine hands back where failure is ordinary
 * rather than exceptional.
 *
 * CLAUDE.md: "Errors are typed classes with a static factory". Nothing here is
 * constructed with a hand-written string at the call site.
 */

/** Every error this package throws carries a stable machine-readable code. */
export abstract class CoreError extends Error {
  abstract readonly code: string;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** A branded id was handed a value that cannot be one. */
export class InvalidId extends CoreError {
  readonly code = 'invalidId';

  private constructor(
    message: string,
    readonly idKind: string,
  ) {
    super(message);
  }

  static empty(idKind: string): InvalidId {
    return new InvalidId(`${idKind} cannot be blank.`, idKind);
  }

  static notAString(idKind: string): InvalidId {
    return new InvalidId(`${idKind} must be a string.`, idKind);
  }
}

/** A dial was handed something outside 0..1. */
export class InvalidDial extends CoreError {
  readonly code = 'invalidDial';

  private constructor(
    message: string,
    readonly value: number,
  ) {
    super(message);
  }

  static outOfRange(value: number): InvalidDial {
    return new InvalidDial(`A dial runs 0..1; got ${String(value)}.`, value);
  }

  static notFinite(value: number): InvalidDial {
    return new InvalidDial(`A dial must be a finite number; got ${String(value)}.`, value);
  }
}

/** The seeded generator was called in a way it cannot answer. */
export class RngMisuse extends CoreError {
  readonly code = 'rngMisuse';

  private constructor(message: string) {
    super(message);
  }

  static invalidSeed(seed: number): RngMisuse {
    return new RngMisuse(`A seed must be a finite number; got ${String(seed)}.`);
  }

  static emptyPool(): RngMisuse {
    return new RngMisuse('Cannot pick from an empty list.');
  }

  static weightMismatch(itemCount: number, weightCount: number): RngMisuse {
    return new RngMisuse(`Got ${String(itemCount)} items but ${String(weightCount)} weights.`);
  }

  static invalidBound(maxExclusive: number): RngMisuse {
    return new RngMisuse(`int() needs a positive integer bound; got ${String(maxExclusive)}.`);
  }
}

/** A shared recipe string could not be read back. Returned, never thrown. See §6. */
export class DecodeError extends CoreError {
  readonly code = 'decodeError';

  private constructor(
    message: string,
    readonly reason: DecodeErrorReason,
    readonly detail: string,
  ) {
    super(message);
  }

  static notBase64(): DecodeError {
    return new DecodeError('That is not a recipe link.', 'notBase64', '');
  }

  static notJson(): DecodeError {
    return new DecodeError('That recipe link is damaged.', 'notJson', '');
  }

  static wrongVersion(found: unknown): DecodeError {
    return new DecodeError(
      `That recipe was written by a different version (${String(found)}).`,
      'wrongVersion',
      String(found),
    );
  }

  static malformed(field: string): DecodeError {
    return new DecodeError(
      `That recipe link is missing or has a bad "${field}".`,
      'malformed',
      field,
    );
  }
}

export type DecodeErrorReason = 'notBase64' | 'notJson' | 'wrongVersion' | 'malformed';

/** A discriminated union grew a member and a switch did not. */
export class UnreachableCase extends CoreError {
  readonly code = 'unreachableCase';

  private constructor(message: string) {
    super(message);
  }

  static of(value: string): UnreachableCase {
    return new UnreachableCase(`Unhandled case: ${value}.`);
  }
}

/**
 * Exhaustiveness guard for discriminated unions. `noUnusedLocals` rules out the
 * `const _never: never = x` idiom, so the check is a call instead.
 */
export function unreachable(value: never): never {
  throw UnreachableCase.of(JSON.stringify(value) ?? 'undefined');
}

/** Success or a typed failure, for the paths where throwing would be wrong. */
export type Result<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
