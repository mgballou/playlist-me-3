'use client';

/**
 * BLOCK — the headline feature (spec §2.3).
 *
 * > `playlist` and `inLibrary` are the two things Spotify's own generator has never offered
 * > and the two that solve the stated problem.
 *
 * **Every exclusion shows what it removed, as a number, on itself** (§2.3). "Kids Jams —
 * 214 removed" is not a statistic, it is the feature working, visible. That number is the
 * single most valuable thing on this bench and it is why the module is arranged around a
 * count set to the trailing edge of every row rather than around a list of settings.
 */

import type { Exclusion } from '@pm/core';
import { format } from '@pm/core';

import { Module } from '@/components/shell/Module';
import { SECTION_DEFINITIONS, blockCount } from '@/lib/layout/sections';
import { addExclusion, removeExclusion, singletonExclusionKinds } from '@/lib/recipe/edit';
import { useWorkbench } from '@/lib/workbench/use-workbench';
import { AddExclusion } from './AddExclusion';
import { ExclusionRow } from './ExclusionRow';

export function BlockModule() {
  const { recipe, result, names, setRecipe, rememberName } = useWorkbench();
  const removals = result?.report.reject.removals ?? [];
  const totalRemoved = result?.report.reject.removedCount ?? null;

  return (
    <Module
      title={SECTION_DEFINITIONS.block.label}
      glyph={SECTION_DEFINITIONS.block.glyph}
      // The same number the BLOCK key carries below the threshold, from the same function, so
      // the two can never drift. §7.1
      count={blockCount(recipe, result)}
    >
      {recipe.exclusions.length === 0 ? (
        <div className="empty">
          <p className="empty__lead">
            Nothing is blocked yet. Blocking a playlist — never anything off Kids Jams — is the
            thing this app does that Spotify’s own generator will not.
          </p>
          <AddExclusion
            spent={singletonExclusionKinds(recipe)}
            onAdd={(exclusion: Exclusion) => {
              setRecipe(addExclusion(recipe, exclusion));
            }}
            onName={rememberName}
          />
        </div>
      ) : (
        <>
          <ul className="rows">
            {recipe.exclusions.map((exclusion, index) => (
              <ExclusionRow
                key={`${exclusion.kind}-${String(index)}`}
                exclusion={exclusion}
                index={index}
                names={names}
                removed={removals.find((entry) => entry.exclusionIndex === index)?.removed ?? null}
                onRemove={() => {
                  setRecipe(removeExclusion(recipe, index));
                }}
              />
            ))}
          </ul>

          <div className="module__foot">
            <AddExclusion
              spent={singletonExclusionKinds(recipe)}
              onAdd={(exclusion: Exclusion) => {
                setRecipe(addExclusion(recipe, exclusion));
              }}
              onName={rememberName}
            />
            {totalRemoved === null ? null : (
              <span className="numeric muted" aria-live="polite">
                {format({ kind: 'trackCount', count: totalRemoved })} kept out
              </span>
            )}
          </div>
        </>
      )}
    </Module>
  );
}
