/**
 * One factory, one decision: `LiveSpotifyClient` when the app is configured **and** there is
 * a session; `FakeSpotifyClient` otherwise. Spec §5.1, §5.3.1.
 *
 * **Missing environment is demo mode, never a crash.** That is a hard requirement (§5.1,
 * ui-sensibility §14) — it is what lets someone clone the repo and see the app rather than
 * read about it, and it is what CI runs against. Nothing in this file throws on a missing
 * value.
 *
 * The token provider refreshes **server-side, ahead of expiry, on demand** (§5.3.1), and
 * dedupes: the live client fires many small requests through a concurrency limiter, and each
 * one asks for a token, so a naive provider would start a dozen refreshes at once.
 */

import type { SpotifyClient } from '@pm/spotify';
import { AuthFailed, FakeSpotifyClient, LiveSpotifyClient } from '@pm/spotify';

import type { Session } from '../auth/session';
import { applyRefresh, needsRefresh } from '../auth/session';
import type { TokenFetch } from '../auth/tokens';
import { refreshGrant } from '../auth/tokens';
import type { DemoReason, EnvReading, SpotifyEnv } from '../env';

/** Why the fake is in play. The crown says which, because "demo mode" alone is not a reason. */
export type DemoCause = 'notConfigured' | 'noSession';

export type SpotifyHandle =
  | { readonly mode: 'live'; readonly client: SpotifyClient }
  | {
      readonly mode: 'demo';
      readonly client: SpotifyClient;
      readonly cause: DemoCause;
      readonly reasons: readonly DemoReason[];
    };

/**
 * How a refreshed session gets written back. A route handler or a server action can set a
 * cookie; a server component render cannot, so this is allowed to fail quietly — the
 * refreshed token is still used for the request in hand.
 */
export type SessionWriter = (session: Session) => void | Promise<void>;

export type ChooseClientInput = {
  readonly reading: EnvReading;
  readonly session: Session | null;
  readonly writeSession?: SessionWriter | undefined;
  readonly fetchImpl?: TokenFetch | undefined;
  readonly now?: (() => number) | undefined;
};

function demoHandle(cause: DemoCause, reasons: readonly DemoReason[]): SpotifyHandle {
  return { mode: 'demo', client: new FakeSpotifyClient(), cause, reasons };
}

/**
 * Exported because the dedupe is the interesting behavior and it deserves its own test: the
 * live client fires many small requests through a concurrency limiter, and each one asks for
 * a token.
 */
export function createTokenProvider(args: {
  readonly env: SpotifyEnv;
  readonly session: Session;
  readonly writeSession: SessionWriter | undefined;
  readonly fetchImpl: TokenFetch | undefined;
  readonly now: () => number;
}): () => Promise<string> {
  let current = args.session;
  let inFlight: Promise<string> | null = null;

  const renew = async (): Promise<string> => {
    const refreshed = await refreshGrant({
      clientId: args.env.clientId,
      refreshToken: current.refreshToken,
      ...(args.fetchImpl === undefined ? {} : { fetchImpl: args.fetchImpl }),
    });
    if (!refreshed.ok) throw AuthFailed.tokenRejected();

    current = applyRefresh({ session: current, grant: refreshed.value, nowMs: args.now() });
    try {
      await args.writeSession?.(current);
    } catch {
      // A read-only context — a server component render. The token in hand is still good.
    }
    return current.accessToken;
  };

  return async () => {
    if (!needsRefresh(current, args.now())) return current.accessToken;
    inFlight ??= renew().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}

export function chooseClient(input: ChooseClientInput): SpotifyHandle {
  if (input.reading.kind === 'demo') return demoHandle('notConfigured', input.reading.reasons);
  if (input.session === null) return demoHandle('noSession', []);

  return {
    mode: 'live',
    client: new LiveSpotifyClient({
      getToken: createTokenProvider({
        env: input.reading.env,
        session: input.session,
        writeSession: input.writeSession,
        fetchImpl: input.fetchImpl,
        now: input.now ?? Date.now,
      }),
    }),
  };
}
