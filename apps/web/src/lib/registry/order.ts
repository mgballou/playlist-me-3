/**
 * Ordering strategies, in words. §12: the enumerated kind carries its own label, and no
 * screen writes one of its own.
 */

import type { OrderStrategy } from '@pm/core';

export type OrderDefinition = {
  readonly strategy: OrderStrategy;
  readonly label: string;
  readonly summary: string;
};

export const ORDER_DEFINITIONS: Readonly<Record<OrderStrategy, OrderDefinition>> = {
  shuffle: {
    strategy: 'shuffle',
    label: 'Shuffled',
    summary: 'No order at all, from the seed.',
  },
  byRelease: {
    strategy: 'byRelease',
    label: 'By release',
    summary: 'Oldest first, so the playlist runs forward in time.',
  },
  artistClustered: {
    strategy: 'artistClustered',
    label: 'Clustered by artist',
    summary: 'An act’s tracks sit together.',
  },
  sourceInterleaved: {
    strategy: 'sourceInterleaved',
    label: 'Interleaved by source',
    summary: 'One from each source in turn, so no source dominates the opening.',
  },
};
