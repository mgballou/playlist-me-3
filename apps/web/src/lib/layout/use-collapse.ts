'use client';

/**
 * The collapse answer as a value, from the one query in `collapse.ts`. Keeping the
 * subscription in `useSyncExternalStore` rather than in an effect means a component reading
 * this and the stylesheet selecting on `data-collapsed` can never be a frame apart.
 */

import { useEffect, useSyncExternalStore } from 'react';

import { COLLAPSE_ATTRIBUTE, COLLAPSE_QUERY } from './collapse';

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(COLLAPSE_QUERY);
  query.addEventListener('change', onChange);
  return () => {
    query.removeEventListener('change', onChange);
  };
}

function getSnapshot(): boolean {
  return window.matchMedia(COLLAPSE_QUERY).matches;
}

/** The server has no viewport. The pre-paint script settles it before anything is seen. */
function getServerSnapshot(): boolean {
  return false;
}

export function useIsCollapsed(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Keeps the root attribute honest after the pre-paint script has run. */
export function useCollapseAttribute(): boolean {
  const collapsed = useIsCollapsed();
  useEffect(() => {
    document.documentElement.setAttribute(COLLAPSE_ATTRIBUTE, collapsed ? 'true' : 'false');
  }, [collapsed]);
  return collapsed;
}
