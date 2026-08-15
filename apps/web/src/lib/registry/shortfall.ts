/**
 * Why a build fell short, in words — **one registry, two readers** (§12).
 *
 * §2.3 asks that a build which cannot reach its target *name the binding constraint*, and
 * §2.7 asks that it *name what happens next*. Those are two different sentences for the same
 * fact, and the ledger wants the first while the deck wants both. Writing them in the two
 * components is how a codebase ends up saying two different things about one state.
 */

import type { ShortfallReason } from '@pm/core';
import { unreachable } from '@pm/core';

export type ShortfallCopy = {
  /** The constraint, named. Short enough for the ledger's one line. */
  readonly summary: string;
  /** What would fix it. Null where nothing the person can press would. */
  readonly remedy: string | null;
};

export function shortfallCopy(reason: ShortfallReason): ShortfallCopy {
  switch (reason) {
    case 'emptyPool':
      return {
        summary: 'the blocks removed everything the sources found.',
        remedy: 'Drop a block, or add another source.',
      };
    case 'poolExhausted':
      return {
        summary: 'the pool ran out before the target.',
        remedy: 'Widen a source, or ask for fewer tracks.',
      };
    case 'maxPerArtist':
      return {
        summary: 'the per-artist limit is binding.',
        remedy: 'Raise it, or add another source.',
      };
    case 'maxPerArtistBelowOne':
      return {
        summary: 'the per-artist limit is below one, so nothing can be chosen.',
        remedy: 'Raise it to at least one.',
      };
    default:
      return unreachable(reason);
  }
}
