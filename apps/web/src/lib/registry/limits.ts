/**
 * Why a source stopped reading, in words — **one registry, every reader** (§12).
 *
 * A source that ran out of matches and a source that ran into a ceiling both arrive in the
 * pool as a number, and only one of them is the whole story. Four ceilings can stop a read
 * and they are not the same kind of fact: one is Spotify's and cannot be moved, three are
 * budgets this app chose. Saying which, and saying what the person can do about it, is §2.7
 * applied to a report rather than to a screen.
 *
 * The copy lives here and not in the deck because the bench will want the same sentences
 * against the source row, and two components writing their own is how one app ends up
 * saying two different things about one state.
 */

import { unreachable } from '@pm/core';
import type { SourceReport } from '@pm/spotify';

export type LimitKind = 'offsetCeiling' | 'trackBudget' | 'albumBudget' | 'pageBudget';

export type LimitCopy = {
  readonly kind: LimitKind;
  /** What stopped the read, named. */
  readonly summary: string;
  /** What the person can do about it. Null where nothing they can press would. */
  readonly remedy: string | null;
};

/**
 * Spotify's ceiling first, because it is the only one nobody here can raise, then ours from
 * the coarsest to the finest. A source can hit more than one, and it says so.
 */
export const LIMIT_ORDER: readonly LimitKind[] = [
  'offsetCeiling',
  'trackBudget',
  'albumBudget',
  'pageBudget',
];

export function limitCopy(kind: LimitKind): LimitCopy {
  switch (kind) {
    case 'offsetCeiling':
      return {
        kind,
        summary: 'stopped at Spotify’s 1,000-result ceiling.',
        remedy: 'There is no page past it — narrow the query to change what comes back.',
      };
    case 'trackBudget':
      return {
        kind,
        summary: 'filled its track budget, and the search had more.',
        remedy: 'Narrow the query, or let another source cover the rest.',
      };
    case 'albumBudget':
      return {
        kind,
        summary: 'filled its album budget, so albums that matched went unread.',
        remedy: 'Narrow the query, or add a second source over the same ground.',
      };
    case 'pageBudget':
      return {
        kind,
        summary: 'stopped at its page budget with a page still waiting.',
        remedy: 'Narrow the query so what you want comes back on an earlier page.',
      };
    default:
      return unreachable(kind);
  }
}

/** Every ceiling this source ran into, in `LIMIT_ORDER`. Empty when it read to the end. */
export function limitsHit(report: SourceReport): readonly LimitKind[] {
  const hit: Record<LimitKind, boolean> = {
    offsetCeiling: report.hitOffsetCeiling,
    trackBudget: report.hitTrackLimit,
    albumBudget: report.hitAlbumLimit,
    pageBudget: report.hitPageLimit,
  };
  return LIMIT_ORDER.filter((kind) => hit[kind]);
}
