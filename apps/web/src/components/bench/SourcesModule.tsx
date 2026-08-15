'use client';

/**
 * SOURCES — where tracks may come from.
 *
 * **The empty bench is the highest-leverage screen in the app** (§2.7), and the only one
 * where a call to action has no competition. So this module carries the rack's single accent
 * while the recipe has no sources, and gives it up the moment there is one: after that,
 * adding another is an ordinary secondary act and the accent belongs to the deck's re-roll.
 * That is §3's "emphasize by de-emphasizing" doing real work rather than being quoted.
 */

import type { Source } from '@pm/core';
import { format } from '@pm/core';

import { Module } from '@/components/shell/Module';
import { SECTION_DEFINITIONS, sourcesCount } from '@/lib/layout/sections';
import { addSource, removeSource, replaceSource } from '@/lib/recipe/edit';
import { useWorkbench } from '@/lib/workbench/use-workbench';
import { AddSource } from './AddSource';
import { SourceRow } from './SourceRow';

export function SourcesModule() {
  const { recipe, result, names, status, setRecipe, rememberName } = useWorkbench();
  const empty = recipe.sources.length === 0;

  const contributionOf = (index: number): { pooled: number; chosen: number } | null => {
    if (result === null) return null;
    const found = result.report.sourceContributions.find((entry) => entry.sourceIndex === index);
    return found === undefined ? null : { pooled: found.pooled, chosen: found.chosen };
  };

  return (
    <Module
      title={SECTION_DEFINITIONS.sources.label}
      glyph={SECTION_DEFINITIONS.sources.glyph}
      count={sourcesCount(recipe)}
    >
      {empty ? (
        <div className="empty">
          <p className="empty__lead">
            Nothing to build from yet. Pick an artist, a search, or one of your playlists, and the
            pool count starts moving.
          </p>
          <AddSource
            primary
            onAdd={(source: Source) => {
              setRecipe(addSource(recipe, source));
            }}
            onName={rememberName}
          />
        </div>
      ) : (
        <>
          <ul className="rows">
            {recipe.sources.map((source, index) => (
              <SourceRow
                key={`${source.kind}-${String(index)}`}
                source={source}
                index={index}
                names={names}
                contribution={contributionOf(index)}
                onChange={(next) => {
                  setRecipe(replaceSource(recipe, index, next));
                }}
                onRemove={() => {
                  setRecipe(removeSource(recipe, index));
                }}
              />
            ))}
          </ul>

          <div className="module__foot">
            <AddSource
              primary={false}
              onAdd={(source: Source) => {
                setRecipe(addSource(recipe, source));
              }}
              onName={rememberName}
            />
            <span className="numeric muted" aria-live="polite">
              {status === 'resolving'
                ? 'resolving…'
                : `${format({ kind: 'trackCount', count: result?.report.poolSize ?? 0 })} pooled`}
            </span>
          </div>
        </>
      )}
    </Module>
  );
}
