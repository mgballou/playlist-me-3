'use client';

/**
 * Reads the connection outcome off the URL once, and then takes it out of the URL.
 *
 * Both halves are the point. Left in place, `?auth=stateMismatch` reappears on every reload
 * and on every link shared from that bench, so a notice about a sign-in from last Tuesday
 * outlives the sign-in — and the parameter would ride along in the return path of the next
 * one. Read once, dropped, and held in state until something navigates.
 *
 * Read after mount rather than during render, for the reason `useReturnPath` gives: the first
 * client render has to match the server's, and `history` does not exist during one.
 *
 * Only the two connection parameters are removed, and that is what keeps this out of the way
 * of everything else reading the same query string. A shared recipe arrives in `?r=`, which
 * `useWorkbenchState` reads from `window.location.search` in an effect that runs *after* this
 * one — effects run child first, and the provider is the parent — so `?r=` surviving the edit
 * untouched is load-bearing rather than tidy.
 */

import { useEffect, useState } from 'react';

import {
  connectionOutcomeFromSearch,
  describeConnectionOutcome,
  withoutConnectionParams,
} from './connection';
import type { ErrorSurface } from './surface';

export function useConnectionFailure(): ErrorSurface | null {
  const [failure, setFailure] = useState<ErrorSurface | null>(null);

  useEffect(() => {
    const { pathname, search, hash } = window.location;
    const outcome = connectionOutcomeFromSearch(search);
    if (outcome === null) return;

    setFailure(describeConnectionOutcome(outcome));
    // `null`, and not `window.history.state`. Next patches `replaceState` to copy its own keys
    // across and to keep `usePathname` and `useSearchParams` in step, but it skips both when
    // the state handed in already carries `__NA` — so passing the existing state back reads as
    // careful and quietly opts out of the router sync. The documented form is `null`.
    window.history.replaceState(null, '', `${pathname}${withoutConnectionParams(search)}${hash}`);
  }, []);

  return failure;
}
