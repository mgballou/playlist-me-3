import { describe, expect, it } from 'vitest';

import { COLLAPSE_ATTRIBUTE, COLLAPSE_INIT_SCRIPT, COLLAPSE_QUERY } from '@/lib/layout/collapse';
import {
  DEFAULT_CHOICE,
  THEME_ATTRIBUTE,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  nextChoice,
  readChoice,
  resolveTheme,
} from '@/lib/theme';

describe('resolution order', () => {
  it('follows the system when there is no explicit choice', () => {
    expect(resolveTheme({ choice: 'system', prefersDark: true })).toBe('dark');
  });

  it('is light by default on a system with no dark preference', () => {
    expect(resolveTheme({ choice: 'system', prefersDark: false })).toBe('light');
  });

  it('lets an explicit light choice beat a dark system preference', () => {
    expect(resolveTheme({ choice: 'light', prefersDark: true })).toBe('light');
  });

  it('lets an explicit dark choice beat a light system preference', () => {
    expect(resolveTheme({ choice: 'dark', prefersDark: false })).toBe('dark');
  });
});

describe('the stored choice', () => {
  it('defaults to following the system', () => {
    expect(readChoice(null)).toBe(DEFAULT_CHOICE);
  });

  it('reads back an explicit choice', () => {
    expect(readChoice('dark')).toBe('dark');
  });

  it('treats anything unrecognized as no choice at all', () => {
    expect(readChoice('purple')).toBe('system');
  });
});

describe('the toggle', () => {
  it('turns a light screen dark', () => {
    expect(nextChoice('light')).toBe('dark');
  });

  it('turns a dark screen light', () => {
    expect(nextChoice('dark')).toBe('light');
  });

  it('always lands on an explicit choice, so it persists', () => {
    expect(nextChoice('dark')).not.toBe('system');
  });
});

describe('the pre-paint script', () => {
  it('reads the same storage key the app writes', () => {
    expect(THEME_INIT_SCRIPT).toContain(THEME_STORAGE_KEY);
  });

  it('stamps the same attribute the tokens select on', () => {
    expect(THEME_INIT_SCRIPT).toContain(THEME_ATTRIBUTE);
  });

  it('runs a light theme for a system with no dark preference', () => {
    document.documentElement.removeAttribute(THEME_ATTRIBUTE);
    window.localStorage.clear();
    runScript(THEME_INIT_SCRIPT);
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('light');
  });

  it('honors a stored choice before anything renders', () => {
    document.documentElement.removeAttribute(THEME_ATTRIBUTE);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    runScript(THEME_INIT_SCRIPT);
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('dark');
    window.localStorage.clear();
  });
});

describe('the collapse decision', () => {
  it('is one query', () => {
    expect(COLLAPSE_INIT_SCRIPT).toContain(COLLAPSE_QUERY);
  });

  it('stamps the attribute the stylesheet selects on', () => {
    expect(COLLAPSE_INIT_SCRIPT).toContain(COLLAPSE_ATTRIBUTE);
  });

  it('names no width of its own', () => {
    expect(COLLAPSE_QUERY).toMatch(/^\(max-width: [\d.]+px\)$/);
  });
});

/** The same source the document head runs, executed against this window. */
function runScript(source: string): void {
  new Function(source)();
}
