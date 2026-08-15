'use client';

/**
 * One source on the bench.
 *
 * **A source shows what it contributed** after a build (§2.3) — and a source contributing
 * zero is a broken recipe telling you so, in as many words rather than by an absence nobody
 * notices. That number sits on the row, where the eye already is, not in a report.
 *
 * The row's tuning is an inline reveal (§2.9), so a recipe with eight sources is eight rows
 * rather than a wall of selects. The tone comes from the registry (§12); this component
 * decides no color.
 */

import type { Source } from '@pm/core';
import { format, unreachable } from '@pm/core';

import { Chip } from '@/components/primitives/Chip';
import { Reveal } from '@/components/primitives/Reveal';
import {
  CATALOG_DEPTH_LABELS,
  OBSCURITY_COST_NOTE,
  OBSCURITY_LABELS,
  TOP_RANGE_LABELS,
  TRACK_EXPANSION_LABELS,
  describeSource,
  describeSourceTuning,
  sourceDefinition,
} from '@/lib/registry/sources';

export type SourceContributionView = {
  readonly pooled: number;
  readonly chosen: number;
};

export type SourceRowProps = {
  readonly source: Source;
  readonly index: number;
  readonly names: ReadonlyMap<string, string>;
  /** Null before the first build. §12: "not yet decided" renders nothing, not "unknown". */
  readonly contribution: SourceContributionView | null;
  readonly onChange: (source: Source) => void;
  readonly onRemove: () => void;
};

export function SourceRow({
  source,
  index,
  names,
  contribution,
  onChange,
  onRemove,
}: SourceRowProps) {
  const definition = sourceDefinition(source.kind);
  const subject = describeSource(source, names);
  const tuning = describeSourceTuning(source);
  const barren = contribution !== null && contribution.pooled === 0;

  return (
    <li className="row" data-kind={source.kind} data-barren={barren ? 'true' : 'false'}>
      <div className="row__head">
        <Chip label={definition.label} glyph={definition.glyph} tone={definition.tone} />

        <span className="row__subject" title={subject}>
          {subject}
        </span>

        <span className="row__count numeric" aria-live="polite">
          {contribution === null ? (
            <span className="visually-hidden">Not built yet</span>
          ) : barren ? (
            <span className="row__zero">nothing pooled</span>
          ) : (
            <>
              +{String(contribution.pooled)}
              <span className="visually-hidden">
                {' '}
                pooled, {String(contribution.chosen)} on the deck
              </span>
            </>
          )}
        </span>

        <button
          type="button"
          className="act--quiet row__remove"
          onClick={onRemove}
          aria-label={`Remove source ${String(index + 1)}, ${definition.label} ${subject}`}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      {barren ? (
        <p className="row__note">
          This source found nothing. Widen it below, or take it off the recipe.
        </p>
      ) : null}

      {hasTuning(source) ? (
        <Reveal label="Tune" hint={tuning ?? undefined}>
          <SourceTuning source={source} onChange={onChange} />
        </Reveal>
      ) : null}

      {contribution === null || barren ? null : (
        <p className="row__meta muted numeric">
          {format({ kind: 'trackCount', count: contribution.chosen })} on the deck
        </p>
      )}
    </li>
  );
}

function hasTuning(source: Source): boolean {
  switch (source.kind) {
    case 'artist':
    case 'track':
    case 'search':
    case 'topTracks':
    case 'followedArtists':
    case 'newReleases':
      return true;
    case 'playlist':
    case 'library':
      return false;
    default:
      return unreachable(source);
  }
}

/**
 * The third level of the decision (§2.6), reached only on purpose. Every control is a real
 * labelled select — the platform's own primitive, so keyboard and screen reader behavior
 * come free (§13).
 */
function SourceTuning({
  source,
  onChange,
}: {
  readonly source: Source;
  readonly onChange: (source: Source) => void;
}) {
  switch (source.kind) {
    case 'artist':
      return (
        <Choice
          label="How much of the discography"
          value={source.depth}
          options={CATALOG_DEPTH_LABELS}
          onPick={(depth) => {
            onChange({ ...source, depth });
          }}
        />
      );

    case 'followedArtists':
      return (
        <Choice
          label="How much of each discography"
          value={source.depth}
          options={CATALOG_DEPTH_LABELS}
          onPick={(depth) => {
            onChange({ ...source, depth });
          }}
        />
      );

    case 'track':
      return (
        <Choice
          label="What to reach for"
          value={source.expand}
          options={TRACK_EXPANSION_LABELS}
          onPick={(expand) => {
            onChange({ ...source, expand });
          }}
        />
      );

    case 'topTracks':
      return (
        <Choice
          label="Over what span"
          value={source.range}
          options={TOP_RANGE_LABELS}
          onPick={(range) => {
            onChange({ ...source, range });
          }}
        />
      );

    case 'search':
      return (
        <>
          <Choice
            label="How far off the beaten track"
            value={source.obscurity}
            options={OBSCURITY_LABELS}
            onPick={(obscurity) => {
              onChange({ ...source, obscurity });
            }}
          />
          {source.obscurity === 'obscure' ? (
            <p className="row__note muted">{OBSCURITY_COST_NOTE}</p>
          ) : null}
        </>
      );

    case 'newReleases':
      return (
        <label className="field">
          <span className="field__label label">Genre word</span>
          <input
            className="field__input"
            type="text"
            value={source.genre ?? ''}
            onChange={(event) => {
              const next = event.currentTarget.value;
              onChange(
                next.trim().length === 0
                  ? { kind: 'newReleases' }
                  : { kind: 'newReleases', genre: next },
              );
            }}
          />
          <span className="field__note muted">
            New releases are an album search, and album searches cannot filter by genre — so this is
            words, not a filter.
          </span>
        </label>
      );

    case 'playlist':
    case 'library':
      return null;

    default:
      return unreachable(source);
  }
}

/** A real guard, so the select's `string` narrows without a cast. CLAUDE.md, TypeScript. */
function isOption<T extends string>(
  options: Readonly<Record<T, string>>,
  value: string,
): value is T {
  return Object.hasOwn(options, value);
}

function Choice<T extends string>({
  label,
  value,
  options,
  onPick,
}: {
  readonly label: string;
  readonly value: T;
  readonly options: Readonly<Record<T, string>>;
  readonly onPick: (value: T) => void;
}) {
  return (
    <label className="field">
      <span className="field__label label">{label}</span>
      <select
        className="field__input"
        value={value}
        onChange={(event) => {
          const next = event.currentTarget.value;
          if (isOption(options, next)) onPick(next);
        }}
      >
        {Object.entries(options).map(([option, text]) => (
          <option key={option} value={option}>
            {String(text)}
          </option>
        ))}
      </select>
    </label>
  );
}
