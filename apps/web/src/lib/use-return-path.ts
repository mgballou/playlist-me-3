'use client';

/**
 * Where reconnecting should come back to. ui-sensibility §9: a token that expired says
 * "reconnect", and reconnecting **returns to exactly where they were**.
 *
 * Read after mount rather than during render, so the first client render matches the server's.
 * Before then it is `/`, which still restores the recipe and the seed from the held place
 * (§2.5) — the path only makes it exact.
 *
 * The outcome of the *previous* attempt is dropped on the way out. Without that, a bench
 * reached at `/?auth=refused` hands that parameter to the next sign-in as its return path, and
 * a connection that then succeeds lands on a screen saying Spotify refused it.
 */

import { useEffect, useState } from 'react';

import { withoutConnectionParams } from './errors/connection';

export function useReturnPath(): string {
  const [path, setPath] = useState('/');

  useEffect(() => {
    setPath(`${window.location.pathname}${withoutConnectionParams(window.location.search)}`);
  }, []);

  return path;
}
