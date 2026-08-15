'use client';

/**
 * Which key is pressed in, and the two things §7.1 asks of it beyond holding a value: the
 * selected section **survives a reload**, and each section **keeps its own scroll position**.
 *
 * The state is here rather than in the workbench on purpose. The workbench is the recipe, the
 * pool and the build; which section a phone is showing is none of those, and putting it there
 * would have every module re-render on a key press for the sake of a value only the frame
 * reads.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { loadSection, saveSection } from '../persistence/recipes';
import { browserStore } from '../persistence/store';
import type { KeyValueStore } from '../persistence/store';
import { createScrollMemory } from './scroll-memory';
import type { ScrollMemory } from './scroll-memory';
import { DEFAULT_SECTION, sectionForKey, stepSection } from './sections';
import type { SectionId } from './sections';

export type Section = {
  readonly selected: SectionId;
  /** False for the first tick, while the held section is being read back. §2.5 */
  readonly restored: boolean;
  /** Where each section was left. One scroller, four numbers. */
  readonly scroll: ScrollMemory;
  select(section: SectionId): void;
  /** One key along, clamped at both ends. What a swipe and an arrow key both call. */
  step(step: -1 | 1): void;
  /** Returns true when the key was one of the tablist's, so the caller can spend the event. */
  press(key: string): boolean;
};

export function useSection(): Section {
  const [selected, setSelected] = useState<SectionId>(DEFAULT_SECTION);
  const [restored, setRestored] = useState(false);

  const storeRef = useRef<KeyValueStore | null>(null);
  const store = (): KeyValueStore => (storeRef.current ??= browserStore());

  const scrollRef = useRef<ScrollMemory | null>(null);
  scrollRef.current ??= createScrollMemory();
  const scroll = scrollRef.current;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const held = await loadSection(store()).catch(() => null);
      if (cancelled) return;
      if (held !== null) setSelected(held);
      setRestored(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!restored) return;
    void saveSection(store(), selected).catch(() => {
      // Storage refused. The keys still work; they just forget on reload. §2.7
    });
  }, [restored, selected]);

  const select = useCallback((section: SectionId) => {
    setSelected(section);
  }, []);

  const step = useCallback(
    (by: -1 | 1) => {
      setSelected(stepSection(selected, by));
    },
    [selected],
  );

  const press = useCallback(
    (key: string) => {
      const next = sectionForKey(selected, key);
      if (next === null) return false;
      setSelected(next);
      return true;
    },
    [selected],
  );

  return { selected, restored, scroll, select, step, press };
}
