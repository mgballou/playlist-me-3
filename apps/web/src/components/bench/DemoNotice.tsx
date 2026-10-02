/**
 * Says over a list of invented rows that they are invented.
 *
 * ui-sensibility §12.1 puts the notice in the crown, permanently, and that was the whole of
 * it. A phone review found the whole of it was not enough: asked *is it obvious these
 * playlists are invented demo data?*, the answer was **hidden**
 * (`docs/review-answers-2026-09-01.md`, screen 5). Two reasons, and both are about this
 * screen rather than about the crown — an overlay puts a scrim over the crown while it holds
 * the attention, and a fixture named `Kids Jams (demo)` reads as a playlist somebody named
 * that. So the claim goes where the rows are.
 *
 * It renders nothing on a live catalog, which is what makes it a statement rather than
 * decoration: the notice appearing is itself the fact that the rows are fixtures.
 *
 * The words arrive as a prop, from `CatalogLookup.demoNotice`, and originate in
 * `@pm/spotify`'s `DEMO_NOTICE` — so the fixtures and the interface cannot disagree about
 * whether the data is invented, and no client bundle has to hold the catalog to find out.
 */

import { Led } from '@/components/primitives/Led';

export type DemoNoticeProps = {
  /** Null on a live catalog, and then there is nothing to say. */
  readonly notice: string | null;
};

export function DemoNotice({ notice }: DemoNoticeProps) {
  if (notice === null) return null;

  return (
    <p className="picker__demo">
      {/* Amber reports (§5 rule 4), and the lamp is never the only carrier — the sentence
          beside it is the one that has to be read. */}
      <Led lit tone="report" label="demo data" quiet />
      {notice}
    </p>
  );
}
