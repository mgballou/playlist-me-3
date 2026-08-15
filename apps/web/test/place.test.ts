import { trackId } from '@pm/core';
import { describe, expect, it } from 'vitest';

import { indexOfCursor, nextCursor } from '@/lib/deck/cursor';
import { makePool, makeTrack } from './support/pool';

/**
 * §2.5: **a cursor keys on identity, never on position**, and a filter that shrinks a list
 * clamps the cursor rather than resetting it. A deck that re-rolls must not jump.
 */

const deck = makePool(10);

describe('a cursor keys on identity', () => {
  it('follows its track when the deck is re-ordered', () => {
    const shuffled = [...deck].reverse();
    const settled = nextCursor({ cursor: deck[3]!.id, previousIndex: 3, tracks: shuffled });
    expect(settled.trackId).toBe(deck[3]!.id);
  });

  it('reports the new index rather than the old one', () => {
    const shuffled = [...deck].reverse();
    const settled = nextCursor({ cursor: deck[3]!.id, previousIndex: 3, tracks: shuffled });
    expect(settled.index).toBe(6);
  });

  it('stays put when nothing changed', () => {
    const settled = nextCursor({ cursor: deck[4]!.id, previousIndex: 4, tracks: deck });
    expect(settled.index).toBe(4);
  });

  it('survives a re-roll that kept the track', () => {
    const rerolled = [makeTrack(99), ...deck.slice(0, 5)];
    const settled = nextCursor({ cursor: deck[2]!.id, previousIndex: 2, tracks: rerolled });
    expect(settled.trackId).toBe(deck[2]!.id);
  });
});

describe('a cursor clamps rather than resets', () => {
  it('lands on the slot it was looking at when its track is gone', () => {
    const settled = nextCursor({ cursor: trackId('gone'), previousIndex: 6, tracks: deck });
    expect(settled.index).toBe(6);
  });

  it('clamps to the end when the deck got shorter', () => {
    const shorter = deck.slice(0, 3);
    const settled = nextCursor({ cursor: trackId('gone'), previousIndex: 8, tracks: shorter });
    expect(settled.index).toBe(2);
  });

  it('does not reset to the top when the deck got shorter', () => {
    const shorter = deck.slice(0, 3);
    const settled = nextCursor({ cursor: trackId('gone'), previousIndex: 8, tracks: shorter });
    expect(settled.index).not.toBe(0);
  });

  it('has nothing to point at when the deck is empty', () => {
    const settled = nextCursor({ cursor: deck[0]!.id, previousIndex: 0, tracks: [] });
    expect(settled.trackId).toBeNull();
  });

  it('takes up a cursor when there was none', () => {
    const settled = nextCursor({ cursor: null, previousIndex: 2, tracks: deck });
    expect(settled.trackId).toBe(deck[2]!.id);
  });
});

describe('finding the cursor', () => {
  it('reports where it is', () => {
    expect(indexOfCursor(deck, deck[7]!.id)).toBe(7);
  });

  it('reports nothing when there is no cursor', () => {
    expect(indexOfCursor(deck, null)).toBe(-1);
  });

  it('reports nothing when the track has gone', () => {
    expect(indexOfCursor(deck, trackId('gone'))).toBe(-1);
  });
});
