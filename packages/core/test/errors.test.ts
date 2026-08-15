import { describe, expect, it } from 'vitest';

import {
  CoreError,
  DecodeError,
  InvalidDial,
  InvalidId,
  RngMisuse,
  UnreachableCase,
  err,
  ok,
  unreachable,
} from '../src/index';
import { captureError } from './fixtures/index';

describe('error classes', () => {
  it('all descend from one base', () => {
    expect(InvalidId.empty('TrackId')).toBeInstanceOf(CoreError);
  });

  it('carry their own class name', () => {
    expect(RngMisuse.emptyPool().name).toBe('RngMisuse');
  });

  it('are still Errors', () => {
    expect(DecodeError.notJson()).toBeInstanceOf(Error);
  });

  it('give the dial error a code', () => {
    expect(InvalidDial.notFinite(Number.NaN).code).toBe('invalidDial');
  });

  it('give the rng error a code', () => {
    expect(RngMisuse.invalidSeed(Number.NaN).code).toBe('rngMisuse');
  });

  it('give the decode error a code', () => {
    expect(DecodeError.malformed('shape').code).toBe('decodeError');
  });

  it('name the malformed field', () => {
    expect(DecodeError.malformed('sources').detail).toBe('sources');
  });

  it('carry a readable message', () => {
    expect(DecodeError.wrongVersion(3).message).toContain('3');
  });
});

describe('unreachable', () => {
  it('throws when a union grows a member', () => {
    // The cast is the point: it stands in for a union member the switch never saw.
    const rogue = 'surprise' as never;
    expect(captureError(() => unreachable(rogue))).toBeInstanceOf(UnreachableCase);
  });
});

describe('Result', () => {
  it('wraps a success', () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
  });

  it('wraps a failure', () => {
    expect(err('bad')).toEqual({ ok: false, error: 'bad' });
  });
});
