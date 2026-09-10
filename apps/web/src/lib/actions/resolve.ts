'use server';

/**
 * The impure half of spec §3.1, and the only part of the loop that touches the network.
 *
 * It runs on the server because that is where the tokens are and where they stay (§5.3).
 * What comes back is the resolved pool, the person's own sets, the resolve report and what
 * it cost — data, all of it, and nothing that could be used to call Spotify again.
 *
 * The client does everything else. `build` is pure and instant, so re-roll, lock, reject and
 * reorder happen in the browser against the pool already in hand (ui-sensibility §2.10).
 * **Never re-fetch to re-roll.**
 *
 * Reading the person is `../workbench/context`. It is a plain module rather than a second
 * export of this one because every export of a `'use server'` file is a public endpoint.
 */

import { resolveSources } from '@pm/spotify';

import { toErrorSurface } from '../errors/surface';
import { getSpotifyHandle } from '../spotify/server';
import { resolveContext } from '../workbench/context';
import type { ResolveOutcome } from '../workbench/outcome';
import type { ResolveRequest } from '../workbench/resolve-request';

export async function resolveWorkbench(request: ResolveRequest): Promise<ResolveOutcome> {
  const handle = await getSpotifyHandle();

  try {
    const resolved = await resolveSources({ client: handle.client, sources: request.sources });
    const context = await resolveContext(handle.client, request);

    return {
      ok: true,
      resolved: {
        pool: resolved.pool,
        context,
        report: resolved.report,
        requests: handle.client.requests.snapshot().total,
        mode: handle.mode,
      },
    };
  } catch (cause) {
    return { ok: false, error: toErrorSurface(cause) };
  }
}
