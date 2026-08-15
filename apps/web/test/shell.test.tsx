import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Frame } from '@/components/shell/Frame';
import { ErrorNotice } from '@/components/errors/ErrorNotice';
import type { Connection } from '@/lib/spotify/connection';
import { toErrorSurface } from '@/lib/errors/surface';
import { QuotaExceeded, RateLimited, AuthFailed } from '@pm/spotify';

vi.mock('@/lib/actions/resolve', () => ({
  resolveWorkbench: vi.fn(async () => ({
    ok: false as const,
    error: {
      kind: 'failed' as const,
      title: 'stub',
      message: 'stub',
      retry: 'manual' as const,
      retryAfterSeconds: null,
    },
  })),
}));

const demo: Connection = {
  mode: 'demo',
  cause: 'notConfigured',
  label: 'demo mode',
  notice: 'Demo mode. Every artist, album and track here is invented.',
  nextStep: null,
};

const disconnected: Connection = {
  mode: 'demo',
  cause: 'noSession',
  label: 'demo mode',
  notice: 'Demo mode. Every artist, album and track here is invented.',
  nextStep: 'Connect Spotify to build against your own library.',
};

const connected: Connection = {
  mode: 'live',
  cause: null,
  label: 'connected',
  notice: 'Connected to Spotify.',
  nextStep: null,
};

describe('the connection', () => {
  it('offers a way to connect when the app is configured but nobody has', () => {
    render(<Frame connection={disconnected} />);
    expect(screen.getByRole('link', { name: 'Connect Spotify' })).toBeInTheDocument();
  });

  it('offers no connect link when there are no credentials to connect with', () => {
    render(<Frame connection={demo} />);
    expect(screen.queryByRole('link', { name: 'Connect Spotify' })).toBeNull();
  });

  it('offers a way to disconnect once connected', () => {
    render(<Frame connection={connected} />);
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
  });

  it('says nothing about demo mode once connected', () => {
    render(<Frame connection={connected} />);
    expect(screen.queryByText('demo mode')).toBeNull();
  });
});

describe('the frame', () => {
  it('has a crown', () => {
    render(<Frame connection={demo} />);
    expect(screen.getByText('Playlist.me')).toBeInTheDocument();
  });

  it('has a rack', () => {
    render(<Frame connection={demo} />);
    expect(screen.getByRole('region', { name: 'Sources' })).toBeInTheDocument();
  });

  it('has a block module', () => {
    render(<Frame connection={demo} />);
    expect(screen.getByRole('region', { name: 'Block' })).toBeInTheDocument();
  });

  it('has a shape module', () => {
    render(<Frame connection={demo} />);
    expect(screen.getByRole('region', { name: 'Shape' })).toBeInTheDocument();
  });

  it('has a deck', () => {
    render(<Frame connection={demo} />);
    expect(screen.getByRole('region', { name: 'Deck' })).toBeInTheDocument();
  });

  it('has a ledger with one primary action', () => {
    render(<Frame connection={demo} />);
    expect(screen.getByRole('button', { name: 'Save to Spotify' })).toBeInTheDocument();
  });

  it('announces demo mode in the crown', () => {
    render(<Frame connection={demo} />);
    expect(screen.getByText('demo mode')).toBeInTheDocument();
  });

  it('says the demo data is invented', () => {
    render(<Frame connection={demo} />);
    expect(screen.getByText(/invented/)).toBeInTheDocument();
  });

  it('keeps the theme toggle name when its label is a glyph', () => {
    render(<Frame connection={demo} />);
    expect(screen.getByRole('button', { name: /Switch to the/ })).toBeInTheDocument();
  });
});

describe('the three failures', () => {
  it('says how long a rate limit lasts', () => {
    expect(toErrorSurface(RateLimited.retryAfter(12)).message).toContain('12');
  });

  it('retries a rate limit by itself', () => {
    expect(toErrorSurface(RateLimited.retryAfter(12)).retry).toBe('automatic');
  });

  it('says a spent quota does not resolve today', () => {
    expect(toErrorSurface(QuotaExceeded.developerQuota()).message).toContain('not today');
  });

  it('never retries a spent quota in a loop', () => {
    expect(toErrorSurface(QuotaExceeded.developerQuota()).retry).toBe('never');
  });

  it('offers a reconnect when the token expired', () => {
    expect(toErrorSurface(AuthFailed.tokenRejected()).retry).toBe('reconnect');
  });

  it('gives each failure its own words', () => {
    const messages = [
      toErrorSurface(RateLimited.retryAfter(12)).message,
      toErrorSurface(QuotaExceeded.developerQuota()).message,
      toErrorSurface(AuthFailed.tokenRejected()).message,
    ];
    expect(new Set(messages).size).toBe(3);
  });

  it('returns to where the person was after reconnecting', () => {
    render(<ErrorNotice error={toErrorSurface(AuthFailed.tokenRejected())} returnTo="/?r=abc" />);
    expect(screen.getByRole('link', { name: 'Reconnect Spotify' })).toHaveAttribute(
      'href',
      '/api/auth/login?returnTo=%2F%3Fr%3Dabc',
    );
  });

  it('offers nothing to press when a quota is spent', () => {
    render(<ErrorNotice error={toErrorSurface(QuotaExceeded.developerQuota())} returnTo="/" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the countdown while a rate limit is retrying itself', () => {
    render(
      <ErrorNotice error={toErrorSurface(RateLimited.retryAfter(9))} returnTo="/" retryIn={9} />,
    );
    expect(screen.getByText(/Asking again in 9s/)).toBeInTheDocument();
  });

  it('offers nothing to press while the automatic retry is still counting down', () => {
    render(
      <ErrorNotice
        error={toErrorSurface(RateLimited.retryAfter(9))}
        returnTo="/"
        retryIn={9}
        onRetry={() => undefined}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('hands the decision over once the automatic retry is spent', () => {
    render(
      <ErrorNotice
        error={toErrorSurface(RateLimited.retryAfter(9))}
        returnTo="/"
        retryIn={null}
        onRetry={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('terminal states', () => {
  it('names what to do next on an empty bench', () => {
    render(<Frame connection={demo} />);
    const sources = screen.getByRole('region', { name: 'Sources' });
    expect(within(sources).getByRole('button', { name: 'Add a source' })).toBeInTheDocument();
  });

  it('gives the empty bench the rack’s one accent', () => {
    render(<Frame connection={demo} />);
    const sources = screen.getByRole('region', { name: 'Sources' });
    expect(within(sources).getByRole('button', { name: 'Add a source' })).toHaveClass('act');
  });

  it('names what to do next in an empty deck', () => {
    render(<Frame connection={demo} />);
    const deck = screen.getByRole('region', { name: 'Deck' });
    expect(within(deck).getByText(/Add a source in the rack/)).toBeInTheDocument();
  });

  it('names the headline block on an empty block module', () => {
    render(<Frame connection={demo} />);
    const block = screen.getByRole('region', { name: 'Block' });
    expect(within(block).getByText(/never anything off Kids Jams/)).toBeInTheDocument();
  });

  it('offers a way to block something from the empty block module', () => {
    render(<Frame connection={demo} />);
    const block = screen.getByRole('region', { name: 'Block' });
    expect(within(block).getByRole('button', { name: 'Block something' })).toBeInTheDocument();
  });

  it('says the ledger has nothing to report before a build', () => {
    render(<Frame connection={demo} />);
    expect(screen.getByText('nothing built yet')).toBeInTheDocument();
  });

  it('cannot save a playlist that does not exist yet', () => {
    render(<Frame connection={demo} />);
    expect(screen.getByRole('button', { name: 'Save to Spotify' })).toBeDisabled();
  });
});

/**
 * The bench's hardware: two knobs and two faders, all four of them real sliders. The shapes
 * differ and what they owe does not — §10 and §13 ask the same of both, and these read them
 * off the assembled frame rather than off the primitives in isolation.
 */
describe('the bench’s controls', () => {
  it('are all real sliders', () => {
    render(<Frame connection={demo} />);
    expect(screen.getAllByRole('slider')).toHaveLength(4);
  });

  it('gives the two dials knobs', () => {
    render(<Frame connection={demo} />);
    expect(screen.getByRole('slider', { name: 'Familiar' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Deep cuts' })).toBeInTheDocument();
  });

  it('gives the two quantities faders', () => {
    render(<Frame connection={demo} />);
    expect(screen.getByRole('slider', { name: 'Tracks' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Most per artist' })).toBeInTheDocument();
  });

  it('reaches every slider from the keyboard', () => {
    render(<Frame connection={demo} />);
    for (const slider of screen.getAllByRole('slider')) {
      expect(slider).toHaveAttribute('tabindex', '0');
    }
  });

  it('names every position in words rather than in numbers alone', () => {
    render(<Frame connection={demo} />);
    for (const slider of screen.getAllByRole('slider')) {
      expect(slider.getAttribute('aria-valuetext')).toMatch(/[a-z]{4,}/);
    }
  });

  it('carries real bounds on every slider', () => {
    render(<Frame connection={demo} />);
    for (const slider of screen.getAllByRole('slider')) {
      expect(slider).toHaveAttribute('aria-valuemin');
      expect(slider).toHaveAttribute('aria-valuemax');
      expect(slider).toHaveAttribute('aria-valuenow');
    }
  });

  it('names the familiarity dial’s position in words', () => {
    render(<Frame connection={demo} />);
    expect(screen.getByRole('slider', { name: 'Familiar' })).toHaveAttribute(
      'aria-valuetext',
      'Familiar: no preference',
    );
  });

  it('label the depth dial as an approximation on the bench itself', () => {
    render(<Frame connection={demo} />);
    expect(screen.getByText(/approximation, not a measurement/i)).toBeInTheDocument();
  });

  it('say familiarity is exact on the bench itself', () => {
    render(<Frame connection={demo} />);
    expect(screen.getByText(/^Exact\. Familiarity/)).toBeInTheDocument();
  });

  it('move without costing a request', async () => {
    const user = userEvent.setup();
    render(<Frame connection={demo} />);
    const depth = screen.getByRole('slider', { name: 'Deep cuts' });
    depth.focus();
    await user.keyboard('{ArrowRight}');
    expect(depth).toHaveAttribute('aria-valuenow', '0.55');
  });

  it('turns a knob to a new word with a large step', async () => {
    const user = userEvent.setup();
    render(<Frame connection={demo} />);
    const depth = screen.getByRole('slider', { name: 'Deep cuts' });
    depth.focus();
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(depth).toHaveAttribute('aria-valuetext', 'Deep cuts: leaning toward the obvious ones');
  });

  it('moves a fader without touching the network', async () => {
    const user = userEvent.setup();
    render(<Frame connection={demo} />);
    const tracks = screen.getByRole('slider', { name: 'Tracks' });
    tracks.focus();
    await user.keyboard('{End}');
    expect(tracks).toHaveAttribute('aria-valuetext', '200 tracks');
  });
});
