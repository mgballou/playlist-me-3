'use client';

/**
 * Adding an exclusion. Sequenced the same way a source is (§2.6): which kind, then a
 * subject where the kind takes one, and nothing at all where it does not.
 *
 * **The two headline kinds go first** (spec §2.3) — "never anything off Kids Jams" and
 * "nothing already in my library" are why the app exists, and they are marked as headline in
 * the registry rather than by this screen deciding to put them at the top.
 *
 * A kind already on the recipe is offered as spent rather than removed from the list. §2.6:
 * too many choices is fixed by ordering them, never by deleting any — and a control that
 * vanishes is a control the person has to work out the disappearance of.
 */

import type { Exclusion, ExclusionKind } from '@pm/core';
import { useState } from 'react';

import { ArtistPicker } from './ArtistPicker';
import { PlaylistPicker } from './PlaylistPicker';
import { EXCLUSION_ORDER, exclusionDefinition } from '@/lib/registry/exclusions';
import { RangeSubject } from './RangeSubject';

export type AddExclusionProps = {
  readonly spent: ReadonlySet<ExclusionKind>;
  readonly onAdd: (exclusion: Exclusion) => void;
  readonly onName: (id: string, name: string) => void;
};

function withoutSubject(kind: ExclusionKind): Exclusion | null {
  switch (kind) {
    case 'inLibrary':
      return { kind: 'inLibrary' };
    case 'heardRecently':
      return { kind: 'heardRecently' };
    case 'explicit':
      return { kind: 'explicit' };
    case 'liveOrRemix':
      return { kind: 'liveOrRemix' };
    default:
      return null;
  }
}

export function AddExclusion({ spent, onAdd, onName }: AddExclusionProps) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ExclusionKind | null>(null);

  const close = (): void => {
    setOpen(false);
    setKind(null);
  };

  const add = (exclusion: Exclusion): void => {
    onAdd(exclusion);
    close();
  };

  if (!open) {
    return (
      <button
        type="button"
        className="act--secondary"
        onClick={() => {
          setOpen(true);
        }}
      >
        Block something
      </button>
    );
  }

  if (kind === null) {
    return (
      <div className="draft" aria-label="Choose what to block">
        <p className="draft__step label muted">Step one — what to keep out</p>
        <ul className="draft__kinds">
          {EXCLUSION_ORDER.map((option) => {
            const definition = exclusionDefinition(option);
            const already = spent.has(option);
            return (
              <li key={option}>
                <button
                  type="button"
                  className="draft__kind"
                  data-headline={definition.headline ? 'true' : 'false'}
                  disabled={already}
                  onClick={() => {
                    const immediate = withoutSubject(option);
                    if (immediate === null) setKind(option);
                    else add(immediate);
                  }}
                >
                  <span className="draft__glyph" aria-hidden="true">
                    {definition.glyph}
                  </span>
                  <span className="draft__name">{definition.label}</span>
                  <span className="draft__summary muted">
                    {already ? 'Already blocked.' : definition.summary}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" className="act--quiet" onClick={close}>
          Cancel
        </button>
      </div>
    );
  }

  const definition = exclusionDefinition(kind);
  const title = definition.subjectLabel ?? definition.label;

  if (kind === 'artist') {
    return (
      <ArtistPicker
        title={title}
        onClose={close}
        onPick={(choice) => {
          onName(choice.id, choice.name);
          add({ kind: 'artist', artistId: choice.id });
        }}
      />
    );
  }

  if (kind === 'playlist') {
    return (
      <PlaylistPicker
        title={title}
        onClose={close}
        onPick={(choice) => {
          onName(choice.id, choice.name);
          add({ kind: 'playlist', playlistId: choice.id });
        }}
      />
    );
  }

  // Every other kind either has no subject — added the moment it was picked — or has its
  // own picker above. What is left is exactly the two spans.
  if (kind !== 'years' && kind !== 'duration') return null;

  return (
    <div className="draft" aria-label={title}>
      <p className="draft__step label muted">Step two — {definition.label}</p>
      <RangeSubject kind={kind} onAdd={add} onCancel={close} />
    </div>
  );
}
