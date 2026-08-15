'use client';

/**
 * The theme toggle. It lives in the crown (§7) and it is **navigation of a sort, not an act**
 * — so it takes the quiet tier and never the accent (§3).
 *
 * A glyph-only control keeps its name (§7): the label is a half-filled circle, the accessible
 * name says which theme it switches to.
 */

import { useTheme } from '@/lib/use-theme';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const target = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      className="act--quiet"
      onClick={toggle}
      aria-label={`Switch to the ${target} theme`}
    >
      <span aria-hidden="true">◐</span>
    </button>
  );
}
