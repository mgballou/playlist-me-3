# Playlist.me

Build playlists on Spotify from inputs you choose, not from everything you have ever played.
A recipe names its sources, its exclusions and its shape; the engine turns that plus a seed
into a playlist; the app writes it to Spotify.

**Read `docs/specs/2026-08-15-playlist-me-design.md` before starting work.** It holds the
design, the decisions and their reasons — including why the whole recommendation engine is
local rather than Spotify's. This file holds only how to write code here.

---

## Commands

```bash
pnpm install
pnpm dev            # web app, localhost:3000
pnpm test           # vitest, all packages
pnpm test:watch
pnpm test:e2e       # playwright, against demo mode
pnpm typecheck      # tsc --noEmit across the workspace
pnpm lint           # eslint + prettier check
pnpm fix            # eslint --fix + prettier --write
pnpm check          # typecheck + lint + test. run before every commit.
```

---

## Layout and dependency direction

```
packages/core/     domain types + the pure engine. no DOM, no React, no I/O.
packages/spotify/  the client. interface + Live impl + Fake impl. quota-aware.
apps/web/          Next.js 16 + React 19. auth, the bench, the deck, the shelf.
```

Dependencies flow one way: **web → spotify → core**.

`core` never imports `spotify` — barred by lint. It deals in normalized domain types; mapping
Spotify's JSON onto them is `spotify`'s only job at the boundary.

Engine tests run against `packages/core/test/fixtures/`, **never** against live data or
recorded API responses.

---

## The engine's four rules

Load-bearing. Breaking any one costs more than it saves.

1. **No `Date.now()`, no `Math.random()`, no I/O inside `packages/core`.** Time and seeds enter
   as arguments at the boundary. This is what makes every engine test a plain assertion, what
   makes re-roll deterministic, and what makes a recipe plus a seed a complete description of
   a playlist — which is the entire share-by-URL feature. Enforced by lint.

2. **`build` is one function, called from every path.** Initial build, re-roll, re-roll a
   single slot, and restore-from-share are the same call with different seeds and lock lists.
   Never write a second selection path for a special case.

3. **A Recipe is data, and only data.** No methods, no class, no behavior. It serializes to
   JSON, round-trips through a URL, and survives a schema version bump. Anything that wants to
   _do_ something with a recipe is a function that takes one.

4. **Every pass in the pipeline is pure and independently testable.** `reject`, `score`,
   `select`, `order` each take their inputs and return a value. `build` composes them and
   returns the reasoning alongside the result — a generator that cannot say why it chose is a
   black box.

---

## TypeScript

- `strict: true`, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- **No `any`.** `unknown` at boundaries, narrowed immediately. No `as` casts except where a
  type guard genuinely cannot express it, with a comment saying why.
- **Discriminated unions over string flags.** A source is `{ kind: 'artist', … } | { kind:
'search', … }`, never `{ type: string }`. Exhaustive `switch` with a `never` default.
- **Branded ids.** `TrackId`, `ArtistId`, `PlaylistId` are branded strings, not `string`.
  Passing an artist id where a track id belongs must fail typecheck, not at runtime.
- **`as const` for every literal set**, so ids are unions of literals.
- **`readonly` on every domain type's fields and arrays.** The domain is immutable; the only
  mutation in the codebase is React state.
- **Object parameters once a function takes three or more arguments**, so call sites read as
  named. Two or fewer stay positional.
- **Return a typed object or a value, never a tuple, never a loose record.**
- **No default exports** outside Next.js's required ones (pages, layouts, route handlers),
  which lint carves out explicitly.
- **No barrel re-exports across packages** beyond each package's single `src/index.ts` public
  surface. Reaching into another package's internals is a layering break.
- **Errors are typed classes with a static factory**: `QuotaExceeded.retryAfter(seconds)`.
  Never `throw new Error('...')` with a hand-written string.
- **Zod validates every external response at the boundary**, once, in `packages/spotify`.
  Nothing downstream re-checks shapes.

---

## Naming

| Concept                   | Pattern                                  | Example                                  |
| ------------------------- | ---------------------------------------- | ---------------------------------------- |
| Engine pass               | verb                                     | `reject`, `score`, `select`, `order`     |
| Selector                  | `noun` or `verbNoun`, pure and read-only | `poolSize`, `estimatedRequestCost`       |
| Predicate                 | `canX` / `isX` / `hasX`                  | `isExcluded`, `canReachTarget`           |
| Type                      | noun                                     | `Recipe`, `TrackPool`, `BuildResult`     |
| Report returned by a pass | `{X}Report`                              | `BuildReport`, `RejectReport`            |
| Client implementation     | `{Which}SpotifyClient`                   | `LiveSpotifyClient`, `FakeSpotifyClient` |
| Typed error               | `{Reason}` + static factory              | `QuotaExceeded.retryAfter(30)`           |
| React component           | noun of what it shows                    | `SourceRack`, `TrackSlot`, `Dial`        |
| Hook                      | `use{Noun}`                              | `useRecipe`, `useBuild`                  |
| Test file                 | mirrors the source path                  | `src/select.ts` → `test/select.test.ts`  |

---

## Testing

Vitest. Tests mirror source paths.

- **Never mock the engine.** It is pure and fast. Build real pools from fixtures.
- **Prefer a property to three examples.** The properties worth pinning: same seed produces
  the same playlist; `maxPerArtist` is never exceeded; an excluded artist never appears; a
  locked track holds its index across re-rolls; a rejected track never returns.
- **`FakeSpotifyClient` backs integration tests**, so the network is never a test dependency.
- **Playwright runs against demo mode**, which needs no credentials and therefore runs in CI.
- **No comments in tests** unless the test is genuinely unusual.
- One assertion per `expect`. No chained `.and()`.

---

## Interface

`docs/ui-sensibility.md` is normative for everything in `apps/web`. Read it. The direction is
**tactile mixtape** — chunky high-contrast blocks, controls that feel physical, playful color.
It should invite fiddling, because fiddling is the product. The rules most easily broken:

- **One accent per region.** The accent means _act_. Navigation never takes it.
- **Nothing rebuilds to show that it is loading.** Placeholders in place, sized to content.
- **No raw values outside the token definitions.** Semantic names only — `surface`, `line`,
  `accent`. Never `zinc-800`, never `#ff5c39`.
- **Every terminal state names what happens next.** The empty bench is the highest-leverage
  screen in the app.
- **Reduced motion is designed, not stripped.** Nothing visible under normal motion goes
  missing under reduced motion.
- **Number and duration formatting is one shared function**, used everywhere.

---

## Honesty rules

This app makes claims about music. Two of them are estimates, and the code says so.

- **Depth is a proxy, not a measurement.** `popularity` was removed from the API; track
  position stands in for prominence. The UI labels it as an approximation. Never write copy
  that implies it is measured.
- **`liveOrRemix` is a title heuristic.** It misses and it over-catches. The UI says "best
  effort".
- **Demo fixtures are synthetic and say so.** Invented artists and titles, never scraped data,
  never presented as real Spotify content.

---

## Anti-patterns

- ❌ `Date.now()` or `Math.random()` anywhere under `packages/core`.
- ❌ A second selection path for re-roll, single-slot re-roll, or restore.
- ❌ `core` importing `spotify`, or either importing from `apps/web`.
- ❌ An engine test that imports fixtures from anywhere but `packages/core/test/fixtures/`.
- ❌ Business logic in a React component, a hook, or an event handler. Components render state
  and dispatch intents.
- ❌ `any`, a default export outside Next's required ones, or a stringly-typed id.
- ❌ Re-validating a shape downstream of the zod boundary.
- ❌ A raw color, measure or duration outside the token definitions.
- ❌ Copy that implies depth or live-detection is exact.
- ❌ Reaching for a database. Recipes are data in IndexedDB and in URLs. See spec §6.

---

## Git

- Branch off `main`. Never commit to `main` directly.
- Commit messages: imperative, one line, no trailers, no AI attribution.
- Run `pnpm check` before every commit.
- PR descriptions follow the format in the global `CLAUDE.md`.
