/**
 * What the crown says about the connection, as data rather than as words chosen by a
 * component. ui-sensibility §12.1: **demo mode announces itself in the crown, permanently**,
 * and a person must never believe they are looking at real Spotify results.
 *
 * The notice comes from `@pm/spotify`'s own `DEMO_NOTICE`, so the fixtures and the interface
 * cannot disagree about whether the data is invented.
 */

import { DEMO_NOTICE } from '@pm/spotify';

import { describeDemoReason, type DemoReason } from '../env';
import type { DemoCause, SpotifyHandle } from './factory';

export type Connection = {
  readonly mode: 'live' | 'demo';
  readonly cause: DemoCause | null;
  /** Short enough for the crown. */
  readonly label: string;
  /** The full sentence, for the title attribute and the empty-bench copy. */
  readonly notice: string;
  /** What to do about it, when there is something to do. §2.7 — no dead ends. */
  readonly nextStep: string | null;
};

const CONNECT_STEP = 'Connect Spotify to build against your own library.';

export function describeConnection(handle: SpotifyHandle): Connection {
  if (handle.mode === 'live') {
    return {
      mode: 'live',
      cause: null,
      label: 'connected',
      notice: 'Connected to Spotify.',
      nextStep: null,
    };
  }

  const detail = handle.reasons.map(describeDemoReason).join(' ');
  return {
    mode: 'demo',
    cause: handle.cause,
    label: 'demo mode',
    notice: detail.length === 0 ? DEMO_NOTICE : `${DEMO_NOTICE} ${detail}`,
    nextStep: handle.cause === 'noSession' ? CONNECT_STEP : null,
  };
}

export function demoReasonLines(reasons: readonly DemoReason[]): readonly string[] {
  return reasons.map(describeDemoReason);
}
