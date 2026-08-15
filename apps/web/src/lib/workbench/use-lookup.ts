'use client';

/**
 * Search-as-you-type, done the way §10 asks: **debounced and cancellable, and a stale
 * response never overwrites a fresh one.**
 *
 * The staleness guard is a sequence number rather than an `AbortController`, because a server
 * action's promise cannot be aborted from the browser — the request may well land, and what
 * matters is that a slow answer to an old query cannot overwrite the answer to the current
 * one. Counting is the honest version of that: it does not pretend to have cancelled
 * anything, it just refuses to believe a late answer.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { CatalogLookup } from './catalog';

/** Long enough that a fast typist spends one request, short enough to feel caused (§2.10). */
export const LOOKUP_DEBOUNCE_MS = 250;

export type LookupState<T> = {
  readonly query: string;
  readonly items: readonly T[];
  readonly looking: boolean;
  readonly message: string | null;
};

export type Lookup<T> = LookupState<T> & {
  setQuery(next: string): void;
};

export function useLookup<T>(run: (query: string) => Promise<CatalogLookup<T>>): Lookup<T> {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<readonly T[]>([]);
  const [looking, setLooking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const latest = useRef(0);
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    if (query.trim().length === 0) {
      setItems([]);
      setLooking(false);
      setMessage(null);
      return;
    }

    const ticket = (latest.current += 1);
    setLooking(true);

    const timer = setTimeout(() => {
      void runRef.current(query).then((outcome) => {
        if (ticket !== latest.current) return;
        setLooking(false);
        if (outcome.ok) {
          setItems(outcome.items);
          setMessage(null);
        } else {
          setItems([]);
          setMessage(outcome.message);
        }
      });
    }, LOOKUP_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [query]);

  const update = useCallback((next: string) => {
    setQuery(next);
  }, []);

  return { query, items, looking, message, setQuery: update };
}
