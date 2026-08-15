import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Fader } from '@/components/primitives/Fader';
import { Knob } from '@/components/primitives/Knob';
import { Led } from '@/components/primitives/Led';
import {
  KNOB_SWEEP_PX,
  draggedValue,
  fractionOf,
  keyedValue,
  snap,
  valueAtFraction,
  type Travel,
} from '@/lib/controls/travel';

/**
 * The two hardware controls and the lamp. ui-sensibility §15 asks for the structural half to
 * be tested properly so the visual half stays a person's job — for a knob that structural
 * half is the whole of the keyboard, the whole of the ARIA contract, and the arithmetic that
 * turns a drag into a value. The geometry a browser draws is unverified here, in those words,
 * and gets a browser pass instead.
 */

const DIAL: Travel = { min: 0, max: 1, step: 0.05, bigStep: 0.25 };
const COUNT: Travel = { min: 1, max: 200, step: 1, bigStep: 10 };

describe('travel arithmetic', () => {
  it('lands a value on a step', () => {
    expect(snap(DIAL, 0.37)).toBe(0.35);
  });

  it('never accumulates float noise across steps', () => {
    let value = 0;
    for (let press = 0; press < 3; press += 1) value = snap(DIAL, value + DIAL.step);
    expect(value).toBe(0.15);
  });

  it('clamps an overshoot at the top rather than throwing', () => {
    expect(snap(DIAL, 1.4)).toBe(1);
  });

  it('clamps an overshoot at the bottom too', () => {
    expect(snap(DIAL, -0.3)).toBe(0);
  });

  it('reads a fraction off the bounds, not off the value', () => {
    expect(fractionOf(COUNT, 100.5)).toBeCloseTo(0.5, 5);
  });

  it('turns a fraction back into a value on the scale', () => {
    expect(valueAtFraction(COUNT, 0.5)).toBe(101);
  });

  it('takes the full sweep over the stated pointer travel', () => {
    expect(draggedValue(DIAL, 0, KNOB_SWEEP_PX)).toBe(1);
  });

  it('reads up as more', () => {
    expect(draggedValue(DIAL, 0.5, KNOB_SWEEP_PX / 2)).toBe(1);
  });

  it('reads down as less', () => {
    expect(draggedValue(DIAL, 0.5, -KNOB_SWEEP_PX / 2)).toBe(0);
  });
});

describe('the keyboard map, shared by every control', () => {
  it('steps up on ArrowUp', () => {
    expect(keyedValue(DIAL, 0.5, { key: 'ArrowUp', shiftKey: false })).toBe(0.55);
  });

  it('steps up on ArrowRight', () => {
    expect(keyedValue(DIAL, 0.5, { key: 'ArrowRight', shiftKey: false })).toBe(0.55);
  });

  it('steps down on ArrowDown', () => {
    expect(keyedValue(DIAL, 0.5, { key: 'ArrowDown', shiftKey: false })).toBe(0.45);
  });

  it('steps down on ArrowLeft', () => {
    expect(keyedValue(DIAL, 0.5, { key: 'ArrowLeft', shiftKey: false })).toBe(0.45);
  });

  it('steps larger with shift held', () => {
    expect(keyedValue(DIAL, 0.5, { key: 'ArrowUp', shiftKey: true })).toBe(0.75);
  });

  it('steps larger on a page key without shift', () => {
    expect(keyedValue(DIAL, 0.5, { key: 'PageDown', shiftKey: false })).toBe(0.25);
  });

  it('jumps to the low end on Home', () => {
    expect(keyedValue(DIAL, 0.5, { key: 'Home', shiftKey: false })).toBe(0);
  });

  it('jumps to the high end on End', () => {
    expect(keyedValue(DIAL, 0.5, { key: 'End', shiftKey: false })).toBe(1);
  });

  it('leaves a key that means nothing to a slider alone', () => {
    expect(keyedValue(DIAL, 0.5, { key: 'a', shiftKey: false })).toBeNull();
  });

  it('stops at the top rather than wrapping', () => {
    expect(keyedValue(DIAL, 1, { key: 'ArrowUp', shiftKey: false })).toBe(1);
  });
});

function TestKnob({ start = 0.5 }: { readonly start?: number }) {
  const [value, setValue] = useState(start);
  return (
    <Knob
      label="Familiar"
      value={value}
      travel={DIAL}
      valueText={`Familiar: ${String(value)}`}
      readout={String(value)}
      lowLabel="none of it"
      highLabel="all of it"
      onChange={setValue}
    />
  );
}

describe('the knob', () => {
  it('is a real slider', () => {
    render(<TestKnob />);
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  it('takes its name from the label printed beside it', () => {
    render(<TestKnob />);
    expect(screen.getByRole('slider', { name: 'Familiar' })).toBeInTheDocument();
  });

  it('carries its bounds', () => {
    render(<TestKnob />);
    const knob = screen.getByRole('slider');
    expect(knob).toHaveAttribute('aria-valuemin', '0');
    expect(knob).toHaveAttribute('aria-valuemax', '1');
    expect(knob).toHaveAttribute('aria-valuenow', '0.5');
  });

  /** §13: a bare number tells nobody anything. */
  it('names its position in words', () => {
    render(<TestKnob />);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext');
  });

  it('is reachable by keyboard', () => {
    render(<TestKnob />);
    expect(screen.getByRole('slider')).toHaveAttribute('tabindex', '0');
  });

  it('steps up on an arrow', async () => {
    const user = userEvent.setup();
    render(<TestKnob />);
    const knob = screen.getByRole('slider');
    knob.focus();
    await user.keyboard('{ArrowUp}');
    expect(knob).toHaveAttribute('aria-valuenow', '0.55');
  });

  it('steps down on an arrow', async () => {
    const user = userEvent.setup();
    render(<TestKnob />);
    const knob = screen.getByRole('slider');
    knob.focus();
    await user.keyboard('{ArrowDown}');
    expect(knob).toHaveAttribute('aria-valuenow', '0.45');
  });

  it('steps larger with shift held', async () => {
    const user = userEvent.setup();
    render(<TestKnob />);
    const knob = screen.getByRole('slider');
    knob.focus();
    await user.keyboard('{Shift>}{ArrowUp}{/Shift}');
    expect(knob).toHaveAttribute('aria-valuenow', '0.75');
  });

  it('jumps to the ends on Home and End', async () => {
    const user = userEvent.setup();
    render(<TestKnob />);
    const knob = screen.getByRole('slider');
    knob.focus();
    await user.keyboard('{End}');
    expect(knob).toHaveAttribute('aria-valuenow', '1');
    await user.keyboard('{Home}');
    expect(knob).toHaveAttribute('aria-valuenow', '0');
  });

  it('prints both ends of the sweep, so the direction is never in doubt', () => {
    render(<TestKnob />);
    expect(screen.getByText('none of it')).toBeInTheDocument();
    expect(screen.getByText('all of it')).toBeInTheDocument();
  });

  it('always shows its value', () => {
    render(<TestKnob start={0.25} />);
    expect(screen.getByText('0.25')).toBeInTheDocument();
  });
});

function TestFader({ start = 30 }: { readonly start?: number }) {
  const [value, setValue] = useState(start);
  return (
    <Fader
      label="Tracks"
      value={value}
      travel={COUNT}
      valueText={`${String(value)} tracks`}
      readout={String(value)}
      onChange={setValue}
    />
  );
}

describe('the fader', () => {
  it('is a real slider with a name', () => {
    render(<TestFader />);
    expect(screen.getByRole('slider', { name: 'Tracks' })).toBeInTheDocument();
  });

  it('names its position in words as well as in figures', () => {
    render(<TestFader />);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '30 tracks');
  });

  it('travels on an arrow', async () => {
    const user = userEvent.setup();
    render(<TestFader />);
    const fader = screen.getByRole('slider');
    fader.focus();
    await user.keyboard('{ArrowRight}');
    expect(fader).toHaveAttribute('aria-valuenow', '31');
  });

  it('travels further with shift held', async () => {
    const user = userEvent.setup();
    render(<TestFader />);
    const fader = screen.getByRole('slider');
    fader.focus();
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(fader).toHaveAttribute('aria-valuenow', '40');
  });

  it('runs the cap the whole way and no further', async () => {
    const user = userEvent.setup();
    render(<TestFader />);
    const fader = screen.getByRole('slider');
    fader.focus();
    await user.keyboard('{End}');
    expect(fader).toHaveAttribute('aria-valuenow', '200');
    await user.keyboard('{ArrowRight}');
    expect(fader).toHaveAttribute('aria-valuenow', '200');
  });

  /** The cap is drawn from one number, so where it sits is a fact the test can read. */
  it('puts the cap where the value says', async () => {
    const user = userEvent.setup();
    render(<TestFader />);
    const fader = screen.getByRole('slider');
    fader.focus();
    await user.keyboard('{Home}');
    expect(fader.style.getPropertyValue('--fader-fraction')).toBe('0');
    await user.keyboard('{End}');
    expect(fader.style.getPropertyValue('--fader-fraction')).toBe('1');
  });
});

/**
 * §5 rule 4: an LED is never the only carrier of a state, because red and amber are 48° apart
 * and that is not enough for everyone. `label` is required and always in the document, so
 * there is no way to render one of these with nothing but a colour.
 */
describe('the LED always has a word beside it', () => {
  it('prints its word', () => {
    render(<Led lit label="demo mode" />);
    expect(screen.getByText('demo mode')).toBeInTheDocument();
  });

  it('keeps the word for a screen reader even when a glyph carries it on screen', () => {
    render(<Led lit label="Held" quiet />);
    expect(screen.getByText('Held')).toHaveClass('visually-hidden');
  });

  it('reports in amber by default', () => {
    render(<Led lit label="connected" />);
    expect(screen.getByText('connected').parentElement).toHaveAttribute('data-tone', 'report');
  });

  it('takes the held tone when something is latched', () => {
    render(<Led lit tone="held" label="Held" />);
    expect(screen.getByText('Held').parentElement).toHaveAttribute('data-tone', 'held');
  });

  it('says plainly when it is not lit', () => {
    render(<Led lit={false} label="Held" />);
    expect(screen.getByText('Held').parentElement).toHaveAttribute('data-lit', 'false');
  });
});
