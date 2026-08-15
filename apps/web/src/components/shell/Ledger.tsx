'use client';

/**
 * The ledger — the lowest layer of chrome and the highest layer of attention: what the build
 * did, and the one way out of the app. **Nothing may dim it** (§7), which is why it sits at
 * `--z-ledger` above the rack and above an overlay, and why the picker overlays are opened
 * non-modally rather than through `showModal()` (see `primitives/Overlay.tsx`).
 *
 * Two honest things live here rather than being hidden: what the build cost in requests
 * (§5.2), and which constraint is binding when the target could not be reached (§2.3).
 *
 * One accent, and it is **Save to Spotify** (§3). The shelf is navigation — it takes you
 * somewhere rather than doing something — so it stays quiet however much it wants the eye.
 */

import { format } from '@pm/core';
import { useState } from 'react';

import { SaveFlow } from '@/components/ledger/SaveFlow';
import { shortfallCopy } from '@/lib/registry/shortfall';
import { Shelf } from '@/components/shelf/Shelf';
import type { Connection } from '@/lib/spotify/connection';
import { useWorkbench } from '@/lib/workbench/use-workbench';

export type LedgerProps = {
  readonly connection: Connection;
};

export function Ledger({ connection }: LedgerProps) {
  const { result, requests, status } = useWorkbench();
  const [saving, setSaving] = useState(false);
  const [shelfOpen, setShelfOpen] = useState(false);
  const shortfall = result?.report.select.shortfall ?? null;

  const nothingToSave = result === null || result.report.trackCount === 0;

  return (
    <>
      <footer className="ledger">
        <span className="ledger__summary">
          <span aria-hidden="true">▸</span>
          <span className="numeric">
            {result === null
              ? 'nothing built yet'
              : format({
                  kind: 'summary',
                  count: result.report.trackCount,
                  ms: result.report.totalDurationMs,
                })}
          </span>

          {shortfall === null ? null : (
            <span className="muted">
              short of the target — {shortfallCopy(shortfall.reason).summary}
            </span>
          )}

          {requests === 0 ? null : (
            <span className="numeric muted" title="What the last resolve cost Spotify's quota.">
              {String(requests)} requests
            </span>
          )}
        </span>

        <span className="ledger__act">
          <button
            type="button"
            className="act--quiet"
            onClick={() => {
              setShelfOpen(true);
            }}
          >
            Shelf
          </button>

          <button
            type="button"
            className="act"
            disabled={nothingToSave || status === 'resolving'}
            onClick={() => {
              setSaving(true);
            }}
          >
            Save to Spotify
          </button>
        </span>
      </footer>

      {shelfOpen ? (
        <Shelf
          onClose={() => {
            setShelfOpen(false);
          }}
        />
      ) : null}

      {saving ? (
        <SaveFlow
          connection={connection}
          onClose={() => {
            setSaving(false);
          }}
        />
      ) : null}
    </>
  );
}
