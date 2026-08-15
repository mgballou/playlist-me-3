'use client';

/**
 * The theme as state. The pre-paint script in `theme.ts` has already put the right value on
 * the root, so this hook's job is only to keep it true afterwards — and to persist an
 * explicit choice, which wins over `prefers-color-scheme` (§4.2).
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import type { Theme, ThemeChoice } from './theme';
import {
  DARK_QUERY,
  DEFAULT_CHOICE,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
  nextChoice,
  readChoice,
  resolveTheme,
} from './theme';

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', onChange);
  return () => {
    query.removeEventListener('change', onChange);
  };
}

function getSnapshot(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

/** The server has no preference to read. Light is the default (§4.2). */
function getServerSnapshot(): boolean {
  return false;
}

export type ThemeControl = {
  readonly theme: Theme;
  readonly choice: ThemeChoice;
  setChoice(choice: ThemeChoice): void;
  toggle(): void;
};

export function useTheme(): ThemeControl {
  const prefersDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [choice, setChoiceState] = useState<ThemeChoice>(DEFAULT_CHOICE);

  // Read after mount rather than during render: the first client render has to match the
  // server's, and the script in the head has already handled the paint.
  useEffect(() => {
    setChoiceState(readChoice(window.localStorage.getItem(THEME_STORAGE_KEY)));
  }, []);

  const theme = resolveTheme({ choice, prefersDark });

  useEffect(() => {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
  }, [theme]);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage refused. The choice still holds for this visit; it just will not persist.
    }
  }, []);

  const toggle = useCallback(() => {
    setChoice(nextChoice(resolveTheme({ choice, prefersDark })));
  }, [choice, prefersDark, setChoice]);

  return { theme, choice, setChoice, toggle };
}
