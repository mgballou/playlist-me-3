// @vitest-environment node
// Reads globals.css off disk. jsdom loads no stylesheets, so the layer order, the elevation
// system and the reduced-motion branch are asserted against the source rather than against a
// fake layout. What a browser computes is e2e/motion.spec.ts's job.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(
  fileURLToPath(new URL('../src/styles/globals.css', import.meta.url)),
  'utf8',
);

const tokens = readFileSync(
  fileURLToPath(new URL('../src/styles/tokens.css', import.meta.url)),
  'utf8',
);

type Rule = { readonly selectors: readonly string[]; readonly body: string };

/**
 * Every rule in the file, as a selector list and a body. A grouped rule counts for each of
 * its selectors, which is the point: the press is *written once for every key* in this
 * direction, and a test that could only read a rule with exactly one selector would push the
 * stylesheet into repeating itself to stay testable.
 */
/** Comments carry braces and prose that would be read as selectors, so they go first. */
const BARE_CSS = css.replace(/\/\*[\s\S]*?\*\//g, '');

const RULES: readonly Rule[] = [...BARE_CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => {
  const prelude = match[1] ?? '';
  // Inside an @media the prelude carries the query and its brace; the selector is what
  // follows the last one.
  const selectorList = prelude.split(/[{}]/).pop() ?? '';
  return {
    selectors: selectorList
      .split(',')
      .map((one) => one.trim())
      .filter((one) => one.length > 0),
    body: match[2] ?? '',
  };
});

/** Every declaration that applies to a selector, from however many rules mention it. */
function declarationsFor(selector: string): string {
  const found = RULES.filter((rule) => rule.selectors.includes(selector));
  if (found.length === 0) throw new Error(`no rule for ${selector} in globals.css`);
  return found.map((rule) => rule.body).join('\n');
}

function zIndexOf(selector: string): string {
  const declaration = /z-index:\s*var\((--[\w-]+)\)/.exec(declarationsFor(selector));
  if (declaration === null || declaration[1] === undefined) {
    throw new Error(`${selector} names no z-index token`);
  }
  return declaration[1];
}

function tokenValue(name: string): number {
  const match = new RegExp(`${name}:\\s*(\\d+);`).exec(tokens);
  if (match === null || match[1] === undefined) throw new Error(`no ${name} in tokens.css`);
  return Number(match[1]);
}

/** A component-tier token declared in globals.css itself. §4.1 */
function componentToken(name: string): string {
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(BARE_CSS);
  if (match === null || match[1] === undefined) throw new Error(`no ${name} in globals.css`);
  return match[1].trim();
}

// ---------------------------------------------------------------------------
// §15: layer order — an overlay sits above the rack, the ledger is never dimmed,
// a takeover sits above both.
// ---------------------------------------------------------------------------

describe('layer order', () => {
  it('puts an overlay above the rack', () => {
    expect(tokenValue('--z-overlay')).toBeGreaterThan(tokenValue('--z-rack'));
  });

  it('puts the ledger above an overlay, so nothing dims it', () => {
    expect(tokenValue('--z-ledger')).toBeGreaterThan(tokenValue('--z-overlay'));
  });

  it('puts a takeover above both', () => {
    expect(tokenValue('--z-takeover')).toBeGreaterThan(tokenValue('--z-ledger'));
  });

  it('gives the overlay the overlay layer', () => {
    expect(zIndexOf('.overlay')).toBe('--z-overlay');
  });

  it('gives the ledger the ledger layer', () => {
    expect(zIndexOf('.ledger')).toBe('--z-ledger');
  });

  it('never dims the ledger with an opacity of its own', () => {
    expect(declarationsFor('.ledger')).not.toMatch(/opacity/);
  });

  it('leaves the ledger out of the overlay scrim', () => {
    expect(declarationsFor('.overlay__scrim')).toMatch(/position:\s*absolute/);
  });
});

// ---------------------------------------------------------------------------
// §5 rule 2 and rule 3: nothing is separated by an outline. A panel is told from
// its neighbour by its own value plus the light falling on it. This is the block
// that would have caught the direction breaking.
// ---------------------------------------------------------------------------

/** Every proud thing on the desk: a module, a row, a key, a slot, a card. */
const PROUD = [
  '.module',
  '.nameplate',
  '.row',
  '.slot',
  '.act',
  '.act--secondary',
  '.draft',
  '.draft__kind',
  '.picker__choice',
  '.shelf__card',
  '.switch__option',
  '.overlay__panel',
  '.takeover',
  '.knob__cap',
  '.fader__cap',
];

/** Every recessed thing: a well, a slot for a cap, a field machined into the panel. */
const RECESSED = [
  '.module__body',
  '.field__input',
  '.nameplate__input',
  '.crown__demo',
  '.knob__dial',
  '.reveal__body',
  '.report__track',
  '.slot-placeholder',
];

describe('separation is light, not an outline', () => {
  it.each(PROUD)('%s carries a relief rather than a border', (selector) => {
    expect(declarationsFor(selector)).toMatch(/box-shadow:[^;]*var\(--relief-(raised|lifted)\)/);
  });

  it.each(PROUD)('%s declares no border of its own', (selector) => {
    const declarations = declarationsFor(selector);
    // `border: none` is how a platform default is taken off. A width is what is forbidden.
    expect(declarations).not.toMatch(/border(-\w+)*:\s*(?!none)[^;]*var\(--line\)/);
  });

  it.each(RECESSED)('%s is machined into its panel', (selector) => {
    expect(declarationsFor(selector)).toMatch(/box-shadow:[^;]*var\(--relief-well\)/);
  });

  /**
   * The top edge highlight is what makes a panel read as moulded rather than drawn (§5 rule
   * 3), and it is composed into the relief here so that a call site cannot take the shadow
   * and forget the light. A raised element without `--edge-top` is the whole failure.
   */
  it('composes the top edge into every proud relief', () => {
    expect(componentToken('--relief-raised')).toContain('var(--edge-top)');
    expect(componentToken('--relief-lifted')).toContain('var(--edge-top)');
  });

  it('composes a real shadow into every proud relief', () => {
    expect(componentToken('--relief-raised')).toContain('var(--shadow-raised)');
    expect(componentToken('--relief-lifted')).toContain('var(--shadow-lifted)');
  });

  it('makes the recessed relief an inset one', () => {
    expect(componentToken('--relief-well')).toContain('var(--shadow-well)');
  });

  /**
   * A seam is a hairline you have to look for. `tokens.test.ts` holds the other half of this
   * — that `--line` stays *below* 3:1 against its panel — and this half is that no rule ever
   * draws it thicker than one device pixel. Together they are what stops a seam becoming the
   * outline this direction replaced.
   */
  it('never draws the seam thicker than a hairline', () => {
    const seams = [...css.matchAll(/border[\w-]*:\s*([^;]*var\(--line\)[^;]*);/g)];
    expect(seams.length).toBeGreaterThan(0);
    for (const seam of seams) {
      expect(seam[1]).toMatch(/var\(--hairline\)/);
    }
  });

  it('keeps the hairline one device pixel', () => {
    expect(componentToken('--hairline')).toBe('1px');
  });
});

// ---------------------------------------------------------------------------
// §5 rule 4 and §8: the press is the signature motion, identical everywhere, and
// its reduced branch changes shadow and fill instead of translating.
// ---------------------------------------------------------------------------

const PRESSABLE = [
  '.act',
  '.act--secondary',
  '.act--quiet',
  '.draft__kind',
  '.picker__choice',
  '.slot__act',
  '.switch__option',
];

function pressRule(selector: string): string {
  return declarationsFor(`${selector}:active:not(:disabled)`);
}

describe('the press', () => {
  it.each(PRESSABLE)('%s travels on press', (selector) => {
    expect(pressRule(selector)).toMatch(/translate:[^;]*var\(--press-travel\)/);
  });

  it.each(PRESSABLE)('%s scales its press by --motion-scale', (selector) => {
    expect(pressRule(selector)).toMatch(/var\(--motion-scale\)/);
  });

  it.each(PRESSABLE)('%s sinks into its own well on press', (selector) => {
    expect(pressRule(selector)).toMatch(/box-shadow:[^;]*var\(--relief-pressed\)/);
  });

  it.each(PRESSABLE)(
    '%s changes fill on press, so the reduced branch still answers',
    (selector) => {
      expect(pressRule(selector)).toMatch(/background/);
    },
  );

  /** 1px, not 4. Hardware has weight; a big jump reads as a sticker rather than a key. §5 */
  it('travels one pixel', () => {
    expect(componentToken('--press-travel')).toBe('1px');
  });

  /** The pressed relief is the well: the shadow shortens and the top edge dims. §5 */
  it('dims the top edge as the key sinks', () => {
    expect(componentToken('--relief-pressed')).toMatch(/inset[^,]*transparent/);
  });

  it('shortens the shadow into the well as the key sinks', () => {
    expect(componentToken('--relief-pressed')).toContain('var(--shadow-well)');
  });

  it('settles rather than snapping, at the house fast duration', () => {
    expect(componentToken('--press-transition')).toContain('var(--duration-fast)');
    expect(componentToken('--press-transition')).toContain('var(--ease-settle)');
  });
});

// ---------------------------------------------------------------------------
// §5: a console is precise and squared. The radii are small on purpose.
// ---------------------------------------------------------------------------

describe('the radii are a console’s, not a sticker’s', () => {
  it('keeps the ordinary radius tight', () => {
    expect(/--radius:\s*(\d+)px/.exec(tokens)?.[1]).toBe('3');
  });

  it('keeps the large radius barely larger', () => {
    expect(/--radius-lg:\s*(\d+)px/.exec(tokens)?.[1]).toBe('5');
  });
});

// ---------------------------------------------------------------------------
// §8: reduced motion is designed, not stripped. Movement goes to zero; time does
// not. Nothing visible under normal motion may go missing.
// ---------------------------------------------------------------------------

describe('reduced motion', () => {
  it('is honored at the token layer, so no caller has to remember', () => {
    expect(tokens).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });

  it('flips --motion-scale to zero, which collapses every press translate', () => {
    expect(tokens).toMatch(/--motion-scale:\s*0/);
  });

  it('keeps every duration real, so a cross-fade is still a cross-fade', () => {
    const branch = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n {2}\}/.exec(
      tokens,
    );
    const durations = [...(branch?.[1] ?? '').matchAll(/--duration-[\w]+:\s*(\d+)ms/g)];
    expect(durations.length).toBeGreaterThan(0);
    for (const duration of durations) {
      expect(Number(duration[1])).toBeGreaterThan(10);
    }
  });

  it('gives the slot turn a designed reduced branch', () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*slot-fade/);
  });

  it('keeps the slot animating under reduced motion rather than dropping it', () => {
    const branch = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*)\}/.exec(css);
    expect(branch?.[1]).toMatch(/\.slot__face\s*\{[^}]*animation:/);
  });

  it('cross-fades rather than turning, under reduced motion', () => {
    expect(css).toMatch(/@keyframes\s+slot-fade[\s\S]*opacity/);
  });

  it('turns over under normal motion', () => {
    expect(css).toMatch(/@keyframes\s+slot-turn[\s\S]*rotateX/);
  });

  /**
   * The knob's pointer is the one thing that rotates outside the slot turn. Under reduced
   * motion it must still arrive at its new angle — it simply stops sweeping there, which is
   * the sweep's duration going to zero and not the pointer going missing.
   */
  it('stops the knob pointer sweeping without stopping it moving', () => {
    expect(declarationsFor('.knob__pointer')).toMatch(
      /transition:\s*rotate\s*calc\(var\(--duration-fast\)\s*\*\s*var\(--motion-scale\)\)/,
    );
  });
});

// ---------------------------------------------------------------------------
// §4.1: nothing outside tokens.css holds a raw color, measure or duration.
// ---------------------------------------------------------------------------

describe('no raw values outside the tokens', () => {
  /** Everything below the `@import` — the component tier, the reset and the components. */
  const body = css.slice(css.indexOf("@import './tokens.css';"));

  it('names no hex color', () => {
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('names no oklch color', () => {
    expect(body).not.toMatch(/oklch\(/);
  });

  it('names no rgb or hsl color', () => {
    expect(body).not.toMatch(/\b(rgba?|hsla?)\(/);
  });

  it('names no bare millisecond duration', () => {
    expect(body).not.toMatch(/:\s*\d+m?s\b/);
  });

  it('names no primitive token', () => {
    expect(body).not.toMatch(/var\(--c-[\w-]+\)/);
  });
});
