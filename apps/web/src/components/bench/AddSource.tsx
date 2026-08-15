'use client';

/**
 * Adding a source, **sequenced rather than flattened** (§2.6).
 *
 * > Too many choices at one level is fixed by ordering them, never by deleting any.
 *
 * So: one decision (which kind), then a second (which artist, what query), and no third —
 * tuning is a reveal on the row itself once the source exists, which is the same control
 * whether the source is a second old or a week old. Building the tuning into the add flow
 * would have meant two code paths for one job, and the second one would be the one nobody
 * uses and nobody maintains.
 *
 * **A recipe with no sources shows one control, not fifteen.** Closed, this is one button.
 */

import type { Source, SourceKind } from '@pm/core';
import { useState } from 'react';

import { Chip } from '@/components/primitives/Chip';
import { SOURCE_ORDER, sourceDefinition } from '@/lib/registry/sources';
import { toneStyle } from '@/lib/registry/tone';
import { ArtistPicker } from './ArtistPicker';
import { PlaylistPicker } from './PlaylistPicker';
import { SearchSubject } from './SearchSubject';
import { TrackPicker } from './TrackPicker';

export type AddSourceProps = {
  /** True on an empty bench, where this is the one thing to do and carries the accent. §3 */
  readonly primary: boolean;
  readonly onAdd: (source: Source) => void;
  readonly onName: (id: string, name: string) => void;
};

/**
 * A kind with no subject is one decision, so it is added the moment it is picked. The
 * defaults are the middle of each union — a first source should produce a pool, not a
 * question.
 */
function withoutSubject(kind: SourceKind): Source | null {
  switch (kind) {
    case 'library':
      return { kind: 'library' };
    case 'topTracks':
      return { kind: 'topTracks', range: 'mediumTerm' };
    case 'followedArtists':
      return { kind: 'followedArtists', depth: 'albums' };
    case 'newReleases':
      return { kind: 'newReleases' };
    default:
      return null;
  }
}

export function AddSource({ primary, onAdd, onName }: AddSourceProps) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<SourceKind | null>(null);

  const close = (): void => {
    setOpen(false);
    setKind(null);
  };

  const add = (source: Source): void => {
    onAdd(source);
    close();
  };

  if (!open) {
    return (
      <button
        type="button"
        className={primary ? 'act' : 'act--secondary'}
        onClick={() => {
          setOpen(true);
        }}
      >
        Add a source
      </button>
    );
  }

  if (kind === null) {
    return (
      <div className="draft" aria-label="Choose a source kind">
        <p className="draft__step label muted">Step one — what kind</p>
        <ul className="draft__kinds">
          {SOURCE_ORDER.map((option) => {
            const definition = sourceDefinition(option);
            return (
              <li key={option}>
                <button
                  type="button"
                  className="draft__kind"
                  style={toneStyle(definition.tone)}
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
                  <span className="draft__summary muted">{definition.summary}</span>
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

  const definition = sourceDefinition(kind);
  const subjectTitle = definition.subjectLabel ?? definition.label;

  if (kind === 'artist') {
    return (
      <ArtistPicker
        title={subjectTitle}
        onClose={close}
        onPick={(choice) => {
          onName(choice.id, choice.name);
          add({ kind: 'artist', artistId: choice.id, depth: 'albumsAndSingles' });
        }}
      />
    );
  }

  if (kind === 'track') {
    return (
      <TrackPicker
        title={subjectTitle}
        onClose={close}
        onPick={(choice) => {
          onName(choice.id, choice.name);
          add({ kind: 'track', trackId: choice.id, expand: 'both' });
        }}
      />
    );
  }

  if (kind === 'playlist') {
    return (
      <PlaylistPicker
        title={subjectTitle}
        onClose={close}
        onPick={(choice) => {
          onName(choice.id, choice.name);
          add({ kind: 'playlist', playlistId: choice.id });
        }}
      />
    );
  }

  return (
    <div className="draft" aria-label={subjectTitle}>
      <p className="draft__step label muted">
        Step two — <Chip label={definition.label} glyph={definition.glyph} tone={definition.tone} />
      </p>
      <SearchSubject onAdd={add} onCancel={close} />
    </div>
  );
}
