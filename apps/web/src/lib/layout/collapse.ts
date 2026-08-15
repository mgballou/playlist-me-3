/**
 * **Collapse is one decision, shared.** ui-sensibility §7: below a threshold the rack and
 * the deck stack, and every part reads the same answer so they can never disagree about
 * whether there is room.
 *
 * That rules out the ordinary arrangement — a media query in the stylesheet and a
 * `matchMedia` in a hook — because those are two numbers that drift. Instead the query lives
 * here, once, and everything reads it:
 *
 * - the script below stamps `data-collapsed` on the root before first paint, so the layout
 *   is right without a flash and without JavaScript having rendered anything yet;
 * - `useIsCollapsed` subscribes to the same query for anything that needs the answer as a
 *   value (a collapsed panel must be inert, not merely hidden);
 * - the stylesheet selects on `[data-collapsed='true']` and names no width at all.
 */

export const COLLAPSE_MAX_WIDTH_PX = 900;

/** `max-width` is inclusive, so the fraction keeps the boundary pixel on the wide side. */
export const COLLAPSE_QUERY = `(max-width: ${String(COLLAPSE_MAX_WIDTH_PX - 0.02)}px)`;

export const COLLAPSE_ATTRIBUTE = 'data-collapsed';

export const COLLAPSE_INIT_SCRIPT = `(function(){try{
var m=window.matchMedia(${JSON.stringify(COLLAPSE_QUERY)});
document.documentElement.setAttribute(${JSON.stringify(COLLAPSE_ATTRIBUTE)},m.matches?'true':'false');
}catch(e){}})();`;
