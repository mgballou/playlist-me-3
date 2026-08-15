/**
 * A concurrency limiter, written out rather than pulled in. Spec §5.2: the batch
 * endpoints were removed in 2026-02, so resolving 300 tracks' artists means up to 300
 * requests, and firing all of them at once is the fastest way to meet a 429.
 *
 * Twenty lines of queue is cheaper than a dependency, and it lets a test assert the
 * bound directly rather than trusting a package to hold it.
 */

export type Limiter = {
  /** Runs `task` once a slot is free. Resolves or rejects with whatever the task does. */
  run<T>(task: () => Promise<T>): Promise<T>;
  /** Tasks running right now. */
  readonly inFlight: number;
  /** Tasks waiting for a slot. */
  readonly waiting: number;
};

export const DEFAULT_CONCURRENCY = 4;

export function createLimiter(maxConcurrent: number = DEFAULT_CONCURRENCY): Limiter {
  const bound = Math.max(1, Math.trunc(maxConcurrent));
  const queue: (() => void)[] = [];
  let inFlight = 0;

  const release = (): void => {
    inFlight -= 1;
    const next = queue.shift();
    if (next !== undefined) next();
  };

  const acquire = (): Promise<void> => {
    if (inFlight < bound) {
      inFlight += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      queue.push(() => {
        inFlight += 1;
        resolve();
      });
    });
  };

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
    get inFlight() {
      return inFlight;
    },
    get waiting() {
      return queue.length;
    },
  };
}
