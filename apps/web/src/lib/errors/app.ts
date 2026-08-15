/**
 * The two failures that are the app's own fault rather than Spotify's. Typed classes with
 * static factories, per CLAUDE.md — a hand-written `new Error('...')` is how a codebase ends
 * up matching on message strings.
 */

export class AppMisuse extends Error {
  readonly code = 'appMisuse';

  private constructor(message: string) {
    super(message);
    this.name = 'AppMisuse';
  }

  static missingProvider(hook: string, provider: string): AppMisuse {
    return new AppMisuse(`${hook} must be called inside <${provider}>.`);
  }
}

/** IndexedDB refused. Ordinary in a private window, and never fatal — see `browserStore`. */
export class StorageFailed extends Error {
  readonly code = 'storageFailed';

  private constructor(message: string) {
    super(message);
    this.name = 'StorageFailed';
  }

  static request(detail: string): StorageFailed {
    return new StorageFailed(`Local storage refused a request: ${detail}`);
  }

  static open(): StorageFailed {
    return new StorageFailed('Local storage could not be opened.');
  }
}
