'use client';

/**
 * The save flow: confirm, write, and say what happened.
 *
 * **Writing to Spotify is the one irreversible act, and it says so once, before it happens**
 * (§2.8). It is a takeover rather than an overlay, because it is the one action that leaves
 * the app's world (§2.9) — and because a modal dialog makes the rest of the document inert,
 * which is §2.8's *"every control disables together while a confirm is open"* for free.
 *
 * The preview is the same cover the shelf draws and the same one that goes up to Spotify,
 * from one function (§11.1). Seeing it before pressing is what makes the cover feel like part
 * of the recipe rather than a surprise afterwards.
 *
 * **Demo mode says nothing was written.** The fake accepts every call, so the flow is real
 * and demonstrable with no credentials; presenting that as a saved Spotify playlist would be
 * the easiest lie in the project (§12.1), so the result names the mode and offers no link.
 */

import { format } from '@pm/core';
import { useState } from 'react';

import { CoverArt } from '@/components/cover/CoverArt';
import { ErrorNotice } from '@/components/errors/ErrorNotice';
import { Takeover } from '@/components/primitives/Takeover';
import { savePlaylist } from '@/lib/actions/save';
import { coverJpeg } from '@/lib/cover/export';
import { readCoverPalette } from '@/lib/cover/palette';
import { coverPlan } from '@/lib/cover/plan';
import type { SaveOutcome } from '@/lib/workbench/save';
import type { Connection } from '@/lib/spotify/connection';
import { useReturnPath } from '@/lib/use-return-path';
import { useWorkbench } from '@/lib/workbench/use-workbench';

const PREVIEW_SIZE = 160;

export type SaveFlowProps = {
  readonly connection: Connection;
  readonly onClose: () => void;
};

type Stage = 'confirm' | 'writing' | 'done';

export function SaveFlow({ connection, onClose }: SaveFlowProps) {
  const { recipe, result } = useWorkbench();
  const returnPath = useReturnPath();

  const [stage, setStage] = useState<Stage>('confirm');
  const [outcome, setOutcome] = useState<SaveOutcome | null>(null);
  const [isPublic, setIsPublic] = useState(false);

  const tracks = result?.tracks ?? [];
  const demo = connection.mode === 'demo';

  const write = (): void => {
    setStage('writing');
    const palette = readCoverPalette(document.documentElement);
    const cover =
      palette === null ? null : coverJpeg(coverPlan(recipe, result?.report ?? null), palette);

    void savePlaylist({
      name: recipe.name,
      description: describeRecipe(recipe.sources.length, recipe.exclusions.length),
      trackIds: tracks.map((track) => track.id),
      isPublic,
      ...(cover === null ? {} : { coverBase64: cover.base64 }),
    }).then((result_) => {
      setOutcome(result_);
      setStage('done');
    });
  };

  return (
    <Takeover title="Save to Spotify" onClose={onClose}>
      {stage === 'done' && outcome !== null ? (
        <SaveResult outcome={outcome} returnTo={returnPath} onClose={onClose} />
      ) : (
        <>
          <div className="save__preview">
            <CoverArt recipe={recipe} report={result?.report ?? null} size={PREVIEW_SIZE} />
            <div className="save__facts">
              <p className="save__name">{recipe.name}</p>
              <p className="numeric muted">
                {format({
                  kind: 'summary',
                  count: tracks.length,
                  ms: result?.report.totalDurationMs ?? 0,
                })}
              </p>
            </div>
          </div>

          <p className="save__warning">
            {demo
              ? 'Demo mode. This runs the whole write — create, add in batches of a hundred, upload the cover — against invented data. Nothing reaches Spotify.'
              : 'This writes a real playlist to your Spotify account. It is the one thing here that cannot be undone from inside this app.'}
          </p>

          <label className="save__option">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(event) => {
                setIsPublic(event.currentTarget.checked);
              }}
            />
            <span>Make it public</span>
          </label>

          <div className="save__acts">
            <button type="button" className="act" onClick={write} disabled={stage === 'writing'}>
              {stage === 'writing' ? 'Writing…' : demo ? 'Run the write' : 'Write it'}
            </button>
            <button
              type="button"
              className="act--quiet"
              onClick={onClose}
              disabled={stage === 'writing'}
            >
              Not yet
            </button>
          </div>
        </>
      )}
    </Takeover>
  );
}

function SaveResult({
  outcome,
  returnTo,
  onClose,
}: {
  readonly outcome: SaveOutcome;
  readonly returnTo: string;
  readonly onClose: () => void;
}) {
  if (!outcome.ok) {
    return (
      <>
        <ErrorNotice error={outcome.error} returnTo={returnTo} />
        <div className="save__acts">
          <button type="button" className="act--secondary" onClick={onClose}>
            Back to the bench
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <p className="save__done">
        {outcome.mode === 'demo'
          ? `Wrote ${format({ kind: 'trackCount', count: outcome.added })} in ${String(outcome.batches)} batch${outcome.batches === 1 ? '' : 'es'} — against the demo catalog, so nothing reached Spotify.`
          : `Written. ${format({ kind: 'trackCount', count: outcome.added })} in ${String(outcome.batches)} batch${outcome.batches === 1 ? '' : 'es'}.`}
      </p>

      <p className="muted">
        {outcome.coverUploaded
          ? 'The cover went up with it.'
          : 'The cover did not go up. The playlist is fine; the image is not on it.'}
      </p>

      <p className="numeric muted">{String(outcome.requests)} requests</p>

      <div className="save__acts">
        {outcome.url === null ? null : (
          <a className="act--secondary" href={outcome.url} target="_blank" rel="noreferrer">
            Open it in Spotify
          </a>
        )}
        <button type="button" className="act--quiet" onClick={onClose}>
          Back to the bench
        </button>
      </div>
    </>
  );
}

function describeRecipe(sources: number, exclusions: number): string {
  return `Built with Playlist.me from ${String(sources)} sources against ${String(exclusions)} blocks.`;
}
