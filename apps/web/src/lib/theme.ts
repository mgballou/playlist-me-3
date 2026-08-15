/**
 * Theme resolution, in one place and pure. ui-sensibility §4.2: light is the default,
 * `prefers-color-scheme` is respected, **an explicit choice wins over it and persists**.
 *
 * `tokens.css` does the rest — the root carries `data-theme`, that sets `color-scheme`, and
 * every `light-dark()` token follows. Nothing here names a color.
 *
 * The script below runs **before hydration**, in the document head, so the first paint is
 * already the right theme. A `useEffect` here would ship a flash of the wrong one.
 */

export type Theme = 'light' | 'dark';
export type ThemeChoice = Theme | 'system';

export const THEME_STORAGE_KEY = 'pm.theme';
export const THEME_ATTRIBUTE = 'data-theme';
export const DARK_QUERY = '(prefers-color-scheme: dark)';

/** No stored choice means follow the system, which on most systems means light. */
export const DEFAULT_CHOICE: ThemeChoice = 'system';

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** Anything unrecognized in storage is treated as no choice at all. */
export function readChoice(raw: string | null | undefined): ThemeChoice {
  return isThemeChoice(raw) ? raw : DEFAULT_CHOICE;
}

export function resolveTheme(args: {
  readonly choice: ThemeChoice;
  readonly prefersDark: boolean;
}): Theme {
  if (args.choice === 'light' || args.choice === 'dark') return args.choice;
  return args.prefersDark ? 'dark' : 'light';
}

/** The toggle is one control, so it flips to the opposite of what is on screen. */
export function nextChoice(current: Theme): ThemeChoice {
  return current === 'dark' ? 'light' : 'dark';
}

/**
 * Written out rather than bundled, because it has to run before React does. It reads the
 * same storage key and stamps the same attribute the rest of the app uses — both come from
 * the constants above, so there is one spelling of each.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var c=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
if(c!=='light'&&c!=='dark'&&c!=='system')c='system';
var d=c==='dark'||(c==='system'&&window.matchMedia(${JSON.stringify(DARK_QUERY)}).matches);
document.documentElement.setAttribute(${JSON.stringify(THEME_ATTRIBUTE)},d?'dark':'light');
}catch(e){}})();`;
