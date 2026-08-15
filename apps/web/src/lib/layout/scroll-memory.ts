/**
 * **Each section keeps its own scroll position, restored on return** (§7.1, §2.5). Coming
 * back to a recipe must not also mean finding your place in it again — and coming back to the
 * deck after tuning a dial must not mean scrolling forty slots a second time.
 *
 * One scroller does the work: below the threshold the stage scrolls within itself, so a
 * section's place is one number and the memory is four of them. The element is behind a
 * `{ scrollTop }` shape rather than an `HTMLElement` so the whole thing is assertable without
 * a layout engine — jsdom reports every scroll position as zero, which would make a test
 * written against a real element pass while doing nothing.
 */

import type { SectionId } from './sections';

export type Scrollable = { scrollTop: number };

export type ScrollMemory = {
  /** Called on every scroll of the live section, so the place is already held when it leaves. */
  remember(section: SectionId, from: Scrollable | null): void;
  recall(section: SectionId): number;
  /** Puts the arriving section back where it was. Somewhere unvisited starts at the top. */
  restore(section: SectionId, to: Scrollable | null): void;
};

export function createScrollMemory(): ScrollMemory {
  const held = new Map<SectionId, number>();

  return {
    remember(section, from) {
      if (from === null) return;
      held.set(section, from.scrollTop);
    },
    recall(section) {
      return held.get(section) ?? 0;
    },
    restore(section, to) {
      if (to === null) return;
      to.scrollTop = held.get(section) ?? 0;
    },
  };
}
