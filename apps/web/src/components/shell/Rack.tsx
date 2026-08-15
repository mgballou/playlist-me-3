'use client';

/**
 * The rack — the three modules, and the only region that is always visible, because it is the
 * recipe and the recipe is the app (§7).
 *
 * It holds one accent and no more (§3). SOURCES takes it while the recipe is empty, because
 * an empty bench is the one screen where a call to action has no competition (§2.7); once
 * there is a source, the rack goes quiet and the accent belongs to the deck's re-roll. Every
 * other control in here is secondary or quiet, on purpose — five equal buttons is the failure
 * v2 shipped and the thing most likely to creep back.
 */

import { BlockModule } from '@/components/bench/BlockModule';
import { ShapeModule } from '@/components/bench/ShapeModule';
import { SourcesModule } from '@/components/bench/SourcesModule';
import { RecipeName } from '@/components/bench/RecipeName';

export function Rack() {
  return (
    <div className="rack">
      <RecipeName />
      <SourcesModule />
      <BlockModule />
      <ShapeModule />
    </div>
  );
}
