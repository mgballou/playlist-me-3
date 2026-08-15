import { COLLAPSE_QUERY } from '@/lib/layout/collapse';

/**
 * jsdom has no viewport to measure, so the collapse answer arrives the only way it can: by
 * answering the one query the app asks. Everything downstream — the keys, the panels, the
 * inert branch — reads `COLLAPSE_QUERY` through `useIsCollapsed`, so answering it here is
 * answering it everywhere, and no test invents a width of its own.
 */

class StubMediaQueryList extends EventTarget implements MediaQueryList {
  onchange: ((this: MediaQueryList, event: MediaQueryListEvent) => unknown) | null = null;

  constructor(
    readonly media: string,
    readonly matches: boolean,
  ) {
    super();
  }

  addListener(): void {}
  removeListener(): void {}
}

function answer(matched: readonly string[]): void {
  window.matchMedia = (query: string): MediaQueryList =>
    new StubMediaQueryList(query, matched.includes(query));
}

/** Below the threshold: the frame is paged, and the keys exist. §7.1 */
export function narrowViewport(): void {
  answer([COLLAPSE_QUERY]);
}

/** Above it: all four regions at once, and no keys at all. §7.1 */
export function wideViewport(): void {
  answer([]);
}
