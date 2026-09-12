import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Frame } from '@/components/shell/Frame';
import { AUTH_FAILURE_REASONS, type AuthFailureReason } from '@/lib/errors/auth';
import {
  connectionOutcomeFromSearch,
  describeConnectionOutcome,
  withoutConnectionParams,
} from '@/lib/errors/connection';
import type { Connection } from '@/lib/spotify/connection';

/**
 * §2.7: **a dead end is a bug.** Every way connecting can fail arrives as `?auth=<reason>` or
 * `?connect=unavailable`, and before this branch nothing read either one — the reasons were
 * computed, put in a URL, and dropped on a bench that said nothing about them.
 */

vi.mock('@/lib/actions/resolve', () => ({
  resolveWorkbench: vi.fn(async () => ({
    ok: true as const,
    resolved: {
      pool: [],
      context: {
        libraryTrackIds: [],
        topTrackIds: [],
        recentlyHeardTrackIds: [],
        followedArtistIds: [],
        playlists: [],
      },
      report: {
        sources: [],
        poolSize: 0,
        requests: 0,
        cacheHits: 0,
        artistsLookedUp: 0,
        genresAvailable: true,
      },
      requests: 0,
      mode: 'demo' as const,
    },
  })),
}));

vi.mock('@/lib/persistence/store', () => ({
  browserStore: () => ({
    read: async () => null,
    write: async () => undefined,
    remove: async () => undefined,
    keys: async () => [],
  }),
}));

const demo: Connection = {
  mode: 'demo',
  cause: 'noSession',
  label: 'demo mode',
  notice: 'Demo mode. Every artist, album and track here is invented.',
  nextStep: null,
};

async function benchAt(search: string): Promise<HTMLElement> {
  window.history.replaceState({}, '', `/${search}`);
  render(<Frame connection={demo} />);
  return screen.findByRole('alert', {}, { timeout: 3000 });
}

function sentenceOf(notice: HTMLElement): string {
  return notice.textContent ?? '';
}

/** Joined with a space, because the title and the message abut in `textContent`. */
function wordsOf(notice: HTMLElement): string {
  return [...notice.querySelectorAll('p')].map((line) => line.textContent ?? '').join(' ');
}

describe('reading the connection outcome off a URL', () => {
  it('says nothing about connecting when the URL says nothing', () => {
    expect(connectionOutcomeFromSearch('?r=abc')).toBeNull();
  });

  it('reads a reason the callback can write', () => {
    expect(connectionOutcomeFromSearch('?auth=stateMismatch')).toEqual({
      kind: 'handoffFailed',
      reason: 'stateMismatch',
    });
  });

  it('reads the login route’s unavailable', () => {
    expect(connectionOutcomeFromSearch('?connect=unavailable')).toEqual({ kind: 'unavailable' });
  });

  it('calls a reason it does not know unrecognized rather than guessing', () => {
    expect(connectionOutcomeFromSearch('?auth=teapot')).toEqual({ kind: 'unrecognized' });
  });

  it('calls a connect value it does not know unrecognized', () => {
    expect(connectionOutcomeFromSearch('?connect=probably')).toEqual({ kind: 'unrecognized' });
  });

  it('takes the reason over the connect value when a hand-written URL carries both', () => {
    expect(connectionOutcomeFromSearch('?connect=unavailable&auth=refused')).toEqual({
      kind: 'handoffFailed',
      reason: 'refused',
    });
  });
});

describe('taking the parameters back out of a URL', () => {
  it('drops the reason', () => {
    expect(withoutConnectionParams('?auth=refused')).toBe('');
  });

  it('drops the connect value', () => {
    expect(withoutConnectionParams('?connect=unavailable')).toBe('');
  });

  it('leaves a shared recipe exactly where it was', () => {
    expect(withoutConnectionParams('?r=abc123&auth=refused')).toBe('?r=abc123');
  });

  it('leaves a query it has no business in alone', () => {
    expect(withoutConnectionParams('?r=abc123')).toBe('?r=abc123');
  });
});

describe('the sentence each reason gets', () => {
  it.each(AUTH_FAILURE_REASONS)('%s reads as a sentence rather than as a reason', (reason) => {
    const surface = describeConnectionOutcome({ kind: 'handoffFailed', reason });
    expect(surface.message).toMatch(/^[A-Z].*\.$/);
  });

  /** A reason that reached the screen would arrive as camel case, which no sentence contains. */
  it.each(AUTH_FAILURE_REASONS)('%s never puts an identifier on screen', (reason) => {
    const surface = describeConnectionOutcome({ kind: 'handoffFailed', reason });
    expect(`${surface.title} ${surface.message}`).not.toMatch(/[a-z][A-Z]/);
  });

  it('does not explain the check behind a state mismatch', () => {
    const surface = describeConnectionOutcome({ kind: 'handoffFailed', reason: 'stateMismatch' });
    expect(`${surface.title} ${surface.message}`).not.toMatch(/csrf|forg|state|token|cookie/i);
  });

  it('offers no way to connect when there are no credentials to connect with', () => {
    expect(describeConnectionOutcome({ kind: 'unavailable' }).retry).toBe('never');
  });

  it('names what happens next even with nothing to press', () => {
    expect(describeConnectionOutcome({ kind: 'unavailable' }).message).toMatch(/demo mode/);
  });

  it('offers the sign-in again when trying again could work', () => {
    expect(describeConnectionOutcome({ kind: 'handoffFailed', reason: 'unreachable' }).retry).toBe(
      'reconnect',
    );
  });

  it('keeps a declined consent screen apart from a refused request', () => {
    const denied = describeConnectionOutcome({ kind: 'handoffFailed', reason: 'deniedByUser' });
    const refused = describeConnectionOutcome({
      kind: 'handoffFailed',
      reason: 'authorizeRefused',
    });
    expect(denied.title).not.toBe(refused.title);
  });

  it('does not tell someone they declined a screen they never reached', () => {
    const surface = describeConnectionOutcome({
      kind: 'handoffFailed',
      reason: 'authorizeRefused',
    });
    expect(surface.message).toMatch(/rather than you declining/);
  });

  it('admits it cannot name a reason it does not recognize', () => {
    expect(describeConnectionOutcome({ kind: 'unrecognized' }).message).toMatch(
      /does not recognize the reason/,
    );
  });

  it('does not echo an unrecognized value back onto the screen', () => {
    expect(describeConnectionOutcome({ kind: 'unrecognized' }).title).not.toMatch(/teapot/);
  });
});

describe('the bench, reached from a failed handoff', () => {
  it.each(AUTH_FAILURE_REASONS)('says what went wrong after %s', async (reason) => {
    const notice = await benchAt(`?auth=${reason}`);
    const expected = describeConnectionOutcome({ kind: 'handoffFailed', reason });
    expect(sentenceOf(notice)).toContain(expected.message);
  });

  it.each(AUTH_FAILURE_REASONS)('names what happens next after %s', async (reason) => {
    const notice = await benchAt(`?auth=${reason}`);
    const surface = describeConnectionOutcome({ kind: 'handoffFailed', reason });
    const named =
      surface.retry === 'never'
        ? sentenceOf(notice).includes('demo mode')
        : notice.querySelector('a[href^="/api/auth/login"]') !== null;
    expect(named).toBe(true);
  });

  it.each(AUTH_FAILURE_REASONS)('never shows the identifier behind %s', async (reason) => {
    const notice = await benchAt(`?auth=${reason}`);
    expect(wordsOf(notice)).not.toMatch(/[a-z][A-Z]/);
  });

  it('says why connecting was unavailable', async () => {
    const notice = await benchAt('?connect=unavailable');
    expect(sentenceOf(notice)).toContain('It was built without Spotify credentials');
  });

  it('offers nothing to press when there is nothing to connect to', async () => {
    const notice = await benchAt('?connect=unavailable');
    expect(notice.querySelector('a[href^="/api/auth/login"]')).toBeNull();
  });

  it('says something honest about a reason it does not recognize', async () => {
    const notice = await benchAt('?auth=teapot');
    expect(sentenceOf(notice)).toMatch(/does not recognize the reason/);
  });

  it('does not print the unrecognized value', async () => {
    const notice = await benchAt('?auth=teapot');
    expect(sentenceOf(notice)).not.toContain('teapot');
  });

  it('shows nothing when the URL says nothing about connecting', async () => {
    window.history.replaceState({}, '', '/');
    render(<Frame connection={demo} />);
    await screen.findByRole('button', { name: 'Add a source' }, { timeout: 3000 });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('takes the reason out of the URL, so a reload does not show it again', async () => {
    await benchAt('?auth=refused');
    expect(window.location.search).toBe('');
  });

  it('takes the connect value out of the URL too', async () => {
    await benchAt('?connect=unavailable');
    expect(window.location.search).toBe('');
  });

  it('leaves a shared recipe in the URL while clearing the reason', async () => {
    await benchAt('?r=abc123&auth=refused');
    expect(window.location.search).toBe('?r=abc123');
  });

  it('keeps the reason out of where reconnecting would come back to', async () => {
    const notice = await benchAt('?auth=refused');
    const href = notice.querySelector('a[href^="/api/auth/login"]')?.getAttribute('href') ?? '';
    const returnTo = new URL(href, 'http://localhost').searchParams.get('returnTo') ?? '';
    expect(returnTo).not.toContain('auth');
  });
});

describe('the reasons the callback can actually write', () => {
  it('has a sentence for every one of them', () => {
    const described = AUTH_FAILURE_REASONS.filter(
      (reason: AuthFailureReason) =>
        describeConnectionOutcome({ kind: 'handoffFailed', reason }).message.length > 0,
    );
    expect(described).toHaveLength(AUTH_FAILURE_REASONS.length);
  });
});
