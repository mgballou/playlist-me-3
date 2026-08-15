import { artistId, defaultRecipe, playlistId, recipeId } from '@pm/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Reveal } from '@/components/primitives/Reveal';
import { SourceRow } from '@/components/bench/SourceRow';
import {
  addExclusion,
  addSource,
  hasExclusion,
  removeExclusion,
  removeSource,
  replaceSource,
  setDial,
  setMaxPerArtist,
  setName,
  setOrder,
  setTarget,
  singletonExclusionKinds,
} from '@/lib/recipe/edit';

const base = defaultRecipe(recipeId('rc-1'), 'Untitled recipe');
const noNames = new Map<string, string>();

describe('editing a recipe is a function of one', () => {
  it('adds a source without touching the original', () => {
    addSource(base, { kind: 'library' });
    expect(base.sources).toHaveLength(0);
  });

  it('adds a source to the copy', () => {
    expect(addSource(base, { kind: 'library' }).sources).toHaveLength(1);
  });

  it('removes a source by position', () => {
    const two = addSource(addSource(base, { kind: 'library' }), { kind: 'newReleases' });
    expect(removeSource(two, 0).sources[0]?.kind).toBe('newReleases');
  });

  it('replaces a source in place', () => {
    const one = addSource(base, {
      kind: 'artist',
      artistId: artistId('ar-1'),
      depth: 'albums',
    });
    const tuned = replaceSource(one, 0, {
      kind: 'artist',
      artistId: artistId('ar-1'),
      depth: 'everything',
    });
    expect(tuned.sources[0]).toEqual({
      kind: 'artist',
      artistId: 'ar-1',
      depth: 'everything',
    });
  });

  it('adds an exclusion', () => {
    expect(addExclusion(base, { kind: 'inLibrary' }).exclusions).toHaveLength(1);
  });

  it('removes an exclusion by position', () => {
    const one = addExclusion(base, { kind: 'inLibrary' });
    expect(removeExclusion(one, 0).exclusions).toHaveLength(0);
  });

  it('knows when a subjectless exclusion is already there', () => {
    const one = addExclusion(base, { kind: 'inLibrary' });
    expect(hasExclusion(one, { kind: 'inLibrary' })).toBe(true);
  });

  it('tells two playlist blocks apart', () => {
    const one = addExclusion(base, { kind: 'playlist', playlistId: playlistId('pl-1') });
    expect(hasExclusion(one, { kind: 'playlist', playlistId: playlistId('pl-2') })).toBe(false);
  });

  it('reports the subjectless kinds already spent', () => {
    const two = addExclusion(addExclusion(base, { kind: 'inLibrary' }), { kind: 'explicit' });
    expect([...singletonExclusionKinds(two)].sort()).toEqual(['explicit', 'inLibrary']);
  });

  it('never reports a kind that takes a subject as spent', () => {
    const one = addExclusion(base, { kind: 'artist', artistId: artistId('ar-1') });
    expect(singletonExclusionKinds(one).has('artist')).toBe(false);
  });

  it('renames', () => {
    expect(setName(base, 'Late dub').name).toBe('Late dub');
  });

  it('sets a count target', () => {
    expect(setTarget(base, { kind: 'count', count: 40 }).shape.target).toEqual({
      kind: 'count',
      count: 40,
    });
  });

  it('never lets the per-artist limit fall below one', () => {
    expect(setMaxPerArtist(base, 0).shape.maxPerArtist).toBe(1);
  });

  it('sets the order strategy', () => {
    expect(setOrder(base, 'byRelease').shape.order).toBe('byRelease');
  });

  it('clamps a dial rather than throwing when a drag overshoots', () => {
    expect(setDial(base, 'depth', 1.4).shape.depth).toBe(1);
  });

  it('clamps a dial at the low end too', () => {
    expect(setDial(base, 'familiarity', -0.2).shape.familiarity).toBe(0);
  });
});

describe('a source shows what it contributed', () => {
  it('shows nothing before a build', () => {
    render(
      <SourceRow
        source={{ kind: 'library' }}
        index={0}
        names={noNames}
        contribution={null}
        onChange={() => undefined}
        onRemove={() => undefined}
      />,
    );
    expect(screen.getByText('Not built yet')).toBeInTheDocument();
  });

  it('shows what it pooled after one', () => {
    render(
      <SourceRow
        source={{ kind: 'library' }}
        index={0}
        names={noNames}
        contribution={{ pooled: 88, chosen: 4 }}
        onChange={() => undefined}
        onRemove={() => undefined}
      />,
    );
    expect(screen.getByText(/\+88/)).toBeInTheDocument();
  });

  it('says so plainly when a source found nothing', () => {
    render(
      <SourceRow
        source={{ kind: 'library' }}
        index={0}
        names={noNames}
        contribution={{ pooled: 0, chosen: 0 }}
        onChange={() => undefined}
        onRemove={() => undefined}
      />,
    );
    expect(screen.getByText('nothing pooled')).toBeInTheDocument();
  });

  it('names what to do about a source that found nothing', () => {
    render(
      <SourceRow
        source={{ kind: 'library' }}
        index={0}
        names={noNames}
        contribution={{ pooled: 0, chosen: 0 }}
        onChange={() => undefined}
        onRemove={() => undefined}
      />,
    );
    expect(screen.getByText(/Widen it below, or take it off the recipe/)).toBeInTheDocument();
  });

  it('shows the name a picker resolved rather than the id', () => {
    render(
      <SourceRow
        source={{ kind: 'artist', artistId: artistId('ar-9'), depth: 'albums' }}
        index={0}
        names={new Map([['ar-9', 'The Harbour Lamps']])}
        contribution={null}
        onChange={() => undefined}
        onRemove={() => undefined}
      />,
    );
    expect(screen.getByText('The Harbour Lamps')).toBeInTheDocument();
  });

  it('falls back to the id rather than to “unknown”', () => {
    render(
      <SourceRow
        source={{ kind: 'artist', artistId: artistId('ar-9'), depth: 'albums' }}
        index={0}
        names={noNames}
        contribution={null}
        onChange={() => undefined}
        onRemove={() => undefined}
      />,
    );
    expect(screen.getByText('ar-9')).toBeInTheDocument();
  });

  it('keeps the remove control’s name when its label is a glyph', () => {
    render(
      <SourceRow
        source={{ kind: 'library' }}
        index={0}
        names={noNames}
        contribution={null}
        onChange={() => undefined}
        onRemove={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: /Remove source 1/ })).toBeInTheDocument();
  });
});

describe('tuning is a reveal, not a wall', () => {
  it('hides the tuning until it is asked for', () => {
    render(
      <SourceRow
        source={{ kind: 'artist', artistId: artistId('ar-1'), depth: 'albums' }}
        index={0}
        names={noNames}
        contribution={null}
        onChange={() => undefined}
        onRemove={() => undefined}
      />,
    );
    expect(screen.queryByLabelText('How much of the discography')).toBeNull();
  });

  it('shows it once it is', async () => {
    const user = userEvent.setup();
    render(
      <SourceRow
        source={{ kind: 'artist', artistId: artistId('ar-1'), depth: 'albums' }}
        index={0}
        names={noNames}
        contribution={null}
        onChange={() => undefined}
        onRemove={() => undefined}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Tune/ }));
    expect(screen.getByLabelText('How much of the discography')).toBeInTheDocument();
  });

  it('offers no tuning for a source that has none', () => {
    render(
      <SourceRow
        source={{ kind: 'library' }}
        index={0}
        names={noNames}
        contribution={null}
        onChange={() => undefined}
        onRemove={() => undefined}
      />,
    );
    expect(screen.queryByRole('button', { name: /Tune/ })).toBeNull();
  });

  it('warns about the cost of the obscure search path before it is spent', async () => {
    const user = userEvent.setup();
    render(
      <SourceRow
        source={{ kind: 'search', query: 'dub', obscurity: 'obscure' }}
        index={0}
        names={noNames}
        contribution={null}
        onChange={() => undefined}
        onRemove={() => undefined}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Tune/ }));
    expect(screen.getByText(/costs more requests/)).toBeInTheDocument();
  });
});

describe('a collapsed reveal is inert, not merely hidden', () => {
  it('renders nothing of its body while closed', () => {
    render(
      <Reveal label="Tune">
        <button type="button">Buried</button>
      </Reveal>,
    );
    expect(screen.queryByRole('button', { name: 'Buried' })).toBeNull();
  });

  it('says it is collapsed', () => {
    render(
      <Reveal label="Tune">
        <button type="button">Buried</button>
      </Reveal>,
    );
    expect(screen.getByRole('button', { name: /Tune/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('puts nothing focusable in the tab order while closed', () => {
    const { container } = render(
      <Reveal label="Tune">
        <input aria-label="Buried field" />
      </Reveal>,
    );
    expect(container.querySelectorAll('input')).toHaveLength(0);
  });

  it('opens on request', async () => {
    const user = userEvent.setup();
    render(
      <Reveal label="Tune">
        <button type="button">Buried</button>
      </Reveal>,
    );
    await user.click(screen.getByRole('button', { name: /Tune/ }));
    expect(screen.getByRole('button', { name: 'Buried' })).toBeInTheDocument();
  });

  it('points at the body it controls', async () => {
    const user = userEvent.setup();
    render(
      <Reveal label="Tune">
        <button type="button">Buried</button>
      </Reveal>,
    );
    const toggle = screen.getByRole('button', { name: /Tune/ });
    await user.click(toggle);
    const controlled = toggle.getAttribute('aria-controls');
    expect(document.getElementById(controlled ?? '')).not.toBeNull();
  });
});
