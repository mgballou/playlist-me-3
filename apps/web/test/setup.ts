import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/** Vitest runs without globals, so Testing Library's own auto-cleanup never registers. */
afterEach(() => {
  cleanup();
});

/**
 * jsdom ships no `matchMedia`, and the app reads exactly two media queries: the color-scheme
 * preference (ui-sensibility §4.2) and the single collapse threshold (§7). Both answer "no"
 * here, which is the light, uncollapsed default — the interesting cases are asserted against
 * the pure resolution functions rather than against a fake matcher.
 */
class TestMediaQueryList extends EventTarget implements MediaQueryList {
  readonly matches = false;
  onchange: ((this: MediaQueryList, event: MediaQueryListEvent) => unknown) | null = null;

  constructor(readonly media: string) {
    super();
  }

  addListener(): void {}
  removeListener(): void {}
}

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList => new TestMediaQueryList(query);
}
