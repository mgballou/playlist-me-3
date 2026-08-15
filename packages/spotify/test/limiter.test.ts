import { describe, expect, it } from 'vitest';

import { createLimiter } from '../src/index';

type Deferred = { readonly promise: Promise<void>; readonly resolve: () => void };

function deferred(): Deferred {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((settle) => {
    resolve = () => {
      settle();
    };
  });
  return { promise, resolve };
}

describe('createLimiter', () => {
  it('runs a task and returns its value', async () => {
    const limiter = createLimiter(2);
    await expect(limiter.run(() => Promise.resolve('done'))).resolves.toBe('done');
  });

  it('never runs more than the bound at once', async () => {
    const limiter = createLimiter(3);
    const gates = Array.from({ length: 9 }, deferred);
    let inFlight = 0;
    let peak = 0;

    const runs = gates.map((gate) =>
      limiter.run(async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await gate.promise;
        inFlight -= 1;
      }),
    );

    for (const gate of gates) {
      await Promise.resolve();
      gate.resolve();
      await Promise.resolve();
    }
    await Promise.all(runs);

    expect(peak).toBe(3);
  });

  it('reports what is waiting for a slot', async () => {
    const limiter = createLimiter(1);
    const gate = deferred();
    const first = limiter.run(() => gate.promise);
    const second = limiter.run(() => Promise.resolve());

    expect(limiter.waiting).toBe(1);
    gate.resolve();
    await Promise.all([first, second]);
  });

  it('reports what is in flight', async () => {
    const limiter = createLimiter(2);
    const gate = deferred();
    const running = limiter.run(() => gate.promise);

    expect(limiter.inFlight).toBe(1);
    gate.resolve();
    await running;
  });

  it('frees the slot a failed task held', async () => {
    const limiter = createLimiter(1);
    await expect(limiter.run(() => Promise.reject(new Error('no')))).rejects.toThrow('no');
    await expect(limiter.run(() => Promise.resolve('after'))).resolves.toBe('after');
  });

  it('runs everything that was queued', async () => {
    const limiter = createLimiter(2);
    const order: number[] = [];
    await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        limiter.run(() => {
          order.push(index);
          return Promise.resolve();
        }),
      ),
    );
    expect(order).toHaveLength(6);
  });

  it('treats a bound below one as one', async () => {
    const limiter = createLimiter(0);
    const gate = deferred();
    const first = limiter.run(() => gate.promise);
    const second = limiter.run(() => Promise.resolve());

    expect(limiter.inFlight).toBe(1);
    gate.resolve();
    await Promise.all([first, second]);
  });
});
