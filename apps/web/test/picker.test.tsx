import { playlistId } from '@pm/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlaylistPicker } from '@/components/bench/PlaylistPicker';
import type { CatalogLookup, PlaylistChoice } from '@/lib/workbench/catalog';

const listed: readonly PlaylistChoice[] = [
  { id: playlistId('pl-kids-jams'), name: 'Kids Jams (demo)', trackCount: 40 },
  { id: playlistId('pl-late-shift'), name: 'Late Shift (demo)', trackCount: 1 },
];

const { listMyPlaylists, lookupPlaylist } = vi.hoisted(() => ({
  listMyPlaylists: vi.fn(),
  lookupPlaylist: vi.fn(),
}));

vi.mock('@/lib/actions/catalog', () => ({ listMyPlaylists, lookupPlaylist }));

beforeEach(() => {
  vi.clearAllMocks();
});

function open(args: {
  readonly list?: CatalogLookup<PlaylistChoice>;
  readonly found?: CatalogLookup<PlaylistChoice>;
}): { readonly picked: ReturnType<typeof vi.fn> } {
  listMyPlaylists.mockResolvedValue(args.list ?? { ok: true, items: listed });
  lookupPlaylist.mockResolvedValue(args.found ?? { ok: true, items: listed.slice(0, 1) });
  const picked = vi.fn();
  render(<PlaylistPicker title="Exclude a playlist" onPick={picked} onClose={vi.fn()} />);
  return { picked };
}

describe('the playlist picker lists', () => {
  it('names every playlist it was given', async () => {
    open({});
    expect(await screen.findByRole('button', { name: /Kids Jams/ })).toBeInTheDocument();
  });

  it('says how much is on one without reading it', async () => {
    open({});
    expect(await screen.findByText('40 tracks')).toBeInTheDocument();
  });

  it('asks for the listing once', async () => {
    open({});
    await screen.findByRole('button', { name: /Kids Jams/ });
    expect(listMyPlaylists).toHaveBeenCalledTimes(1);
  });

  it('picks the one that was clicked', async () => {
    const user = userEvent.setup();
    const { picked } = open({});
    await user.click(await screen.findByRole('button', { name: /Kids Jams/ }));
    expect(picked).toHaveBeenCalledWith({ id: 'pl-kids-jams', name: 'Kids Jams (demo)' });
  });

  it('spends no request picking from the list', async () => {
    const user = userEvent.setup();
    open({});
    await user.click(await screen.findByRole('button', { name: /Kids Jams/ }));
    expect(lookupPlaylist).not.toHaveBeenCalled();
  });

  it('says so when there is nothing to list', async () => {
    open({ list: { ok: true, items: [] } });
    expect(await screen.findByText(/Nothing to list/)).toBeInTheDocument();
  });

  it('reports a listing that failed', async () => {
    open({ list: { ok: false, message: 'Spotify turned that down.' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Spotify turned that down.');
  });
});

describe('the playlist picker still takes a link', () => {
  it('offers the field alongside the list', async () => {
    open({});
    await screen.findByRole('button', { name: /Kids Jams/ });
    expect(screen.getByLabelText(/playlist link/i)).toBeInTheDocument();
  });

  it('offers the field when the listing failed', async () => {
    open({ list: { ok: false, message: 'Spotify turned that down.' } });
    await screen.findByRole('alert');
    expect(screen.getByLabelText(/playlist link/i)).toBeInTheDocument();
  });

  it('reads what was pasted', async () => {
    const user = userEvent.setup();
    open({});
    await user.type(screen.getByLabelText(/playlist link/i), 'spotify:playlist:pl-kids-jams');
    await user.click(screen.getByRole('button', { name: 'Use this playlist' }));
    expect(lookupPlaylist).toHaveBeenCalledWith('spotify:playlist:pl-kids-jams');
  });

  it('picks what the paste resolved to', async () => {
    const user = userEvent.setup();
    const { picked } = open({});
    await user.type(screen.getByLabelText(/playlist link/i), 'pl-kids-jams');
    await user.click(screen.getByRole('button', { name: 'Use this playlist' }));
    expect(picked).toHaveBeenCalledWith({ id: 'pl-kids-jams', name: 'Kids Jams (demo)' });
  });

  it('reports a reference it could not read', async () => {
    const user = userEvent.setup();
    open({ found: { ok: false, message: 'That is not a playlist link, URI or id.' } });
    await user.type(screen.getByLabelText(/playlist link/i), 'nonsense');
    await user.click(screen.getByRole('button', { name: 'Use this playlist' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That is not a playlist link');
  });
});
