'use client';

/**
 * The frame. §7: **the frame persists; one region changes.** Four regions — crown, rack,
 * deck, ledger — laid out once, here, and never swapped out by a route.
 *
 * Two structural decisions live in this component and nowhere else:
 *
 * - **z-order comes from the `--z-*` tokens.** The crown sits at `--z-rack`, the ledger at
 *   `--z-ledger` above it, and an overlay or a takeover slots between and above them without
 *   any component inventing a number.
 * - **Collapse is one decision, shared.** `useCollapseAttribute` keeps the root's
 *   `data-collapsed` true to the single query in `lib/layout/collapse.ts`, and the stylesheet
 *   selects on that attribute rather than naming a width of its own. The rack and the deck
 *   cannot disagree about whether there is room, because there is only one answer.
 */

import type { ReactNode } from 'react';

import { useCollapseAttribute } from '@/lib/layout/use-collapse';
import type { Connection } from '@/lib/spotify/connection';
import { WorkbenchProvider } from '@/lib/workbench/use-workbench';
import { Crown } from './Crown';
import { Deck } from './Deck';
import { Ledger } from './Ledger';
import { Rack } from './Rack';

export type FrameProps = {
  readonly connection: Connection;
  /** For a takeover or an overlay, which sit above the frame at `--z-takeover`. */
  readonly children?: ReactNode;
};

function FrameBody({ connection, children }: FrameProps) {
  useCollapseAttribute();

  return (
    <div className="frame">
      <Crown connection={connection} />
      <main className="stage">
        <Rack />
        <Deck />
      </main>
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
