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

import { Fader } from '@/components/primitives/Fader';
import { Module } from '@/components/shell/Module';
import { SECTION_DEFINITIONS, shapeCount } from '@/lib/layout/sections';
import type { Travel } from '@/lib/controls/travel';
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

/**
 * The three faders' travel. Every step is a whole unit a person would name — nobody asks for
 * 37.5 tracks — and the larger step is a tenth of the run, so shift-arrow crosses the panel
 * in ten presses rather than in two hundred (§10, §13).
 */
const COUNT_TRAVEL: Travel = {
  min: TARGET_COUNT_MIN,
  max: TARGET_COUNT_MAX,
  step: 1,
  bigStep: 10,
};

const MINUTES_TRAVEL: Travel = {
  min: TARGET_MINUTES_MIN,
  max: TARGET_MINUTES_MAX,
  step: 5,
  bigStep: 30,
};

const PER_ARTIST_TRAVEL: Travel = { min: 1, max: MAX_PER_ARTIST_CEILING, step: 1, bigStep: 3 };

/** In words, never a bare number (§13) — a screen reader saying "4" says nothing at all. */
function perArtistWords(most: number): string {
  return most === 1
    ? 'Most per artist: one track by any one act'
    : `Most per artist: up to ${String(most)} tracks by any one act`;
}

export function ShapeModule() {
  const { recipe, setRecipe } = useWorkbench();
  const { shape } = recipe;
  const byCount = shape.target.kind === 'count';

  return (
    <Module
      title={SECTION_DEFINITIONS.shape.label}
      glyph={SECTION_DEFINITIONS.shape.glyph}
      count={shapeCount(recipe)}
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
          <Fader
            label="Tracks"
            value={shape.target.kind === 'count' ? shape.target.count : TARGET_COUNT_MIN}
            travel={COUNT_TRAVEL}
            valueText={format({
              kind: 'trackCount',
              count: shape.target.kind === 'count' ? shape.target.count : TARGET_COUNT_MIN,
            })}
            readout={String(shape.target.kind === 'count' ? shape.target.count : TARGET_COUNT_MIN)}
            onChange={(count) => {
              setRecipe(setTarget(recipe, { kind: 'count', count }));
            }}
          />
        ) : (
          <Fader
            label="Minutes"
            value={targetMinutes(shape.target)}
            travel={MINUTES_TRAVEL}
            valueText={format({
              kind: 'duration',
              ms: targetMinutes(shape.target) * MS_PER_MINUTE,
            })}
            readout={format({
              kind: 'duration',
              ms: targetMinutes(shape.target) * MS_PER_MINUTE,
            })}
            onChange={(minutes) => {
              setRecipe(setTarget(recipe, { kind: 'duration', ms: minutes * MS_PER_MINUTE }));
            }}
          />
        )}
      </fieldset>

      <Fader
        label="Most per artist"
        value={shape.maxPerArtist}
        travel={PER_ARTIST_TRAVEL}
        valueText={perArtistWords(shape.maxPerArtist)}
        readout={String(shape.maxPerArtist)}
        onChange={(most) => {
          setRecipe(setMaxPerArtist(recipe, most));
        }}
      />

      <div className="field-row">
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
