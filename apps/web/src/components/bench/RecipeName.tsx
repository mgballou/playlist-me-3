'use client';

/**
 * The recipe's name, at the top of the rack.
 *
 * **The unit is the recipe** (§2.2): it is what gets named, saved, shared, re-run and shown
 * on the shelf. So the name is not a field buried in a save dialog — it is the first thing in
 * the region that *is* the recipe, and it is editable in place.
 *
 * The cover sits beside it, at the size it will be on the shelf, because the cover is derived
 * from the recipe (§11.1) and watching it change as the recipe changes is the fastest way to
 * learn that it means something.
 */

import { CoverArt } from '@/components/cover/CoverArt';
import { COVER_SHELF_SIZE } from '@/lib/cover/plan';
import { setName } from '@/lib/recipe/edit';
import { useWorkbench } from '@/lib/workbench/use-workbench';

export function RecipeName() {
  const { recipe, result, setRecipe } = useWorkbench();

  return (
    <div className="nameplate">
      <CoverArt recipe={recipe} report={result?.report ?? null} size={COVER_SHELF_SIZE} />

      <label className="nameplate__field">
        <span className="visually-hidden">Recipe name</span>
        <input
          className="nameplate__input"
          type="text"
          value={recipe.name}
          maxLength={80}
          onChange={(event) => {
            setRecipe(setName(recipe, event.currentTarget.value));
          }}
        />
      </label>
    </div>
  );
}
