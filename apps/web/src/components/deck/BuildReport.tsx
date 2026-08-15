'use client';

/**
 * Why the build chose what it chose — **available inline, not hidden** (§2.3, §11).
 *
 * > A drawing beats a sentence about the drawing. The build report is a picture of where the
 * > tracks went and what was removed, not a paragraph.
 *
 * So it is a bar per source, sized by what that source contributed, in the source's own tone
 * (§5.1, §12), with the removals struck out beside it. The numbers are there for anyone who
 * wants them, and for a screen reader, but the shape is what carries the meaning.
 */

import type { BuildReport as Report } from '@pm/core';
import { format } from '@pm/core';

import { exclusionDefinition } from '@/lib/registry/exclusions';
import { sourceDefinition } from '@/lib/registry/sources';
import { toneStyle } from '@/lib/registry/tone';

export type BuildReportProps = {
  readonly report: Report;
  readonly names: ReadonlyMap<string, string>;
};

export function BuildReport({ report }: BuildReportProps) {
  const contributions = report.sourceContributions.filter((entry) => entry.kind !== null);
  const widest = Math.max(1, ...contributions.map((entry) => entry.pooled));
  const removals = report.reject.removals;
  const heaviest = Math.max(1, ...removals.map((entry) => entry.removed));

  return (
    <div className="report">
      <section className="report__part">
        <h3 className="report__title label">Where the tracks came from</h3>
        <ul className="report__bars">
          {contributions.map((entry) => {
            const kind = entry.kind;
            if (kind === null) return null;
            const definition = sourceDefinition(kind);
            return (
              <li
                key={entry.sourceIndex}
                className="report__bar"
                style={toneStyle(definition.tone)}
              >
                <span className="report__label">{definition.label}</span>
                <span className="report__track" aria-hidden="true">
                  <span
                    className="report__fill"
                    style={{ width: `${String((entry.pooled / widest) * 100)}%` }}
                  />
                </span>
                <span className="report__value numeric">
                  {String(entry.chosen)}
                  <span className="muted">/{String(entry.pooled)}</span>
                </span>
                <span className="visually-hidden">
                  {format({ kind: 'trackCount', count: entry.chosen })} chosen from{' '}
                  {String(entry.pooled)} pooled
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {removals.length === 0 ? null : (
        <section className="report__part">
          <h3 className="report__title label">What was kept out</h3>
          <ul className="report__bars">
            {removals.map((removal) => (
              <li key={removal.exclusionIndex} className="report__bar report__bar--ink">
                <span className="report__label">{exclusionDefinition(removal.kind).label}</span>
                <span className="report__track" aria-hidden="true">
                  <span
                    className="report__fill"
                    style={{ width: `${String((removal.removed / heaviest) * 100)}%` }}
                  />
                </span>
                <span className="report__value numeric">−{String(removal.removed)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="report__foot muted numeric">
        {String(report.poolSize)} pooled · {String(report.reject.keptCount)} survived ·{' '}
        {format({ kind: 'summary', count: report.trackCount, ms: report.totalDurationMs })}
      </p>
    </div>
  );
}
