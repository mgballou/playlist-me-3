import type { BuildResult, Recipe } from '@pm/core';
import { artistId, defaultRecipe, playlistId, recipeId } from '@pm/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Frame } from '@/components/shell/Frame';
import { createScrollMemory } from '@/lib/layout/scroll-memory';
import {
  DEFAULT_SECTION,
  SECTIONS,
  blockCount,
  deckCount,
  isSectionId,
  sectionCounts,
  sectionForKey,
  sectionKeyId,
  sectionPanelId,
  stepSection,
} from '@/lib/layout/sections';
import { SWIPE_MIN_PX, ownsGesture, swipeStep } from '@/lib/layout/swipe';
import { loadSection, saveSection } from '@/lib/persistence/recipes';
import { memoryStore } from '@/lib/persistence/store';
import type { Connection } from '@/lib/spotify/connection';
import { narrowViewport, wideViewport } from './support/viewport';

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

function blocked(): Recipe {
  const base = defaultRecipe(recipeId('r-1'));
  return {
    ...base,
    sources: [{ kind: 'artist', artistId: artistId('a-1'), depth: 'albumsAndSingles' }],
    exclusions: [{ kind: 'playlist', playlistId: playlistId('pl-kids') }],
  };
}

function built(trackCount: number, removedCount: number): BuildResult {
  return {
    report: { trackCount, reject: { removedCount } },
  } as unknown as BuildResult;
}

describe('the four sections', () => {
  it('are the four regions §7.1 names', () => {
    expect(SECTIONS).toEqual(['sources', 'block', 'shape', 'deck']);
  });

  it('start on the recipe rather than on its result', () => {
    expect(DEFAULT_SECTION).toBe('sources');
  });

  it('tie a key to its panel by id', () => {
    expect(sectionPanelId('deck')).not.toBe(sectionKeyId('deck'));
  });

  it('refuse a section this build does not have', () => {
    expect(isSectionId('rack')).toBe(false);
  });
});

describe('moving along the keys', () => {
  it('goes one key to the right', () => {
    expect(stepSection('sources', 1)).toBe('block');
  });

  it('goes one key to the left', () => {
    expect(stepSection('shape', -1)).toBe('block');
  });

  it('stops at the last key rather than wrapping', () => {
    expect(stepSection('deck', 1)).toBe('deck');
  });

  it('stops at the first key rather than wrapping', () => {
    expect(stepSection('sources', -1)).toBe('sources');
  });

  it('reaches the first key from anywhere', () => {
    expect(sectionForKey('deck', 'Home')).toBe('sources');
  });

  it('reaches the last key from anywhere', () => {
    expect(sectionForKey('sources', 'End')).toBe('deck');
  });

  it('leaves every other key alone', () => {
    expect(sectionForKey('sources', 'a')).toBeNull();
  });
});

describe('what a key carries', () => {
  it('counts the sources', () => {
    expect(sectionCounts(blocked(), null).sources).toBe('1');
  });

  it('counts the blocks before anything has been built', () => {
    expect(blockCount(blocked(), null)).toBe('1');
  });

  it('reports what the blocks removed once there is a build', () => {
    expect(blockCount(blocked(), built(25, 68))).toBe('−68');
  });

  it('never reports a removal for a recipe with no blocks', () => {
    expect(blockCount(defaultRecipe(recipeId('r-1')), built(25, 0))).toBe('0');
  });

  it('counts the shape the recipe asks for', () => {
    expect(sectionCounts(blocked(), null).shape).toBe('25');
  });

  it('says nothing about a deck that does not exist yet', () => {
    expect(deckCount(null)).toBe('—');
  });

  it('counts the built deck', () => {
    expect(deckCount(built(25, 68))).toBe('25');
  });
});

describe('a swipe', () => {
  it('pulls the next section in when the thumb goes left', () => {
    expect(swipeStep({ dx: -120, dy: 4 })).toBe(1);
  });

  it('pulls the previous one in when the thumb goes right', () => {
    expect(swipeStep({ dx: 120, dy: 4 })).toBe(-1);
  });

  it('ignores a tap that drifted', () => {
    expect(swipeStep({ dx: SWIPE_MIN_PX - 1, dy: 0 })).toBeNull();
  });

  it('ignores a scroll that wandered sideways', () => {
    expect(swipeStep({ dx: 80, dy: 200 })).toBeNull();
  });

  it('leaves a gesture that started on a fader to the fader', () => {
    const fader = document.createElement('div');
    fader.setAttribute('role', 'slider');
    expect(ownsGesture(fader)).toBe(true);
  });

  it('takes a gesture that started on the panel itself', () => {
    expect(ownsGesture(document.createElement('div'))).toBe(false);
  });
});

describe('each section keeps its own place', () => {
  it('gives an unvisited section the top of its list', () => {
    expect(createScrollMemory().recall('deck')).toBe(0);
  });

  it('remembers where a section was left', () => {
    const memory = createScrollMemory();
    memory.remember('deck', { scrollTop: 420 });
    expect(memory.recall('deck')).toBe(420);
  });

  it('puts the arriving section back where it was', () => {
    const memory = createScrollMemory();
    memory.remember('deck', { scrollTop: 420 });
    const stage = { scrollTop: 0 };
    memory.restore('deck', stage);
    expect(stage.scrollTop).toBe(420);
  });

  it('does not hand one section another section’s place', () => {
    const memory = createScrollMemory();
    memory.remember('deck', { scrollTop: 420 });
    const stage = { scrollTop: 420 };
    memory.restore('shape', stage);
    expect(stage.scrollTop).toBe(0);
  });
});

describe('the selected section survives a reload', () => {
  it('reads back the section that was held', async () => {
    const store = memoryStore();
    await saveSection(store, 'deck');
    expect(await loadSection(store)).toBe('deck');
  });

  it('holds nothing before a first visit', async () => {
    expect(await loadSection(memoryStore())).toBeNull();
  });

  it('refuses a stored section this build no longer has', async () => {
    const store = memoryStore(new Map([['section', 'rack']]));
    expect(await loadSection(store)).toBeNull();
  });
});

describe('above the threshold', () => {
  beforeEach(() => {
    wideViewport();
  });

  it('has no keys at all', () => {
    render(<Frame connection={demo} />);
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('has no tablist to navigate', () => {
    render(<Frame connection={demo} />);
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('claims no tabpanel where there is no tablist', () => {
    render(<Frame connection={demo} />);
    expect(screen.queryAllByRole('tabpanel')).toHaveLength(0);
  });

  it('shows all four regions at once', () => {
    render(<Frame connection={demo} />);
    for (const name of ['Sources', 'Block', 'Shape', 'Deck']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
  });

  it('hides nothing', () => {
    const { container } = render(<Frame connection={demo} />);
    expect(container.querySelectorAll('.panel[hidden]')).toHaveLength(0);
  });
});

describe('below the threshold', () => {
  beforeEach(() => {
    narrowViewport();
  });

  afterEach(() => {
    wideViewport();
  });

  it('gives every section a key', () => {
    render(<Frame connection={demo} />);
    expect(screen.getAllByRole('tab')).toHaveLength(4);
  });

  it('names the keys after the sections they travel to', () => {
    render(<Frame connection={demo} />);
    expect(screen.getByRole('tab', { name: /Sources/ })).toBeInTheDocument();
  });

  it('carries the count on the key', () => {
    render(<Frame connection={demo} />);
    expect(screen.getByRole('tab', { name: /Shape/ })).toHaveTextContent('25');
  });

  it('keeps a key’s count live while another section is showing', async () => {
    const user = userEvent.setup();
    render(<Frame connection={demo} />);
    await user.click(screen.getByRole('tab', { name: /Shape/ }));
    screen.getByRole('slider', { name: 'Tracks' }).focus();
    await user.keyboard('{End}');
    await user.click(screen.getByRole('tab', { name: /Deck/ }));
    expect(screen.getByRole('tab', { name: /Shape/ })).toHaveTextContent('200');
  });

  it('starts on the first section', () => {
    render(<Frame connection={demo} />);
    expect(screen.getByRole('tab', { name: /Sources/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('marks the selected key without spending the accent', () => {
    render(<Frame connection={demo} />);
    for (const key of screen.getAllByRole('tab')) {
      expect(key).not.toHaveClass('act');
    }
  });

  it('lights an amber lamp on the selected key and no other', () => {
    const { container } = render(<Frame connection={demo} />);
    expect(container.querySelectorAll('.key .led[data-lit="true"]')).toHaveLength(1);
  });

  it('reports with amber rather than acting with red', () => {
    const { container } = render(<Frame connection={demo} />);
    expect(container.querySelector('.key .led[data-lit="true"]')).toHaveAttribute(
      'data-tone',
      'report',
    );
  });

  it('gives each panel the name of its key', () => {
    render(<Frame connection={demo} />);
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      sectionKeyId('sources'),
    );
  });

  it('shows one section at a time', () => {
    render(<Frame connection={demo} />);
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });

  it('makes the sections it is not showing inert', () => {
    const { container } = render(<Frame connection={demo} />);
    expect(container.querySelectorAll('.panel[hidden][inert]')).toHaveLength(3);
  });

  it('never leaves a hidden section reachable by keyboard', () => {
    const { container } = render(<Frame connection={demo} />);
    for (const panel of container.querySelectorAll('.panel[hidden]')) {
      expect(panel).toHaveAttribute('inert');
    }
  });

  it('travels to a section when its key is pressed', async () => {
    const user = userEvent.setup();
    render(<Frame connection={demo} />);
    await user.click(screen.getByRole('tab', { name: /Deck/ }));
    expect(screen.getByRole('region', { name: 'Deck' })).toBeVisible();
  });

  it('presses the arriving key in and lets the leaving one back out', async () => {
    const user = userEvent.setup();
    render(<Frame connection={demo} />);
    await user.click(screen.getByRole('tab', { name: /Deck/ }));
    expect(screen.getByRole('tab', { name: /Sources/ })).toHaveAttribute('aria-selected', 'false');
  });

  it('keeps the section it is not showing mounted, so nothing rebuilds', async () => {
    const user = userEvent.setup();
    render(<Frame connection={demo} />);
    await user.click(screen.getByRole('tab', { name: /Deck/ }));
    expect(screen.getByRole('region', { name: 'Sources', hidden: true })).toBeInTheDocument();
  });

  it('takes a hidden section out of the accessibility tree entirely', async () => {
    const user = userEvent.setup();
    render(<Frame connection={demo} />);
    await user.click(screen.getByRole('tab', { name: /Deck/ }));
    expect(screen.queryByRole('region', { name: 'Sources' })).toBeNull();
  });

  it('moves one key right on an arrow', async () => {
    const user = userEvent.setup();
    render(<Frame connection={demo} />);
    screen.getByRole('tab', { name: /Sources/ }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /Block/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('moves one key left on an arrow', async () => {
    const user = userEvent.setup();
    render(<Frame connection={demo} />);
    screen.getByRole('tab', { name: /Sources/ }).focus();
    await user.keyboard('{ArrowRight}{ArrowLeft}');
    expect(screen.getByRole('tab', { name: /Sources/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('jumps to the last key on End', async () => {
    const user = userEvent.setup();
    render(<Frame connection={demo} />);
    screen.getByRole('tab', { name: /Sources/ }).focus();
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: /Deck/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('takes the focus with the selection', async () => {
    const user = userEvent.setup();
    render(<Frame connection={demo} />);
    screen.getByRole('tab', { name: /Sources/ }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /Block/ })).toHaveFocus();
  });

  it('keeps exactly one key in the tab order', () => {
    render(<Frame connection={demo} />);
    const reachable = screen
      .getAllByRole('tab')
      .filter((key) => key.getAttribute('tabindex') === '0');
    expect(reachable).toHaveLength(1);
  });

  it('leaves the crown where it was', () => {
    render(<Frame connection={demo} />);
    expect(screen.getByText('Playlist.me')).toBeInTheDocument();
  });

  it('leaves the ledger where it was', () => {
    render(<Frame connection={demo} />);
    expect(screen.getByRole('button', { name: 'Save to Spotify' })).toBeInTheDocument();
  });

  it('adds no accent to the frame, because travel is not an act', () => {
    const { container } = render(<Frame connection={demo} />);
    const keys = container.querySelector('.keys');
    expect(keys?.querySelectorAll('.act, .act--secondary')).toHaveLength(0);
  });
});
