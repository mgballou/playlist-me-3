'use client';

/**
 * An LED. ui-sensibility §5 rule 4: **amber reports, red acts** — a small illuminated dot,
 * amber for ordinary state and the bright accent for something held or armed.
 *
 * > An LED is never the only carrier of a state — it always sits beside a word or a glyph,
 * > because red and amber are 48° apart and that is not enough for everyone.
 *
 * That rule is enforced here rather than remembered: `label` is required, and it is always in
 * the document. A caller that already shows the state as a glyph — the padlock on a track
 * slot — passes `quiet`, which hides the word from the page and leaves it for a screen
 * reader; the glyph is then the visible carrier and the rule still holds. There is no way to
 * render one of these with nothing but a color.
 */

export type LedTone = 'report' | 'held';

export type LedProps = {
  /** Dark when false. An unlit lamp is the honest picture of a state that is not on. */
  readonly lit: boolean;
  /** `report` is the amber one. `held` is the bright accent, for armed or latched. */
  readonly tone?: LedTone | undefined;
  /** Required, and always in the document. §5 rule 4. */
  readonly label: string;
  /** Keep the word for a screen reader only, where a visible glyph already carries it. */
  readonly quiet?: boolean | undefined;
};

export function Led({ lit, tone = 'report', label, quiet = false }: LedProps) {
  return (
    <span className="led" data-lit={lit ? 'true' : 'false'} data-tone={tone}>
      <span className="led__lamp" aria-hidden="true" />
      <span className={quiet ? 'led__word visually-hidden' : 'led__word label'}>{label}</span>
    </span>
  );
}
