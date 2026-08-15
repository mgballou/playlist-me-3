/**
 * One shared formatting function, as CLAUDE.md's Interface section requires: "Number and
 * duration formatting is one shared function, used everywhere."
 *
 * It is one function rather than four because four drift. A discriminated union keeps
 * the call sites readable without letting a second rounding rule in through the back
 * door.
 */

import { unreachable } from './errors';

export type FormatSpec =
  /** A single track's running time: 3:45, 1:02:30. */
  | { readonly kind: 'trackDuration'; readonly ms: number }
  /** A playlist's running time in words: 48 min, 1 hr 12 min. */
  | { readonly kind: 'duration'; readonly ms: number }
  | { readonly kind: 'trackCount'; readonly count: number }
  /** Both, for a deck header: 12 tracks · 48 min. */
  | { readonly kind: 'summary'; readonly count: number; readonly ms: number };

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

function wholeSeconds(ms: number): number {
  return Math.max(0, Math.round(ms / MS_PER_SECOND));
}

function clockTime(ms: number): string {
  const seconds = wholeSeconds(ms);
  const hours = Math.floor(seconds / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR));
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE) % MINUTES_PER_HOUR;
  const rest = seconds % SECONDS_PER_MINUTE;
  const padded = String(rest).padStart(2, '0');
  if (hours === 0) return `${String(minutes)}:${padded}`;
  return `${String(hours)}:${String(minutes).padStart(2, '0')}:${padded}`;
}

function spokenDuration(ms: number): string {
  const totalMinutes = Math.round(wholeSeconds(ms) / SECONDS_PER_MINUTE);
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  if (hours === 0) return `${String(minutes)} min`;
  if (minutes === 0) return `${String(hours)} hr`;
  return `${String(hours)} hr ${String(minutes)} min`;
}

function trackCount(count: number): string {
  const whole = Math.max(0, Math.trunc(count));
  return whole === 1 ? '1 track' : `${String(whole)} tracks`;
}

export function format(spec: FormatSpec): string {
  switch (spec.kind) {
    case 'trackDuration':
      return clockTime(spec.ms);
    case 'duration':
      return spokenDuration(spec.ms);
    case 'trackCount':
      return trackCount(spec.count);
    case 'summary':
      return `${trackCount(spec.count)} · ${spokenDuration(spec.ms)}`;
    default:
      return unreachable(spec);
  }
}
