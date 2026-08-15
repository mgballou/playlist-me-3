'use client';

/**
 * The frame. §7: **the frame persists; one region changes.** Four regions — crown, rack,
 * deck, ledger — laid out once, here, and never swapped out by a route.
 *
 * Three structural decisions live in this component and nowhere else:
 *
 * - **z-order comes from the `--z-*` tokens.** The crown sits at `--z-rack`, the ledger at
 *   `--z-ledger` above it, and an overlay or a takeover slots between and above them without
 *   any component inventing a number.
 * - **Collapse is one decision, shared.** `useCollapseAttribute` keeps the root's
 *   `data-collapsed` true to the single query in `lib/layout/collapse.ts`, and the stylesheet
 *   selects on that attribute rather than naming a width of its own. The rack and the deck
 *   cannot disagree about whether there is room, because there is only one answer.
 * - **Below that threshold the frame is paged, not stacked** (§7.1). It gains a fifth fixed
 *   part — the keys — and the same four panels become four sections, one shown at a time.
 *   Nothing is rebuilt to do it: every panel stays mounted, so the deck keeps building while
 *   it is off-screen and its key keeps reporting what the tuning did.
 *
 * The stage is the one scroller below the threshold, which is what makes a section's place
 * one number to remember (`lib/layout/scroll-memory.ts`) rather than four scroll containers
 * to chase.
 */

import {
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import { useCollapseAttribute } from '@/lib/layout/use-collapse';
import { useSection } from '@/lib/layout/use-section';
import { ownsGesture, swipeStep } from '@/lib/layout/swipe';
import type { Connection } from '@/lib/spotify/connection';
import { WorkbenchProvider } from '@/lib/workbench/use-workbench';
import { Crown } from './Crown';
import { Deck } from './Deck';
import { Keys } from './Keys';
import { Ledger } from './Ledger';
import { Panel } from './Panel';
import { Rack } from './Rack';

export type FrameProps = {
  readonly connection: Connection;
  /** For a takeover or an overlay, which sit above the frame at `--z-takeover`. */
  readonly children?: ReactNode;
};

function FrameBody({ connection, children }: FrameProps) {
  const collapsed = useCollapseAttribute();
  const { selected, scroll, select, step, press } = useSection();

  const stageRef = useRef<HTMLElement | null>(null);
  const gestureRef = useRef<{ readonly x: number; readonly y: number } | null>(null);

  // The arriving section goes back where it was left. Before paint, so nobody sees the top
  // of a deck they were forty slots down. §2.5
  useLayoutEffect(() => {
    scroll.restore(selected, stageRef.current);
  }, [selected, scroll]);

  const startGesture = (event: ReactPointerEvent<HTMLElement>): void => {
    // A mouse drag across a panel is a text selection, not a swipe.
    if (event.pointerType === 'mouse' || ownsGesture(event.target)) {
      gestureRef.current = null;
      return;
    }
    gestureRef.current = { x: event.clientX, y: event.clientY };
  };

  const endGesture = (event: ReactPointerEvent<HTMLElement>): void => {
    const start = gestureRef.current;
    gestureRef.current = null;
    if (start === null) return;
    const towards = swipeStep({ dx: event.clientX - start.x, dy: event.clientY - start.y });
    if (towards !== null) step(towards);
  };

  return (
    <div className="frame">
      <Crown connection={connection} />

      <main
        className="stage"
        ref={stageRef}
        onScroll={(event) => {
          scroll.remember(selected, event.currentTarget);
        }}
        {...(collapsed
          ? {
              onPointerDown: startGesture,
              onPointerUp: endGesture,
              onPointerCancel: () => {
                gestureRef.current = null;
              },
            }
          : {})}
      >
        <Rack collapsed={collapsed} selected={selected} />

        <Panel section="deck" collapsed={collapsed} selected={selected === 'deck'}>
          <Deck />
        </Panel>
      </main>

      {collapsed ? <Keys selected={selected} onSelect={select} onKey={press} /> : null}

      <Ledger connection={connection} />
      {children}
    </div>
  );
}

export function Frame(props: FrameProps) {
  return (
    <WorkbenchProvider>
      <FrameBody {...props} />
    </WorkbenchProvider>
  );
}
