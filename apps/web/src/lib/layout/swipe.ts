/**
 * **Swiping sideways moves between sections** (§7.1), and the keys are its single-pointer
 * alternative (§13's 2.5.7). Swipe is an accelerant, never the only path (§2.13) — so this
 * decides nothing the keys cannot also do, and it stays out of the way when it is unsure.
 *
 * Two guards make it feel like hardware rather than like a trap:
 *
 * - it wants real distance, so a tap that drifts is not a swipe;
 * - it wants the gesture to be **mostly** sideways, so a thumb scrolling a long deck never
 *   changes section by accident. That ratio is the whole difference between a swipe that
 *   helps and one people learn to hold their hand still to avoid.
 */

/** Far enough to be meant. Roughly a thumb's width on a phone. */
export const SWIPE_MIN_PX = 48;

/** How much more sideways than vertical a gesture has to be before it counts as one. */
export const SWIPE_RATIO = 1.5;

export type Swipe = {
  readonly dx: number;
  readonly dy: number;
};

/**
 * The step the keys would take, or null for a gesture that meant something else. Swiping
 * **left** pulls the next section in from the right, the way a page moves under a thumb.
 */
export function swipeStep({ dx, dy }: Swipe): -1 | 1 | null {
  const sideways = Math.abs(dx);
  if (sideways < SWIPE_MIN_PX) return null;
  if (sideways < Math.abs(dy) * SWIPE_RATIO) return null;
  return dx < 0 ? 1 : -1;
}

/**
 * A gesture that starts on a control whose own job is dragging belongs to that control. A
 * fader crossing the whole panel is a 200-track change; losing it to a section swipe would be
 * the accelerant eating the instrument.
 */
export function ownsGesture(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest('[role="slider"], input, select, textarea') !== null;
}
