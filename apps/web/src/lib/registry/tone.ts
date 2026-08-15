/**
 * Turning a tone token into a style, in one place.
 *
 * §12 asks that one place, and one only, turns a tone into a look. This is it: the registry
 * hands out a semantic token name, this hands back a style that sets `--chip-tone` from it,
 * and the stylesheet does the rest. No component ever holds a color.
 *
 * The cast is the one CLAUDE.md allows — a type genuinely cannot express it. React's
 * `CSSProperties` is a closed map of known CSS properties, and a custom property is by
 * definition not one of them, so there is no guard that could narrow to it.
 */

import type { CSSProperties } from 'react';

export function toneStyle(token: string): CSSProperties {
  return { '--chip-tone': `var(${token})` } as CSSProperties;
}
