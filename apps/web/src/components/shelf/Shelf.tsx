'use client';

/**
 * The shelf — saved recipes, each with the cover derived from its own settings, **so a recipe
 * is recognizable before it is read** (§11.1, spec §7.3).
 *
 * The region's one action is **Load**, per recipe (§3). Export, import and share are quiet:
 * they are ways of moving a recipe around, not ways of using one, and the accent means act.
 *
 * There is no database and there will not be one (spec §6). A recipe is a small declarative
 * value, so the shelf is IndexedDB, the export is a JSON file, and a shared link carries the
 * whole recipe through `encodeRecipe` — no server, no account, no row to migrate.
 */

import type { Recipe } from '@pm/core';
import { decodeRecipe, recipeId } from '@pm/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import { CoverArt } from '@/components/cover/CoverArt';
import { Overlay } from '@/components/primitives/Overlay';
import { COVER_SHELF_SIZE } from '@/lib/cover/plan';
import type { SavedRecipe } from '@/lib/persistence/recipes';
import {
  deleteRecipe,
  exportRecipes,
  importRecipes,
  listRecipes,
  recipeSearchParam,
  saveRecipe,
} from '@/lib/persistence/recipes';
import { browserStore } from '@/lib/persistence/store';
import { useWorkbench } from '@/lib/workbench/use-workbench';

export type ShelfProps = {
  readonly onClose: () => void;
};

type ShelfEntry = {
  readonly saved: SavedRecipe;
  /** Null when what is stored will not decode — damaged storage is an ordinary thing. */
  readonly recipe: Recipe | null;
};

export function Shelf({ onClose }: ShelfProps) {
  const { recipe, setRecipe, resetTinkering } = useWorkbench();
  const [entries, setEntries] = useState<readonly ShelfEntry[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    const stored = await listRecipes(browserStore());
    setEntries(
      stored.map((saved) => {
        const decoded = decodeRecipe(saved.encoded);
        return { saved, recipe: decoded.ok ? decoded.value : null };
      }),
    );
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const keepCurrent = (): void => {
    void saveRecipe({ store: browserStore(), recipe, savedAt: Date.now() }).then(refresh);
  };

  const share = (): void => {
    const url = `${window.location.origin}${window.location.pathname}?${recipeSearchParam(recipe)}`;
    void navigator.clipboard
      .writeText(url)
      .then(() => {
        setMessage('Link copied. It carries the whole recipe — no account, no server.');
      })
      .catch(() => {
        setMessage(url);
      });
  };

  const download = (): void => {
    if (entries === null) return;
    const blob = new Blob([exportRecipes(entries.map((entry) => entry.saved))], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'playlist-me-recipes.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const upload = (file: File): void => {
    void file.text().then(async (text) => {
      const found = importRecipes(text);
      if (found === null) {
        // §10: a malformed file says so and changes nothing.
        setMessage('That file is not a Playlist.me export, or it is from a later version.');
        return;
      }
      const store = browserStore();
      for (const saved of found) {
        const decoded = decodeRecipe(saved.encoded);
        if (!decoded.ok) continue;
        await saveRecipe({ store, recipe: decoded.value, savedAt: saved.savedAt });
      }
      setMessage(`Brought in ${String(found.length)}.`);
      await refresh();
    });
  };

  return (
    <Overlay title="Shelf" onClose={onClose}>
      <div className="shelf__acts">
        <button type="button" className="act--secondary" onClick={keepCurrent}>
          Keep this recipe
        </button>
        <button type="button" className="act--quiet" onClick={share}>
          Copy a link
        </button>
        <button type="button" className="act--quiet" onClick={download} disabled={entries === null}>
          Export
        </button>
        <button
          type="button"
          className="act--quiet"
          onClick={() => {
            fileRef.current?.click();
          }}
        >
          Import
        </button>
        <input
          ref={fileRef}
          className="visually-hidden"
          type="file"
          accept="application/json"
          aria-label="Import a recipes file"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file !== undefined) upload(file);
            event.currentTarget.value = '';
          }}
        />
      </div>

      {message === null ? null : (
        <p className="shelf__message" role="status">
          {message}
        </p>
      )}

      {entries === null ? (
        <ul className="shelf__list" aria-label="Loading the shelf">
          {Array.from({ length: 3 }, (_, index) => (
            <li key={index} className="shelf__placeholder" />
          ))}
        </ul>
      ) : entries.length === 0 ? (
        <p className="empty__lead">
          Nothing on the shelf yet. Keep this recipe and it will be here next time — and it will
          have its own cover, so you will know it without reading it.
        </p>
      ) : (
        <ul className="shelf__list">
          {entries.map((entry) => (
            <li key={entry.saved.id} className="shelf__card">
              {entry.recipe === null ? (
                <p className="shelf__damaged">
                  “{entry.saved.name}” will not open — what is stored for it is damaged.
                </p>
              ) : (
                <CoverArt recipe={entry.recipe} size={COVER_SHELF_SIZE} />
              )}

              <span className="shelf__text">
                <span className="shelf__name">{entry.saved.name}</span>
                <span className="shelf__meta muted numeric">
                  {entry.recipe === null
                    ? 'damaged'
                    : `${String(entry.recipe.sources.length)} sources · ${String(entry.recipe.exclusions.length)} blocks`}
                </span>
              </span>

              <button
                type="button"
                className="act"
                disabled={entry.recipe === null}
                onClick={() => {
                  if (entry.recipe === null) return;
                  // A loaded recipe keeps its own id, so keeping it again overwrites rather
                  // than breeding copies. Locks and rejects belong to the build that made
                  // them, so they do not come along.
                  setRecipe({ ...entry.recipe, id: recipeId(entry.saved.id) });
                  resetTinkering();
                  onClose();
                }}
              >
                Load
              </button>

              <button
                type="button"
                className="act--quiet"
                aria-label={`Forget ${entry.saved.name}`}
                onClick={() => {
                  void deleteRecipe(browserStore(), entry.saved.id).then(refresh);
                }}
              >
                <span aria-hidden="true">✕</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Overlay>
  );
}
