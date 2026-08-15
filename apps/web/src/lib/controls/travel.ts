/**
 * The mechanics both hardware controls share — a knob and a fader are the same value with two
 * shapes, and the half a person operates by keyboard must not depend on which shape it wore.
 *
 * ui-sensibility §10 asks that a slider's value be "reachable by keyboard in sensible
 * increments", and §13 asks for real slider semantics. Neither is a rendering concern, so
 * neither lives in a component: this module owns the value arithmetic and the key map, the
 * components own the geometry, and the interesting half is a plain assertion rather than a
 * browser pass (§15).
 */

export type Travel = {
  readonly min: number;
  readonly max: number;
  /** One arrow key. */
  readonly step: number;
  /** Shift and an arrow, or a page key. Always a multiple of `step`, or the two disagree. */
  readonly bigStep: number;
};

/** How many decimals `step` implies, so 0.05 three times over is 0.15 and not 0.150000002. */
function decimalsOf(step: number): number {
  const text = String(step);
  const point = text.indexOf('.');
  return point === -1 ? 0 : text.length - point - 1;
}

/**
 * Clamped to the ends and landed on a step. A drag can overshoot and a drag can land between
 * two steps; neither is an error, and both have one right answer.
 */
export function snap(travel: Travel, value: number): number {
  if (!Number.isFinite(value)) return travel.min;
  const bounded = Math.min(travel.max, Math.max(travel.min, value));
  const stepped = travel.min + Math.round((bounded - travel.min) / travel.step) * travel.step;
  const landed = Math.min(travel.max, Math.max(travel.min, stepped));
  return Number(landed.toFixed(decimalsOf(travel.step)));
}

/** Where a value sits between the ends, 0..1. What a pointer line and a cap are drawn from. */
export function fractionOf(travel: Travel, value: number): number {
  const span = travel.max - travel.min;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (value - travel.min) / span));
}

export function valueAtFraction(travel: Travel, fraction: number): number {
  return snap(travel, travel.min + fraction * (travel.max - travel.min));
}

export type TravelKey = {
  readonly key: string;
  readonly shiftKey: boolean;
};

/**
 * The key map, shared by every control here so they cannot drift apart: arrows step, shift
 * and a page key step larger, Home and End jump to the ends. Null where the key means nothing
 * to a slider, which is the signal to leave the event alone rather than swallow it.
 */
export function keyedValue(travel: Travel, value: number, event: TravelKey): number | null {
  const large = event.shiftKey ? travel.bigStep : travel.step;

  switch (event.key) {
    case 'ArrowUp':
    case 'ArrowRight':
      return snap(travel, value + large);
    case 'ArrowDown':
    case 'ArrowLeft':
      return snap(travel, value - large);
    case 'PageUp':
      return snap(travel, value + travel.bigStep);
    case 'PageDown':
      return snap(travel, value - travel.bigStep);
    case 'Home':
      return travel.min;
    case 'End':
      return travel.max;
    default:
      return null;
  }
}

/**
 * How far a pointer moves for the full sweep of a knob. Chosen by hand rather than derived
 * from the knob's own diameter: a rotary control on a desk is turned with the wrist, and the
 * travel that feels right is a property of the hand, not of how big the cap is.
 */
export const KNOB_SWEEP_PX = 150;

/**
 * Dragging a knob. Up is more, which is the only direction anyone expects, and the ratio is
 * fixed rather than accelerating — a control that moves further the faster you drag cannot be
 * returned to a value you have already found.
 */
export function draggedValue(
  travel: Travel,
  startValue: number,
  pixelsMoved: number,
  sweepPx: number = KNOB_SWEEP_PX,
): number {
  const span = travel.max - travel.min;
  return snap(travel, startValue + (pixelsMoved / sweepPx) * span);
}
