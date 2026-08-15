/**
 * The one function every path calls. Spec §3.1, §3.2; CLAUDE.md engine rule 2.
 *
 * Initial build, re-roll, re-roll of a single slot and restore-from-share are the same
 * call with a different seed and a longer lock list. There is no second selection path,
 * and therefore no second selection path to get wrong.
 *
 * `build` is pure: no clock, no ambient randomness, no I/O. Time and seed enter as
 * arguments at the boundary, which is what makes every engine test a plain assertion and
 * what makes a recipe plus a seed a complete description of a playlist.
 */

import type { EngineContext, Lock, Track, TrackPool } from './domain';
import { totalDurationMs } from './domain';
import type { TrackId } from './ids';
import { order } from './order';
import type { Recipe, SourceKind } from './recipe';
import type { RejectReport } from './reject';
import { reject } from './reject';
import { deriveSeed } from './rng';
import { score } from './score';
import type { SelectReport } from './select';
import { select } from './select';

/** How one source fared, from pool to finished playlist. §3.2 */
export type SourceContribution = {
  readonly sourceIndex: number;
  /** Null when the pool carries a source index the recipe no longer has. */
  readonly kind: SourceKind | null;
  readonly pooled: number;
  readonly kept: number;
  readonly chosen: number;
};

export type BuildReport = {
  readonly seed: number;
  readonly recipeId: Recipe['id'];
  readonly poolSize: number;
  /** Tracks the person banished from this recipe, removed before anything else. §3.3 */
  readonly banishedCount: number;
  readonly sourceContributions: readonly SourceContribution[];
  readonly reject: RejectReport;
  readonly select: SelectReport;
  readonly canReachTarget: boolean;
  readonly trackCount: number;
  readonly totalDurationMs: number;
};

export type BuildResult = {
  readonly tracks: readonly Track[];
  readonly report: BuildReport;
};

export type BuildInput = {
  readonly pool: TrackPool;
  readonly recipe: Recipe;
  readonly seed: number;
  readonly context: EngineContext;
  /** Slots the person pinned. §3.3 */
  readonly locks?: readonly Lock[] | undefined;
  /** Tracks the person banished from this recipe. They never come back. §3.3 */
  readonly rejects?: ReadonlySet<TrackId> | undefined;
};

/** Ordering runs off its own stream, so changing the strategy cannot change the cast. */
const ORDER_SEED_SALT = 1;

function countBySource(tracks: readonly Track[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const track of tracks) {
    counts.set(track.sourceIndex, (counts.get(track.sourceIndex) ?? 0) + 1);
  }
  return counts;
}

function contributions(
  recipe: Recipe,
  pool: readonly Track[],
  kept: readonly Track[],
  chosen: readonly Track[],
): readonly SourceContribution[] {
  const pooled = countBySource(pool);
  const keptCounts = countBySource(kept);
  const chosenCounts = countBySource(chosen);

  const indices = new Set<number>(recipe.sources.map((_, index) => index));
  for (const index of pooled.keys()) indices.add(index);

  return [...indices]
    .sort((a, b) => a - b)
    .map((sourceIndex) => ({
      sourceIndex,
      kind: recipe.sources[sourceIndex]?.kind ?? null,
      pooled: pooled.get(sourceIndex) ?? 0,
      kept: keptCounts.get(sourceIndex) ?? 0,
      chosen: chosenCounts.get(sourceIndex) ?? 0,
    }));
}

/**
 * Puts locked tracks on their pinned slots and fills what is left with the ordered
 * remainder. A lock past the end of a shorter playlist lands on the last slot, and two
 * locks fighting over one slot resolve by taking the next free one — a pin should nudge
 * rather than fail.
 */
function placeLocks(
  ordered: readonly Track[],
  locked: readonly { readonly index: number; readonly track: Track }[],
  length: number,
): readonly Track[] {
  const slots = new Array<Track | null>(length).fill(null);

  for (const { index, track } of locked) {
    const wanted = Math.min(Math.max(index, 0), length - 1);
    let slot = -1;
    for (let offset = 0; offset < length; offset += 1) {
      const forward = wanted + offset;
      if (forward < length && slots[forward] === null) {
        slot = forward;
        break;
      }
      const back = wanted - offset;
      if (back >= 0 && slots[back] === null) {
        slot = back;
        break;
      }
    }
    if (slot >= 0) slots[slot] = track;
  }

  const queue = [...ordered];
  const out: Track[] = [];
  for (let i = 0; i < length; i += 1) {
    const pinned = slots[i];
    if (pinned !== null && pinned !== undefined) {
      out.push(pinned);
      continue;
    }
    const next = queue.shift();
    if (next !== undefined) out.push(next);
  }
  return out;
}

export function build({ pool, recipe, seed, context, locks, rejects }: BuildInput): BuildResult {
  const lockList = locks ?? [];
  const banished = rejects ?? new Set<TrackId>();

  const surviving = banished.size === 0 ? pool : pool.filter((track) => !banished.has(track.id));

  const rejected = reject({ pool: surviving, exclusions: recipe.exclusions, context });
  const scored = score({ tracks: rejected.kept, shape: recipe.shape, context });
  const selected = select({ scored, shape: recipe.shape, locks: lockList, seed });

  const chosenById = new Map(selected.chosen.map((track) => [track.id, track]));
  const lockedPlacements = selected.report.locksApplied.flatMap((lock) => {
    const track = chosenById.get(lock.trackId);
    return track === undefined ? [] : [{ index: lock.index, track }];
  });
  const lockedIds = new Set(lockedPlacements.map((placement) => placement.track.id));

  const free = selected.chosen.filter((track) => !lockedIds.has(track.id));
  const ordered = order({
    tracks: free,
    strategy: recipe.shape.order,
    seed: deriveSeed(seed, ORDER_SEED_SALT),
  });

  const tracks = placeLocks(ordered, lockedPlacements, selected.chosen.length);

  return {
    tracks,
    report: {
      seed,
      recipeId: recipe.id,
      poolSize: pool.length,
      banishedCount: pool.length - surviving.length,
      sourceContributions: contributions(recipe, pool, rejected.kept, tracks),
      reject: rejected.report,
      select: selected.report,
      canReachTarget: selected.report.canReachTarget,
      trackCount: tracks.length,
      totalDurationMs: totalDurationMs(tracks),
    },
  };
}

export function canReachTarget(result: BuildResult): boolean {
  return result.report.canReachTarget;
}
