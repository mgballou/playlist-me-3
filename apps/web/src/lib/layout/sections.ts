/**
 * The four sections — SOURCES, BLOCK, SHAPE, DECK — as identity, as travel, and as counts.
 * ui-sensibility §7.1: **narrow is paged, not stacked.**
 *
 * Nothing in here touches the DOM, which is deliberate: what a key says, which key a swipe or
 * an arrow lands on, and which element ids tie a key to its panel are all decisions that can
 * be asserted as plain values rather than driven through a render.
 *
 * **The counts live here rather than in the four modules**, and that is the load-bearing part.
 * §7.1's whole claim is that `BLOCK −68` stays legible while the person is looking at the
 * deck — so the number on a key and the number in that section's heading band must be the
 * same number, by construction rather than by two components agreeing today.
 */

import type { BuildResult, Recipe } from '@pm/core';
import { format } from '@pm/core';

export const SECTIONS = ['sources', 'block', 'shape', 'deck'] as const;

export type SectionId = (typeof SECTIONS)[number];

export type SectionDefinition = {
  readonly id: SectionId;
  /** The name on the key and in the section's own heading band. One name, one place. */
  readonly label: string;
  readonly glyph: string;
};

export const SECTION_DEFINITIONS: Record<SectionId, SectionDefinition> = {
  sources: { id: 'sources', label: 'Sources', glyph: '▶' },
  block: { id: 'block', label: 'Block', glyph: '✕' },
  shape: { id: 'shape', label: 'Shape', glyph: '⚙' },
  deck: { id: 'deck', label: 'Deck', glyph: '⏻' },
};

/**
 * Where a first visit starts. The recipe is the app (§7), so it starts on the recipe's first
 * section rather than on the result of a recipe that does not exist yet.
 */
export const DEFAULT_SECTION: SectionId = 'sources';

export function isSectionId(value: unknown): value is SectionId {
  return typeof value === 'string' && (SECTIONS as readonly string[]).includes(value);
}

export function sectionKeyId(section: SectionId): string {
  return `section-key-${section}`;
}

export function sectionPanelId(section: SectionId): string {
  return `section-panel-${section}`;
}

/**
 * One step along the keys. **It clamps rather than wrapping**, and that is a decision the
 * spec left open: the keys are a row of hardware in a fixed order, and a swipe left off the
 * end of a console does not land you back at the first key. `Home` and `End` still reach both
 * ends in one press, so nothing is out of reach.
 */
export function stepSection(current: SectionId, step: -1 | 1): SectionId {
  const at = SECTIONS.indexOf(current);
  const next = Math.min(SECTIONS.length - 1, Math.max(0, at + step));
  return SECTIONS[next] ?? current;
}

/**
 * The tablist's keyboard contract (§13, and the ARIA tabs pattern this resolves to). Returns
 * null for every key it does not own, so a caller can leave the event alone.
 */
export function sectionForKey(current: SectionId, key: string): SectionId | null {
  switch (key) {
    case 'ArrowLeft':
      return stepSection(current, -1);
    case 'ArrowRight':
      return stepSection(current, 1);
    case 'Home':
      return SECTIONS[0] ?? current;
    case 'End':
      return SECTIONS[SECTIONS.length - 1] ?? current;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// What each key carries. §7.1
// ---------------------------------------------------------------------------

export function sourcesCount(recipe: Recipe): string {
  return String(recipe.sources.length);
}

/**
 * Before a build, and while nothing is blocked, the count is how many blocks there are. Once
 * a build has run against at least one block it becomes **what they removed**, which is the
 * number worth looking at (§2.3). "−0" would be neither.
 */
export function blockCount(recipe: Recipe, result: BuildResult | null): string {
  const removed = result?.report.reject.removedCount ?? null;
  return removed === null || recipe.exclusions.length === 0
    ? String(recipe.exclusions.length)
    : `−${String(removed)}`;
}

export function shapeCount(recipe: Recipe): string {
  const { target } = recipe.shape;
  return target.kind === 'count'
    ? String(target.count)
    : format({ kind: 'duration', ms: target.ms });
}

/**
 * The key carries the track count alone, where the deck's own heading band carries the count
 * and the running time. A key is four characters wide on a phone; the summary is not.
 */
export function deckCount(result: BuildResult | null): string {
  return result === null ? '—' : String(result.report.trackCount);
}

export function sectionCounts(
  recipe: Recipe,
  result: BuildResult | null,
): Record<SectionId, string> {
  return {
    sources: sourcesCount(recipe),
    block: blockCount(recipe, result),
    shape: shapeCount(recipe),
    deck: deckCount(result),
  };
}
