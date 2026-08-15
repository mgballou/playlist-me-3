'use client';

/**
 * The rack — the three modules, and the only region that is always visible on a wide layout,
 * because it is the recipe and the recipe is the app (§7).
 *
 * It holds one accent and no more (§3). SOURCES takes it while the recipe is empty, because
 * an empty bench is the one screen where a call to action has no competition (§2.7); once
 * there is a source, the rack goes quiet and the accent belongs to the deck's re-roll. Every
 * other control in here is secondary or quiet, on purpose — five equal buttons is the failure
 * v2 shipped and the thing most likely to creep back.
 *
 * Below the threshold the rack itself steps out of the way (`display: contents`) and its
 * three panels become three of the frame's four sections (§7.1). The nameplate travels with
 * SOURCES: naming the recipe is part of authoring it, and a name floating above a paged frame
 * would belong to no section at all.
 */

import { BlockModule } from '@/components/bench/BlockModule';
import { ShapeModule } from '@/components/bench/ShapeModule';
import { SourcesModule } from '@/components/bench/SourcesModule';
import { RecipeName } from '@/components/bench/RecipeName';
import type { SectionId } from '@/lib/layout/sections';
import { Panel } from './Panel';

export type RackProps = {
  readonly collapsed: boolean;
  readonly selected: SectionId;
};

export function Rack({ collapsed, selected }: RackProps) {
  return (
    <div className="rack">
      <Panel section="sources" collapsed={collapsed} selected={selected === 'sources'}>
        <RecipeName />
        <SourcesModule />
      </Panel>

      <Panel section="block" collapsed={collapsed} selected={selected === 'block'}>
        <BlockModule />
      </Panel>

      <Panel section="shape" collapsed={collapsed} selected={selected === 'shape'}>
        <ShapeModule />
      </Panel>
    </div>
  );
}
