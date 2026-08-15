'use client';

/**
 * The crown. §7: it never moves and never rebuilds, and it carries three things and nothing
 * else — the pool count, the connection state, and the theme toggle.
 *
 * **Demo mode announces itself here, permanently** (§12.1). A person must never think they
 * are looking at real Spotify results, so the notice is a standing part of the crown rather
 * than a toast that goes away.
 */

import { format } from '@pm/core';

import { ThemeToggle } from '@/components/theme/ThemeToggle';
import type { Connection } from '@/lib/spotify/connection';
import { useReturnPath } from '@/lib/use-return-path';
import { useWorkbench } from '@/lib/workbench/use-workbench';

export type CrownProps = {
  readonly connection: Connection;
};

export function Crown({ connection }: CrownProps) {
  const { pool, status } = useWorkbench();
  const returnPath = useReturnPath();

  return (
    <header className="crown">
      <span className="crown__wordmark">Playlist.me</span>

      <span className="crown__state">
        {connection.mode === 'demo' ? (
          <span className="crown__demo label" title={connection.notice}>
            <span aria-hidden="true">▚</span>
            demo mode
            <span className="visually-hidden">— {connection.notice}</span>
          </span>
        ) : (
          <span className="label muted">connected</span>
        )}

        {/* Connecting and disconnecting take you somewhere, so they are structural and
            stay quiet — the accent means act, and navigation never takes it. §3 */}
        {connection.cause === 'noSession' ? (
          <a
            className="act--quiet"
            href={`/api/auth/login?returnTo=${encodeURIComponent(returnPath)}`}
          >
            Connect Spotify
          </a>
        ) : null}

        {connection.mode === 'live' ? (
          <form
            method="post"
            action={`/api/auth/logout?returnTo=${encodeURIComponent(returnPath)}`}
          >
            <button type="submit" className="act--quiet">
              Disconnect
            </button>
          </form>
        ) : null}

        <span className="numeric" aria-live="polite">
          {status === 'resolving'
            ? 'resolving…'
            : `${format({ kind: 'trackCount', count: pool.length })} in pool`}
        </span>

        <ThemeToggle />
      </span>
    </header>
  );
}
