/**
 * One section's place in the stage. Above the threshold it is a plain wrapper and the four of
 * them are on screen at once, which is strictly better (§7.1). Below it, it is a tabpanel:
 * one is shown and the other three are **inert, not merely hidden** (§7), so someone moving
 * through by keyboard can never land inside a panel they cannot see.
 *
 * `data-selected` is on the element in **every** layout, and that is not redundant with
 * `hidden`. The pre-paint script stamps `data-collapsed` before React exists (§7), so the
 * stylesheet can show exactly one section on the very first paint; `hidden` and `inert` are
 * React's, and they arrive at hydration to carry the same fact to the accessibility tree.
 * Without the attribute a phone would paint all four sections stacked — the exact failure
 * §7.1 is about — and then collapse them a moment later.
 */

import type { ReactNode } from 'react';

import { sectionKeyId, sectionPanelId } from '@/lib/layout/sections';
import type { SectionId } from '@/lib/layout/sections';

export type PanelProps = {
  readonly section: SectionId;
  /** The one decision, shared. `lib/layout/collapse.ts` is the only place a width appears. */
  readonly collapsed: boolean;
  readonly selected: boolean;
  readonly children: ReactNode;
};

export function Panel({ section, collapsed, selected, children }: PanelProps) {
  const away = collapsed && !selected;

  return (
    <div
      id={sectionPanelId(section)}
      className="panel"
      data-section={section}
      data-selected={selected ? 'true' : 'false'}
      hidden={away}
      inert={away}
      // A panel is only a tabpanel where there are keys to label it with. Above the threshold
      // there is no tablist, and a tabpanel without one is a lie to a screen reader.
      {...(collapsed ? { role: 'tabpanel', 'aria-labelledby': sectionKeyId(section) } : {})}
    >
      {children}
    </div>
  );
}
