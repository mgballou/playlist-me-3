'use client';

/**
 * Where reconnecting should come back to. ui-sensibility §9: a token that expired says
 * "reconnect", and reconnecting **returns to exactly where they were**.
 *
 * Read after mount rather than during render, so the first client render matches the server's.
 * Before then it is `/`, which still restores the recipe and the seed from the held place
 * (§2.5) — the path only makes it exact.
 */

import { useEffect, useState } from 'react';

export function useReturnPath(): string {
  const [path, setPath] = useState('/');

  useEffect(() => {
    setPath(`${window.location.pathname}${window.location.search}`);
  }, []);

  return path;
}
