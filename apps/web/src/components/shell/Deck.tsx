'use client';

/**
 * The deck — the built playlist, and the region whose one action is **re-roll** (§3).
 *
 * Four things this region owes, and where each is honored:
 *
 * - **Re-roll carries the accent and is never more than one input away** (§2.4). It sits in
 *   the band rather than as a slab under the list, because a slab under a fifty-track deck is
 *   two inputs away — a scroll and a press.
 * - **Nothing rebuilds to show it is loading** (§9). The container stays; only its contents
 *   change, and the placeholder is sized to the content it stands for, so a thirty-track deck
 *   shows thirty slots while it resolves and nothing moves when the real thing lands.
 * - **Every terminal state names what happens next** (§2.7). A zero-track build names the
 *   binding constraint and offers to relax it; it never says "no results".
 * - **The cursor keys on identity** (§2.5), so a re-roll does not jump the deck.
 */

import type { ShortfallReason, Target, TrackId } from '@pm/core';
import { format, unreachable } from '@pm/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import { BuildReport } from '@/components/deck/BuildReport';
import { TrackSlot } from '@/components/deck/TrackSlot';
import { ErrorNotice } from '@/components/errors/ErrorNotice';
import { Reveal } from '@/components/primitives/Reveal';
import { indexOfCursor, nextCursor } from '@/lib/deck/cursor';
import { SECTION_DEFINITIONS } from '@/lib/layout/sections';
import { removeExclusion, setMaxPerArtist } from '@/lib/recipe/edit';
import { shortfallCopy } from '@/lib/registry/shortfall';
import { useReturnPath } from '@/lib/use-return-path';
import { useWorkbench } from '@/lib/workbench/use-workbench';
import { Module } from './Module';

/** How many slots to hold open while resolving. Sized to the content, not to a guess. §9 */
const FALLBACK_SLOTS = 12;

function slotCount(target: Target): number {
  switch (target.kind) {
    case 'count':
      return Math.max(1, target.count);
    case 'duration':
      return FALLBACK_SLOTS;
    default:
      return unreachable(target);
  }
}

export function Deck() {
  const {
    recipe,
    result,
    status,
    error,
    pool,
    locks,
    rejects,
    names,
    retryIn,
    reroll,
    lockTrack,
    unlockTrack,
    rejectTrack,
    undoReject,
    retryResolve,
    setRecipe,
  } = useWorkbench();
  const returnPath = useReturnPath();

  const tracks = result?.tracks ?? [];
  const lockedIds = new Set(locks.map((lock) => lock.trackId));

  // The cursor keys on identity and clamps when its track is gone. §2.5
  const [cursor, setCursor] = useState<TrackId | null>(null);
  const lastIndex = useRef(0);

  useEffect(() => {
    const settled = nextCursor({ cursor, previousIndex: lastIndex.current, tracks });
    lastIndex.current = settled.index;
    if (settled.trackId !== cursor) setCursor(settled.trackId);
    // Runs when the deck changes, which is the only time a cursor can go stale.
  }, [tracks, cursor]);

  const focus = useCallback((trackId: TrackId, index: number) => {
    lastIndex.current = index;
    setCursor(trackId);
  }, []);

  const summary =
    result === null
      ? '—'
      : format({
          kind: 'summary',
          count: result.report.trackCount,
          ms: result.report.totalDurationMs,
        });

  return (
    <div className="deck">
      <Module
        title={SECTION_DEFINITIONS.deck.label}
        glyph={SECTION_DEFINITIONS.deck.glyph}
        count={summary}
        actions={
          <button
            type="button"
            className="act"
            onClick={reroll}
            disabled={result === null}
            title="A new seed over the pool already in hand. No request is made."
          >
            Re-roll
          </button>
        }
      >
        {status === 'failed' && error !== null ? (
          <ErrorNotice
            error={error}
            returnTo={returnPath}
            retryIn={retryIn}
            onRetry={retryResolve}
          />
        ) : status === 'resolving' && result === null ? (
          <ul className="deck__slots" aria-label="Resolving sources">
            {Array.from({ length: slotCount(recipe.shape.target) }, (_, index) => (
              <li key={index} className="slot-placeholder" />
            ))}
          </ul>
        ) : result === null ? (
          <p className="empty__lead">
            Nothing built yet. Add a source in the rack and the deck fills itself.
          </p>
        ) : tracks.length === 0 ? (
          <EmptyBuild
            reason={result.report.select.shortfall?.reason ?? 'emptyPool'}
            canDropBlock={recipe.exclusions.length > 0}
            onRelaxArtists={() => {
              setRecipe(setMaxPerArtist(recipe, recipe.shape.maxPerArtist + 1));
            }}
            onDropBlock={() => {
              setRecipe(removeExclusion(recipe, recipe.exclusions.length - 1));
            }}
          />
        ) : (
          <>
            <ul className="deck__slots" data-resolving={status === 'resolving' ? 'true' : 'false'}>
              {tracks.map((track, index) => (
                <TrackSlot
                  key={index}
                  track={track}
                  index={index}
                  locked={lockedIds.has(track.id)}
                  focused={indexOfCursor(tracks, cursor) === index}
                  onLock={() => {
                    lockTrack({ index, trackId: track.id });
                  }}
                  onUnlock={() => {
                    unlockTrack(track.id);
                  }}
                  onReject={rejectTrack}
                  onFocus={() => {
                    focus(track.id, index);
                  }}
                />
              ))}
            </ul>

            {result.report.canReachTarget ? null : (
              <p className="deck__short" role="status">
                {shortOf(result.report.select.shortfall?.shortBy ?? 0, recipe.shape.target)} short
                of the target — {shortfallOf(result.report.select.shortfall?.reason)}
              </p>
            )}

            <Reveal label="Why these" hint="what each source gave, what each block took">
              <BuildReport report={result.report} names={names} />
            </Reveal>
          </>
        )}

        {rejects.size === 0 ? null : (
          <Reveal
            label="Rejected"
            hint={`${format({ kind: 'trackCount', count: rejects.size })}, undoable`}
          >
            <ul className="rejects">
              {[...rejects].map((trackId) => {
                const track = pool.find((held) => held.id === trackId);
                return (
                  <li key={trackId} className="rejects__row">
                    <span className="rejects__title">{track?.title ?? trackId}</span>
                    <button
                      type="button"
                      className="act--quiet"
                      onClick={() => {
                        undoReject(trackId);
                      }}
                    >
                      Put it back
                    </button>
                  </li>
                );
              })}
            </ul>
          </Reveal>
        )}
      </Module>
    </div>
  );
}

/**
 * A build that reached zero tracks **names the binding constraint and offers to relax it**
 * (§2.7). "No results" would be the dead end this rule exists to forbid — and so would an
 * offer that relaxes the wrong thing, so the offer is chosen from the same reason as the
 * words. Nothing survived the blocks is answered by dropping a block; a per-artist ceiling
 * is answered by raising the ceiling.
 */
function EmptyBuild({
  reason,
  canDropBlock,
  onRelaxArtists,
  onDropBlock,
}: {
  readonly reason: ShortfallReason;
  readonly canDropBlock: boolean;
  readonly onRelaxArtists: () => void;
  readonly onDropBlock: () => void;
}) {
  const blocksAreBinding = reason === 'emptyPool' || reason === 'poolExhausted';

  return (
    <div className="empty">
      <p className="empty__lead">Nothing survived — {shortfallCopy(reason).summary}</p>
      {blocksAreBinding && canDropBlock ? (
        <button type="button" className="act--secondary" onClick={onDropBlock}>
          Drop the last block
        </button>
      ) : blocksAreBinding ? (
        <p className="muted">Add another source, or widen the one you have.</p>
      ) : (
        <button type="button" className="act--secondary" onClick={onRelaxArtists}>
          Allow one more per artist
        </button>
      )}
    </div>
  );
}

function shortOf(shortBy: number, target: Target): string {
  return target.kind === 'count'
    ? format({ kind: 'trackCount', count: shortBy })
    : format({ kind: 'duration', ms: shortBy });
}

/** The constraint and the remedy, as one line. Both come from the registry, not from here. */
function shortfallOf(reason: ShortfallReason | undefined): string {
  const copy = shortfallCopy(reason ?? 'poolExhausted');
  return copy.remedy === null ? copy.summary : `${copy.summary} ${copy.remedy}`;
}
