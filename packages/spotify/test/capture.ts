/** Returns what a call threw, so a test can assert on a class with a private constructor. */
export function captureError(run: () => unknown): unknown {
  try {
    run();
    return undefined;
  } catch (error) {
    return error;
  }
}
