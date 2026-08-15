/**
 * What a resolve hands back. These live outside the `'use server'` module because a file
 * marked `'use server'` may export nothing but async functions — and because the browser
 * wants these shapes as types, never the function that produces them.
 */

import type { TrackPool } from '@pm/core';
import type { ResolveReport } from '@pm/spotify';

import type { ErrorSurface } from '../errors/surface';
import type { ContextPayload } from './resolve-request';

export type ResolvedWorkbench = {
  readonly pool: TrackPool;
  readonly context: ContextPayload;
  readonly report: ResolveReport;
  /** What this resolve cost. The ledger shows it — hiding the budget helps nobody. §5.2 */
  readonly requests: number;
  readonly mode: 'live' | 'demo';
};

export type ResolveOutcome =
  | { readonly ok: true; readonly resolved: ResolvedWorkbench }
  | { readonly ok: false; readonly error: ErrorSurface };
