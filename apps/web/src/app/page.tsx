/**
 * The bench. §2.1: **one persistent bench, not a wizard** — sources, exclusions, shape and
 * the resulting deck are on screen together, and there is no second route to navigate to.
 *
 * The only work this page does on the server is read the connection state, which decides what
 * the crown says about demo mode. Nothing here touches a token, and nothing here resolves —
 * resolving is a server action the workbench calls when the sources change (§3.1).
 */

import { Frame } from '@/components/shell/Frame';
import { getConnection } from '@/lib/spotify/server';

/**
 * Rendered per request, always. Without this the bench prerenders at build time — and since
 * an unconfigured build reads no session cookie, nothing would mark the page dynamic and the
 * crown would ship "demo mode" baked in for everyone, including a connected person. Getting
 * that wrong would break the one honesty rule this app cannot break (§12.1).
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const connection = await getConnection();
  return <Frame connection={connection} />;
}
