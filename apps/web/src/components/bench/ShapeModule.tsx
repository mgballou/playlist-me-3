'use client';

/**
 * SHAPE — how the pool becomes a playlist: how many, how spread, how ordered, and the two
 * dials.
 *
 * Nothing in this module is part of `resolveKey`, so **nothing in it costs a request**
 * (§2.10, spec §3.1). Dragging a dial rebuilds from the pool already in hand, instantly, and
 * the sources module beside it does not so much as flicker (§9).
 *
 * The dials are last because they are the ones the person comes back to, and the module's
 * least-changed controls should not sit between them and the door.
 */

import { ORDER_STRATEGIES, format } from '@pm/core';

import { Module } from '@/components/shell/Module';
import { DIAL_DEFINITIONS } from '@/lib/registry/dials';
import { ORDER_DEFINITIONS } from '@/lib/registry/order';
import {
  MS_PER_MINUTE,
  TARGET_COUNT_MAX,
  TARGET_COUNT_MIN,
  TARGET_MINUTES_MAX,
  TARGET_MINUTES_MIN,
  setDial,
  setMaxPerArtist,
  setOrder,
  setTarget,
  targetMinutes,
} from '@/lib/recipe/edit';
import { useWorkbench } from '@/lib/workbench/use-workbench';
import { Dial } from './Dial';

const MAX_PER_ARTIST_CEILING = 10;

export function ShapeModule() {
  const { recipe, setRecipe } = useWorkbench();
  const { shape } = recipe;
  const byCount = shape.target.kind === 'count';

  return (
    <Module
      title="Shape"
      glyph="⚙"
      count={
        byCount
          ? String(shape.target.kind === 'count' ? shape.target.count : 0)
          : format({ kind: 'duration', ms: shape.target.kind === 'duration' ? shape.target.ms : 0 })
      }
    >
      <fieldset className="fieldset">
        <legend className="fieldset__legend label">How long a playlist</legend>
        <div className="switch" role="group">
          <button
            type="button"
            className="switch__option"
            aria-pressed={byCount}
            onClick={() => {
              setRecipe(setTarget(recipe, { kind: 'count', count: 25 }));
            }}
          >
            A number of tracks
          </button>
          <button
            type="button"
            className="switch__option"
            aria-pressed={!byCount}
            onClick={() => {
              setRecipe(setTarget(recipe, { kind: 'duration', ms: 60 * MS_PER_MINUTE }));
            }}
          >
            A running time
          </button>
        </div>

        {byCount ? (
          <label className="field">
            <span className="field__label label">Tracks</span>
            <input
              className="field__input numeric"
              type="number"
              min={TARGET_COUNT_MIN}
              max={TARGET_COUNT_MAX}
              value={shape.target.kind === 'count' ? shape.target.count : TARGET_COUNT_MIN}
              onChange={(event) => {
                const count = Number.parseInt(event.currentTarget.value, 10);
                if (!Number.isFinite(count)) return;
                setRecipe(
                  setTarget(recipe, {
                    kind: 'count',
                    count: Math.min(TARGET_COUNT_MAX, Math.max(TARGET_COUNT_MIN, count)),
                  }),
                );
              }}
            />
          </label>
        ) : (
          <label className="field">
            <span className="field__label label">Minutes</span>
            <input
              className="field__input numeric"
              type="number"
              min={TARGET_MINUTES_MIN}
              max={TARGET_MINUTES_MAX}
              value={targetMinutes(shape.target)}
              onChange={(event) => {
                const minutes = Number.parseInt(event.currentTarget.value, 10);
                if (!Number.isFinite(minutes)) return;
                const bounded = Math.min(TARGET_MINUTES_MAX, Math.max(TARGET_MINUTES_MIN, minutes));
                setRecipe(setTarget(recipe, { kind: 'duration', ms: bounded * MS_PER_MINUTE }));
              }}
            />
          </label>
        )}
      </fieldset>

      <div className="field-row">
        <label className="field">
          <span className="field__label label">Most per artist</span>
          <input
            className="field__input numeric"
            type="number"
            min={1}
            max={MAX_PER_ARTIST_CEILING}
            value={shape.maxPerArtist}
            onChange={(event) => {
              const value = Number.parseInt(event.currentTarget.value, 10);
              if (!Number.isFinite(value)) return;
              setRecipe(setMaxPerArtist(recipe, Math.min(MAX_PER_ARTIST_CEILING, value)));
            }}
          />
        </label>

        <label className="field">
          <span className="field__label label">Order</span>
          <select
            className="field__input"
            value={shape.order}
            onChange={(event) => {
              const picked = ORDER_STRATEGIES.find(
                (strategy) => strategy === event.currentTarget.value,
              );
              if (picked !== undefined) setRecipe(setOrder(recipe, picked));
            }}
          >
            {ORDER_STRATEGIES.map((strategy) => (
              <option key={strategy} value={strategy}>
                {ORDER_DEFINITIONS[strategy].label}
              </option>
            ))}
          </select>
          <span className="field__note muted">{ORDER_DEFINITIONS[shape.order].summary}</span>
        </label>
      </div>

      <div className="dials">
        <Dial
          definition={DIAL_DEFINITIONS.familiarity}
          value={shape.familiarity}
          onChange={(value) => {
            setRecipe(setDial(recipe, 'familiarity', value));
          }}
        />
        <Dial
          definition={DIAL_DEFINITIONS.depth}
          value={shape.depth}
          onChange={(value) => {
            setRecipe(setDial(recipe, 'depth', value));
          }}
        />
      </div>
    </Module>
  );
}
