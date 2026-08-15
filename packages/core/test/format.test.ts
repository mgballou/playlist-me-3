import { describe, expect, it } from 'vitest';

import { format } from '../src/index';

describe('trackDuration', () => {
  it('renders minutes and seconds', () => {
    expect(format({ kind: 'trackDuration', ms: 225_000 })).toBe('3:45');
  });

  it('pads the seconds', () => {
    expect(format({ kind: 'trackDuration', ms: 122_000 })).toBe('2:02');
  });

  it('renders hours when a track runs long', () => {
    expect(format({ kind: 'trackDuration', ms: 3_750_000 })).toBe('1:02:30');
  });

  it('renders zero', () => {
    expect(format({ kind: 'trackDuration', ms: 0 })).toBe('0:00');
  });

  it('treats a negative as zero', () => {
    expect(format({ kind: 'trackDuration', ms: -5000 })).toBe('0:00');
  });
});

describe('duration', () => {
  it('renders minutes alone under an hour', () => {
    expect(format({ kind: 'duration', ms: 2_880_000 })).toBe('48 min');
  });

  it('renders hours and minutes', () => {
    expect(format({ kind: 'duration', ms: 4_320_000 })).toBe('1 hr 12 min');
  });

  it('drops the minutes on a whole hour', () => {
    expect(format({ kind: 'duration', ms: 7_200_000 })).toBe('2 hr');
  });

  it('renders zero', () => {
    expect(format({ kind: 'duration', ms: 0 })).toBe('0 min');
  });
});

describe('trackCount', () => {
  it('renders the plural', () => {
    expect(format({ kind: 'trackCount', count: 12 })).toBe('12 tracks');
  });

  it('renders the singular', () => {
    expect(format({ kind: 'trackCount', count: 1 })).toBe('1 track');
  });

  it('renders none', () => {
    expect(format({ kind: 'trackCount', count: 0 })).toBe('0 tracks');
  });
});

describe('summary', () => {
  it('joins the count and the duration', () => {
    expect(format({ kind: 'summary', count: 12, ms: 2_880_000 })).toBe('12 tracks · 48 min');
  });

  it('handles an empty playlist', () => {
    expect(format({ kind: 'summary', count: 0, ms: 0 })).toBe('0 tracks · 0 min');
  });
});
