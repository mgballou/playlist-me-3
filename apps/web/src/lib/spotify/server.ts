/**
 * The server-side entry point to the client factory: read the session cookie, hand the
 * decision to `chooseClient`, and let a refreshed session write itself back where the
 * context allows it.
 *
 * **Tokens stop here.** Nothing this module returns is meant to cross to the browser — a
 * server action returns the resolved pool, never the client and never the session (§5.3).
 */

import { cookies } from 'next/headers';

import { SESSION_COOKIE, sessionCookieOptions } from '../auth/cookies';
import type { Session } from '../auth/session';
import { openSession, sealSession } from '../auth/session';
import { readSpotifyEnv } from '../env';
import type { Connection } from './connection';
import { describeConnection } from './connection';
import type { SpotifyHandle } from './factory';
import { chooseClient } from './factory';

async function readSession(secret: string): Promise<Session | null> {
  const sealed = (await cookies()).get(SESSION_COOKIE)?.value;
  if (sealed === undefined || sealed.length === 0) return null;
  return openSession(sealed, secret);
}

export async function getSpotifyHandle(): Promise<SpotifyHandle> {
  const reading = readSpotifyEnv();
  if (reading.kind === 'demo') return chooseClient({ reading, session: null });

  const session = await readSession(reading.env.sessionSecret);
  return chooseClient({
    reading,
    session,
    writeSession: async (refreshed) => {
      // Throws in a render, which `chooseClient` catches. In a server action it persists,
      // which is where refreshing actually matters. §5.3.1
      const store = await cookies();
      const sealed = await sealSession(refreshed, reading.env.sessionSecret);
      store.set(SESSION_COOKIE, sealed, sessionCookieOptions(isSecure()));
    },
  });
}

function isSecure(): boolean {
  return process.env['NODE_ENV'] === 'production';
}

export async function getConnection(): Promise<Connection> {
  return describeConnection(await getSpotifyHandle());
}
