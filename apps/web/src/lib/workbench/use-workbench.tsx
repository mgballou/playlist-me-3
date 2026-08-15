'use client';

/**
 * The workbench: the recipe, the pool it resolved to, and the build that falls out of them.
 *
 * This is where the resolve/build split becomes behavior rather than a diagram.
 *
 * - **Resolving is a server action**, and it runs only when `resolveKey` changes. Sources
 *   changed, or a `playlist` exclusion named a list we have not read. Nothing else.
 * - **Building is a `useMemo`.** Re-roll is a new seed, lock is a longer lock list, reject is
 *   a bigger banished set — all three are the same pure call over the pool already in hand,
 *   so all three are instant and none of them costs a request (ui-sensibility §2.10).
 * - **The recipe and the seed survive a reload** (§2.5), because the seed is one number and
 *   it reproduces the build exactly.
 *
 * There is no business logic in any component. Components render this state and dispatch
 * these intents.
 */

import type { BuildResult, Lock, Recipe, TrackId, TrackPool } from '@pm/core';
import { build, defaultRecipe, recipeId } from '@pm/core';
import type { ResolveReport } from '@pm/spotify';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { resolveWorkbench } from '../actions/resolve';
import { AppMisuse } from '../errors/app';
import type { ErrorSurface } from '../errors/surface';
import type { KeyValueStore } from '../persistence/store';
import { browserStore } from '../persistence/store';
import { loadNames, saveNames } from '../persistence/names';
import { loadPlace, recipeFromSearch, savePlace } from '../persistence/recipes';
import type { ContextPayload } from './resolve-request';
import {
  EMPTY_CONTEXT_PAYLOAD,
  resolveKey,
  toEngineContext,
  toResolveRequest,
} from './resolve-request';

/**
 * The first render must match on the server and in the browser, so the starting recipe is a
 * constant rather than a fresh id. The real one arrives from storage or from a shared link
 * a tick later, which is also when `restored` flips.
 */
const INITIAL_RECIPE: Recipe = defaultRecipe(recipeId('untitled'), 'Untitled recipe');
const INITIAL_SEED = 1;

export type WorkbenchStatus = 'empty' | 'resolving' | 'ready' | 'failed';

export type WorkbenchState = {
  readonly recipe: Recipe;
  readonly seed: number;
  readonly locks: readonly Lock[];
  readonly rejects: ReadonlySet<TrackId>;
  readonly pool: TrackPool;
  readonly status: WorkbenchStatus;
  readonly error: ErrorSurface | null;
  readonly resolveReport: ResolveReport | null;
  /** What the last resolve cost. §5.2 */
  readonly requests: number;
  /** Null until there is a pool to build from. §9: an absence is a state, not an error. */
  readonly result: BuildResult | null;
  /** False for the first tick, while the held place is being read back. §2.5 */
  readonly restored: boolean;
  /** Human names for the ids the recipe holds. Presentation only — see persistence/names. */
  readonly names: ReadonlyMap<string, string>;
  /**
   * Seconds until the workbench re-issues a rate-limited resolve by itself, or null when
   * nothing is waiting. This is what makes §9's *"say how many, and retry automatically"*
   * true rather than a sentence about a retry that never happens.
   */
  readonly retryIn: number | null;
};

export type WorkbenchActions = {
  setRecipe(next: Recipe): void;
  reroll(): void;
  lockTrack(lock: Lock): void;
  unlockTrack(trackId: TrackId): void;
  rejectTrack(trackId: TrackId): void;
  undoReject(trackId: TrackId): void;
  /** Clears every lock and reject. Loading a recipe from the shelf starts clean. */
  resetTinkering(): void;
  rememberName(id: string, name: string): void;
  /** Re-issue the resolve now. The way out of a failure the person has to press. §9 */
  retryResolve(): void;
};

export type Workbench = WorkbenchState & WorkbenchActions;

const WorkbenchContext = createContext<Workbench | null>(null);

function mintSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff) + 1;
}

export function useWorkbenchState(): Workbench {
  const [recipe, setRecipeState] = useState<Recipe>(INITIAL_RECIPE);
  const [seed, setSeed] = useState(INITIAL_SEED);
  const [locks, setLocks] = useState<readonly Lock[]>([]);
  const [rejects, setRejects] = useState<ReadonlySet<TrackId>>(() => new Set<TrackId>());
  const [pool, setPool] = useState<TrackPool>([]);
  const [context, setContext] = useState<ContextPayload>(EMPTY_CONTEXT_PAYLOAD);
  const [resolveReport, setResolveReport] = useState<ResolveReport | null>(null);
  const [requests, setRequests] = useState(0);
  const [status, setStatus] = useState<WorkbenchStatus>('empty');
  const [error, setError] = useState<ErrorSurface | null>(null);
  const [restored, setRestored] = useState(false);
  const [names, setNames] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [attempt, setAttempt] = useState(0);
  const [retryIn, setRetryIn] = useState<number | null>(null);

  const storeRef = useRef<KeyValueStore | null>(null);
  const store = (): KeyValueStore => (storeRef.current ??= browserStore());

  // Hold the place: a shared link wins over what was left on the bench, because opening a
  // link is an explicit act and reloading is not. §2.5, §6
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const held = await loadNames(store()).catch(() => new Map<string, string>());
      if (!cancelled && held.size > 0) setNames(held);

      const shared = recipeFromSearch(window.location.search);
      if (shared !== null && shared.ok) {
        if (!cancelled) {
          setRecipeState(shared.value);
          setSeed(mintSeed());
          setRestored(true);
        }
        return;
      }
      const place = await loadPlace(store()).catch(() => null);
      if (cancelled) return;
      if (place !== null) {
        setRecipeState(place.recipe);
        setSeed(place.seed);
      } else {
        setRecipeState(defaultRecipe(recipeId(crypto.randomUUID())));
        setSeed(mintSeed());
      }
      setRestored(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!restored) return;
    void savePlace({ store: store(), recipe, seed, savedAt: Date.now() }).catch(() => {
      // Storage refused. The app still works; it just forgets. §2.7 — not a dead end.
    });
  }, [restored, recipe, seed]);

  const request = useMemo(() => toResolveRequest(recipe), [recipe]);
  const key = resolveKey(request);

  // Keyed on `key` alone, and that is the whole architecture: exclusions that read only the
  // track, the shape and both dials are absent from it, so moving them cannot cost a request.
  // `attempt` joins it so a retry — automatic or pressed — re-issues the same resolve.
  useEffect(() => {
    if (request.sources.length === 0) {
      setPool([]);
      setContext(EMPTY_CONTEXT_PAYLOAD);
      setResolveReport(null);
      setStatus('empty');
      setError(null);
      return;
    }

    let cancelled = false;
    setStatus('resolving');
    setError(null);

    void resolveWorkbench(request).then((outcome) => {
      if (cancelled) return;
      if (!outcome.ok) {
        setStatus('failed');
        setError(outcome.error);
        return;
      }
      setPool(outcome.resolved.pool);
      setContext(outcome.resolved.context);
      setResolveReport(outcome.resolved.report);
      setRequests(outcome.resolved.requests);
      setStatus('ready');
    });

    return () => {
      cancelled = true;
    };
    // Keyed on `key` and `attempt`, and nothing else. `request` is derived from the key;
    // depending on the object would re-resolve on every keystroke, which is the bug this
    // module exists to prevent.
  }, [key, attempt]);

  const retryResolve = useCallback(() => {
    setRetryIn(null);
    setAttempt((held) => held + 1);
  }, []);

  /**
   * The one automatic retry, and the countdown that makes it visible. §9 asks for a rate
   * limit to say how long and retry itself; it does **not** ask for a loop, and a loop is
   * exactly what would burn the shared quota. So: one retry per resolve, then the person
   * decides. The error surface's own words are what the notice shows either way.
   */
  const autoRetried = useRef<string | null>(null);
  useEffect(() => {
    if (error === null || error.retry !== 'automatic' || error.retryAfterSeconds === null) {
      setRetryIn(null);
      return;
    }
    if (autoRetried.current === key) {
      setRetryIn(null);
      return;
    }
    autoRetried.current = key;

    let left = error.retryAfterSeconds;
    setRetryIn(left);

    const tick = setInterval(() => {
      left -= 1;
      if (left > 0) {
        setRetryIn(left);
        return;
      }
      clearInterval(tick);
      setRetryIn(null);
      setAttempt((held) => held + 1);
    }, 1000);

    return () => {
      clearInterval(tick);
    };
  }, [error, key]);

  const engineContext = useMemo(() => toEngineContext(context), [context]);

  /** Pure, local, instant. No network is involved and nothing may pretend otherwise. §2.10 */
  const result = useMemo<BuildResult | null>(() => {
    if (pool.length === 0) return null;
    return build({ pool, recipe, seed, context: engineContext, locks, rejects });
  }, [pool, recipe, seed, engineContext, locks, rejects]);

  const setRecipe = useCallback((next: Recipe) => {
    setRecipeState(next);
  }, []);

  const reroll = useCallback(() => {
    setSeed(mintSeed());
  }, []);

  const lockTrack = useCallback((lock: Lock) => {
    setLocks((current) => [...current.filter((held) => held.trackId !== lock.trackId), lock]);
  }, []);

  const unlockTrack = useCallback((trackId: TrackId) => {
    setLocks((current) => current.filter((held) => held.trackId !== trackId));
  }, []);

  const rejectTrack = useCallback((trackId: TrackId) => {
    setRejects((current) => new Set(current).add(trackId));
  }, []);

  const undoReject = useCallback((trackId: TrackId) => {
    setRejects((current) => {
      const next = new Set(current);
      next.delete(trackId);
      return next;
    });
  }, []);

  const resetTinkering = useCallback(() => {
    setLocks([]);
    setRejects(new Set<TrackId>());
  }, []);

  const rememberName = useCallback((id: string, name: string) => {
    setNames((current) => {
      if (current.get(id) === name) return current;
      const next = new Map(current).set(id, name);
      void saveNames(browserStore(), next).catch(() => {
        // Names are a convenience; losing them costs an id on screen, never the recipe.
      });
      return next;
    });
  }, []);

  return {
    recipe,
    seed,
    locks,
    rejects,
    pool,
    status,
    error,
    resolveReport,
    requests,
    result,
    restored,
    names,
    retryIn,
    setRecipe,
    reroll,
    lockTrack,
    unlockTrack,
    rejectTrack,
    undoReject,
    resetTinkering,
    rememberName,
    retryResolve,
  };
}

export function WorkbenchProvider({ children }: { readonly children: ReactNode }) {
  const workbench = useWorkbenchState();
  return <WorkbenchContext.Provider value={workbench}>{children}</WorkbenchContext.Provider>;
}

export function useWorkbench(): Workbench {
  const workbench = useContext(WorkbenchContext);
  if (workbench === null) throw AppMisuse.missingProvider('useWorkbench', 'WorkbenchProvider');
  return workbench;
}
