import { describe, expect, it } from 'vitest';

import {
  FAMILIARITY_WEIGHTS,
  MIN_WEIGHT,
  dial,
  dialWeight,
  familiarityOf,
  prominenceOf,
  score,
} from '../src/index';
import { artistAt, makeContext, makePool, makeShape, makeTrack } from './fixtures/index';

const pool = makePool();

describe('familiarityOf', () => {
  const track = makeTrack({ id: 'tr-known', artists: [artistAt(1)] });

  it('is zero for a stranger', () => {
    expect(familiarityOf(track, makeContext())).toBe(FAMILIARITY_WEIGHTS.unknown);
  });

  it('is highest for a top track', () => {
    expect(familiarityOf(track, makeContext({ topTrackIds: ['tr-known'] }))).toBe(
      FAMILIARITY_WEIGHTS.top,
    );
  });

  it('is high for a saved track', () => {
    expect(familiarityOf(track, makeContext({ libraryTrackIds: ['tr-known'] }))).toBe(
      FAMILIARITY_WEIGHTS.library,
    );
  });

  it('is middling for a recently heard track', () => {
    expect(familiarityOf(track, makeContext({ recentlyHeardTrackIds: ['tr-known'] }))).toBe(
      FAMILIARITY_WEIGHTS.recentlyHeard,
    );
  });

  it('is low for a track by a followed artist', () => {
    expect(familiarityOf(track, makeContext({ followedArtistIds: [artistAt(1).id] }))).toBe(
      FAMILIARITY_WEIGHTS.followedArtist,
    );
  });

  it('takes the strongest signal when several apply', () => {
    const context = makeContext({ topTrackIds: ['tr-known'], libraryTrackIds: ['tr-known'] });
    expect(familiarityOf(track, context)).toBe(FAMILIARITY_WEIGHTS.top);
  });
});

describe('prominenceOf', () => {
  it('is highest for an opener', () => {
    expect(prominenceOf(makeTrack({ trackNumber: 1, albumTrackCount: 14 }))).toBe(1);
  });

  it('is lowest for a closer', () => {
    expect(prominenceOf(makeTrack({ trackNumber: 14, albumTrackCount: 14 }))).toBe(0);
  });

  it('sits halfway in the middle', () => {
    expect(prominenceOf(makeTrack({ trackNumber: 6, albumTrackCount: 11 }))).toBeCloseTo(0.5);
  });

  it('treats a standalone single as obvious', () => {
    expect(prominenceOf(makeTrack({ trackNumber: 1, albumTrackCount: 1 }))).toBe(1);
  });

  it('survives a track number past the album size', () => {
    expect(prominenceOf(makeTrack({ trackNumber: 40, albumTrackCount: 10 }))).toBe(0);
  });

  it('survives a zero album size', () => {
    expect(prominenceOf(makeTrack({ trackNumber: 1, albumTrackCount: 0 }))).toBe(1);
  });
});

describe('dialWeight', () => {
  it('is neutral at 0.5 for a low signal', () => {
    expect(dialWeight(0, dial(0.5))).toBe(1);
  });

  it('is neutral at 0.5 for a high signal', () => {
    expect(dialWeight(1, dial(0.5))).toBe(1);
  });

  it('is neutral at 0.5 for a middling signal', () => {
    expect(dialWeight(0.5, dial(0.5))).toBe(1);
  });

  it('doubles a matching signal at the top of the dial', () => {
    expect(dialWeight(1, dial(1))).toBe(2);
  });

  it('zeroes an opposing signal at the top of the dial', () => {
    expect(dialWeight(0, dial(1))).toBe(0);
  });

  it('doubles an opposing signal at the bottom of the dial', () => {
    expect(dialWeight(0, dial(0))).toBe(2);
  });

  it('zeroes a matching signal at the bottom of the dial', () => {
    expect(dialWeight(1, dial(0))).toBe(0);
  });
});

describe('score', () => {
  it('returns one entry per track', () => {
    const scored = score({ tracks: pool, shape: makeShape(), context: makeContext() });
    expect(scored.length).toBe(pool.length);
  });

  it('gives every track the same weight when both dials are neutral', () => {
    const scored = score({ tracks: pool, shape: makeShape(), context: makeContext() });
    expect(new Set(scored.map((entry) => entry.weight))).toEqual(new Set([1]));
  });

  it('never returns a weight of zero', () => {
    const shape = makeShape({ familiarity: dial(1), depth: dial(1) });
    const scored = score({ tracks: pool, shape, context: makeContext() });
    expect(scored.every((entry) => entry.weight >= MIN_WEIGHT)).toBe(true);
  });

  it('suppresses a known track when the familiarity dial is at zero', () => {
    const track = makeTrack({ id: 'tr-known' });
    const shape = makeShape({ familiarity: dial(0) });
    const context = makeContext({ topTrackIds: ['tr-known'] });
    const scored = score({ tracks: [track], shape, context });
    expect(scored[0]?.weight).toBe(MIN_WEIGHT);
  });

  it('promotes a known track when the familiarity dial is at one', () => {
    const track = makeTrack({ id: 'tr-known' });
    const shape = makeShape({ familiarity: dial(1) });
    const context = makeContext({ topTrackIds: ['tr-known'] });
    const scored = score({ tracks: [track], shape, context });
    expect(scored[0]?.weight).toBe(2);
  });

  it('promotes a stranger when the familiarity dial is at zero', () => {
    const shape = makeShape({ familiarity: dial(0) });
    const scored = score({ tracks: [makeTrack()], shape, context: makeContext() });
    expect(scored[0]?.weight).toBe(2);
  });

  it('promotes an opener when the depth dial is at one', () => {
    const shape = makeShape({ depth: dial(1) });
    const track = makeTrack({ trackNumber: 1, albumTrackCount: 12 });
    const scored = score({ tracks: [track], shape, context: makeContext() });
    expect(scored[0]?.weight).toBe(2);
  });

  it('promotes a closer when the depth dial is at zero', () => {
    const shape = makeShape({ depth: dial(0) });
    const track = makeTrack({ trackNumber: 12, albumTrackCount: 12 });
    const scored = score({ tracks: [track], shape, context: makeContext() });
    expect(scored[0]?.weight).toBe(2);
  });

  it('suppresses a closer when the depth dial is at one', () => {
    const shape = makeShape({ depth: dial(1) });
    const track = makeTrack({ trackNumber: 12, albumTrackCount: 12 });
    const scored = score({ tracks: [track], shape, context: makeContext() });
    expect(scored[0]?.weight).toBe(MIN_WEIGHT);
  });

  it('multiplies the two dials together', () => {
    const shape = makeShape({ familiarity: dial(1), depth: dial(1) });
    const track = makeTrack({ id: 'tr-known', trackNumber: 1, albumTrackCount: 12 });
    const context = makeContext({ topTrackIds: ['tr-known'] });
    const scored = score({ tracks: [track], shape, context });
    expect(scored[0]?.weight).toBe(4);
  });

  it('carries the measured familiarity through', () => {
    const track = makeTrack({ id: 'tr-known' });
    const context = makeContext({ libraryTrackIds: ['tr-known'] });
    const scored = score({ tracks: [track], shape: makeShape(), context });
    expect(scored[0]?.familiarity).toBe(FAMILIARITY_WEIGHTS.library);
  });

  it('carries the estimated prominence through', () => {
    const track = makeTrack({ trackNumber: 1, albumTrackCount: 5 });
    const scored = score({ tracks: [track], shape: makeShape(), context: makeContext() });
    expect(scored[0]?.prominence).toBe(1);
  });

  it('handles an empty list', () => {
    expect(score({ tracks: [], shape: makeShape(), context: makeContext() })).toEqual([]);
  });
});
