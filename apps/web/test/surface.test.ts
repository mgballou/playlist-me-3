// @vitest-environment node
// Reads globals.css off disk. jsdom loads no stylesheets, so the layer order and the
// reduced-motion branch are asserted against the source rather than against a fake layout.
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

/** The block of declarations for one selector, so a rule can be read rather than grepped. */
function ruleFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css);
  if (match === null || match[2] === undefined) {
    throw new Error(`no rule for ${selector} in globals.css`);
  }
  return match[2];
}

function zIndexOf(selector: string): string {
  const declaration = /z-index:\s*var\((--[\w-]+)\)/.exec(ruleFor(selector));
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
    expect(ruleFor('.ledger')).not.toMatch(/opacity/);
  });

  it('leaves the ledger out of the overlay scrim', () => {
    expect(ruleFor('.overlay__scrim')).toMatch(/position:\s*absolute/);
  });
});

// ---------------------------------------------------------------------------
// §5 rule 4 and §8: the press is the signature motion, identical everywhere, and
// its reduced branch changes fill instead of translating.
// ---------------------------------------------------------------------------

const PRESSABLE = ['.act', '.act--secondary', '.draft__kind', '.picker__choice', '.slot__act'];

/** The press is written the same way for every raised control, or it reads as a bug. §5 */
function pressRule(selector: string): string {
  return ruleFor(`${selector}:active:not(:disabled)`);
}

describe('the press', () => {
  it.each(PRESSABLE)('%s translates into its own shadow on press', (selector) => {
    expect(pressRule(selector)).toMatch(/translate:/);
  });

  it.each(PRESSABLE)('%s scales its press by --motion-scale', (selector) => {
    expect(pressRule(selector)).toMatch(/var\(--motion-scale\)/);
  });

  it.each(PRESSABLE)(
    '%s changes fill on press, so the reduced branch still answers',
    (selector) => {
      expect(pressRule(selector)).toMatch(/background/);
    },
  );
});

// ---------------------------------------------------------------------------
// §8: reduced motion is designed, not stripped. Nothing visible under normal
// motion may go missing.
// ---------------------------------------------------------------------------

describe('reduced motion', () => {
  it('is honored at the token layer, so no caller has to remember', () => {
    expect(tokens).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });

  it('flips --motion-scale to zero, which collapses every press translate', () => {
    expect(tokens).toMatch(/--motion-scale:\s*0/);
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
});

// ---------------------------------------------------------------------------
// §4.1: nothing outside tokens.css holds a raw color, measure or duration.
// ---------------------------------------------------------------------------

describe('no raw values outside the tokens', () => {
  /** Everything below the `@import` — the reset and the components. */
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
