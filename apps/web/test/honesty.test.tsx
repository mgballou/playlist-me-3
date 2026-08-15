import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Dial } from '@/components/bench/Dial';
import { ExclusionRow } from '@/components/bench/ExclusionRow';
import { DIAL_DEFINITIONS, dialValueText, dialWords } from '@/lib/registry/dials';
import { EXCLUSION_DEFINITIONS } from '@/lib/registry/exclusions';

const noNames = new Map<string, string>();

/**
 * ui-sensibility §15 asks for "a test that fails if the depth dial loses its approximation
 * label". These are that test, at both levels — the registry that holds the words, and the
 * component that has to render them.
 */
describe('the depth dial is labelled as an approximation', () => {
  it('carries an approximation note in the registry', () => {
    expect(DIAL_DEFINITIONS.depth.approximation).not.toBeNull();
  });

  it('calls itself an approximation', () => {
    expect(DIAL_DEFINITIONS.depth.approximation).toMatch(/approximation/i);
  });

  it('says it is not a measurement', () => {
    expect(DIAL_DEFINITIONS.depth.approximation).toMatch(/not a measurement/i);
  });

  it('says why: popularity is gone', () => {
    expect(DIAL_DEFINITIONS.depth.approximation).toMatch(/popularity/i);
  });

  it('renders the note on the control', () => {
    render(<Dial definition={DIAL_DEFINITIONS.depth} value={0.5} onChange={() => undefined} />);
    expect(screen.getByText(/approximation, not a measurement/i)).toBeInTheDocument();
  });

  it('binds the note to the slider so it is announced with it', () => {
    render(<Dial definition={DIAL_DEFINITIONS.depth} value={0.5} onChange={() => undefined} />);
    const note = screen.getByText(/approximation, not a measurement/i);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-describedby', note.id);
  });

  it('marks the note as an estimate as well as saying so', () => {
    render(<Dial definition={DIAL_DEFINITIONS.depth} value={0.5} onChange={() => undefined} />);
    expect(screen.getByText(/approximation, not a measurement/i)).toHaveAttribute(
      'data-estimate',
      'true',
    );
  });
});

describe('familiarity is exact and may say so', () => {
  it('carries no approximation note', () => {
    expect(DIAL_DEFINITIONS.familiarity.approximation).toBeNull();
  });

  it('states its exactness plainly', () => {
    expect(DIAL_DEFINITIONS.familiarity.exactness).toMatch(/exact/i);
  });

  it('renders that plainly on the control', () => {
    render(
      <Dial definition={DIAL_DEFINITIONS.familiarity} value={0.5} onChange={() => undefined} />,
    );
    expect(screen.getByText(/^Exact\./)).toBeInTheDocument();
  });

  it('is not marked as an estimate', () => {
    render(
      <Dial definition={DIAL_DEFINITIONS.familiarity} value={0.5} onChange={() => undefined} />,
    );
    expect(screen.getByText(/^Exact\./)).toHaveAttribute('data-estimate', 'false');
  });
});

describe('the live-or-remix filter says best effort', () => {
  it('carries the caveat in the registry', () => {
    expect(EXCLUSION_DEFINITIONS.liveOrRemix.caveat).toMatch(/best effort/i);
  });

  it('renders the caveat on the row', () => {
    render(
      <ExclusionRow
        exclusion={{ kind: 'liveOrRemix' }}
        index={0}
        names={noNames}
        removed={12}
        onRemove={() => undefined}
      />,
    );
    expect(screen.getByText(/Best effort/i)).toBeInTheDocument();
  });

  it('admits it misses things', () => {
    expect(EXCLUSION_DEFINITIONS.liveOrRemix.caveat).toMatch(/misses/i);
  });
});

describe('exclusions that are exact carry no caveat', () => {
  it('says nothing extra about the explicit flag', () => {
    expect(EXCLUSION_DEFINITIONS.explicit.caveat).toBeNull();
  });

  it('says nothing extra about the library', () => {
    expect(EXCLUSION_DEFINITIONS.inLibrary.caveat).toBeNull();
  });
});

describe('a dial names its position in words', () => {
  it('never announces a bare number', () => {
    expect(dialValueText(DIAL_DEFINITIONS.depth, 0.75)).toMatch(/[a-z]{4,}/);
  });

  it('says deep cuts at the low end', () => {
    expect(dialWords(DIAL_DEFINITIONS.depth, 0)).toBe('deep cuts only');
  });

  it('says the obvious ones at the high end', () => {
    expect(dialWords(DIAL_DEFINITIONS.depth, 1)).toBe('the obvious ones only');
  });

  it('expresses no preference in the middle', () => {
    expect(dialWords(DIAL_DEFINITIONS.familiarity, 0.5)).toBe('no preference');
  });

  it('puts the value text on the slider', () => {
    render(<Dial definition={DIAL_DEFINITIONS.depth} value={0} onChange={() => undefined} />);
    expect(screen.getByRole('slider')).toHaveAttribute(
      'aria-valuetext',
      'Deep cuts: deep cuts only',
    );
  });
});

describe('a row without a build renders no judgment', () => {
  it('says nothing rather than showing an unknown count', () => {
    render(
      <ExclusionRow
        exclusion={{ kind: 'inLibrary' }}
        index={0}
        names={noNames}
        removed={null}
        onRemove={() => undefined}
      />,
    );
    expect(screen.queryByText('−0')).toBeNull();
  });

  it('tells a screen reader why the count is absent', () => {
    render(
      <ExclusionRow
        exclusion={{ kind: 'inLibrary' }}
        index={0}
        names={noNames}
        removed={null}
        onRemove={() => undefined}
      />,
    );
    expect(screen.getByText('Not built yet')).toBeInTheDocument();
  });

  it('distinguishes caught nothing from not yet run', () => {
    render(
      <ExclusionRow
        exclusion={{ kind: 'inLibrary' }}
        index={0}
        names={noNames}
        removed={0}
        onRemove={() => undefined}
      />,
    );
    expect(screen.getByText('caught nothing')).toBeInTheDocument();
  });

  it('shows what it removed once it has run', () => {
    render(
      <ExclusionRow
        exclusion={{ kind: 'inLibrary' }}
        index={0}
        names={noNames}
        removed={214}
        onRemove={() => undefined}
      />,
    );
    expect(screen.getByText('−214')).toBeInTheDocument();
  });
});

describe('a glyph-only control keeps its name', () => {
  it('names the remove control on an exclusion row', () => {
    render(
      <ExclusionRow
        exclusion={{ kind: 'explicit' }}
        index={0}
        names={noNames}
        removed={3}
        onRemove={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: /Stop blocking/ })).toBeInTheDocument();
  });
});
