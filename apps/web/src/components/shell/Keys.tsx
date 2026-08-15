'use client';

/**
 * The keys — the fifth fixed part a narrow frame gains (§7.1). Below the threshold a console
 * does not scroll; it has **mode keys**, and pressing one changes the page.
 *
 * Three rules do all the work here, and each is easy to break by reaching for the obvious:
 *
 * - **Every key carries its own count, and that is what earns the design.** `BLOCK −68` is
 *   legible while you are looking at the deck, so the causal link §2.3 exists to protect
 *   survives the section being off-screen. A key showing only a name would be a worse version
 *   of a scroll. The numbers come from `lib/layout/sections`, which is also where the heading
 *   bands get theirs, so a key and its section cannot disagree.
 * - **The selected key is pressed in, by height, never by colour.** Navigation is structural
 *   and the accent means _act_ (§3), so position is marked the way a real key marks it: it
 *   sinks into its own well while the others stay proud. The amber lamp confirms it, because
 *   amber reports (§5 rule 4) — and the lamp sits beside the key's own name, which is the
 *   word that keeps colour from being the only carrier.
 * - **The keys never rebuild.** They are outside the stage, they mount once, and changing
 *   section only moves an attribute on them.
 *
 * There is no native element for one-of-four-panels, so §13's "use the platform's own
 * primitive" resolves to the ARIA tabs pattern: `tablist` / `tab` / `tabpanel`, a roving
 * tabindex, and arrow keys along the row.
 */

import { useEffect, useRef } from 'react';

import { Led } from '@/components/primitives/Led';
import {
  SECTIONS,
  SECTION_DEFINITIONS,
  sectionCounts,
  sectionKeyId,
  sectionPanelId,
} from '@/lib/layout/sections';
import type { SectionId } from '@/lib/layout/sections';
import { useWorkbench } from '@/lib/workbench/use-workbench';

export type KeysProps = {
  readonly selected: SectionId;
  readonly onSelect: (section: SectionId) => void;
  /** Returns true when the key belonged to the tablist, so the event can be spent. */
  readonly onKey: (key: string) => boolean;
};

export function Keys({ selected, onSelect, onKey }: KeysProps) {
  const { recipe, result } = useWorkbench();
  const counts = sectionCounts(recipe, result);

  /**
   * A roving tabindex is only half the pattern; the other half is that the newly selected key
   * takes the focus, or an arrow press moves the selection out from under the person's own
   * cursor. It moves focus **only while the keys already have it**, so pressing a key with a
   * pointer or arriving from a swipe does not steal it.
   */
  const rowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const row = rowRef.current;
    if (row === null || !row.contains(document.activeElement)) return;
    row.querySelector<HTMLButtonElement>(`#${sectionKeyId(selected)}`)?.focus();
  }, [selected]);

  return (
    <div
      className="keys"
      role="tablist"
      aria-label="Sections"
      aria-orientation="horizontal"
      ref={rowRef}
    >
      {SECTIONS.map((section) => {
        const definition = SECTION_DEFINITIONS[section];
        const live = section === selected;

        return (
          <button
            key={section}
            type="button"
            id={sectionKeyId(section)}
            role="tab"
            className="key"
            aria-selected={live}
            aria-controls={sectionPanelId(section)}
            tabIndex={live ? 0 : -1}
            onClick={() => {
              onSelect(section);
            }}
            onKeyDown={(event) => {
              if (onKey(event.key)) event.preventDefault();
            }}
          >
            <Led lit={live} label={definition.label} />
            <span className="key__count numeric">{counts[section]}</span>
          </button>
        );
      })}
    </div>
  );
}
