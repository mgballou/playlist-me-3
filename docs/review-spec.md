# Reviewing this app without clicking through it

`docs/review-spec.json` drives laila's review harness. It captures twelve screens at phone
width and asks one question about each. This file says how to run it and what you would
otherwise get wrong.

Everything below was run against `docs/review-spec.json` on 20 August 2026. Every path was
walked, every status code recorded, every screen checked for what it actually rendered.

---

## Start the app

```bash
pnpm install
cd apps/web && pnpm exec next dev -p 3100
```

Then, from laila:

```bash
node scripts/review/capture.mjs \
  ~/projects/playlist-me/docs/review-spec.json \
  ~/shots/playlist-me
```

**Port 3100, not 3000.** The spec's `base_url` says 3100 and the walk was verified there.
`pnpm dev` uses 3000, and on this machine another project's dev server holds it —
`docs/deploy-readiness.md` records a Playwright run that silently tested the wrong app for
that reason. Run the app on a port nothing else wants and the trap cannot spring.

`pnpm dev -- -p 3100` does not work. pnpm passes `-p 3100` to Next as a directory name and
Next dies looking for `apps/web/-p`. Call `next dev -p 3100` directly, as above.

## No credentials, and none wanted

Demo mode is the default, not a flag. With no `SPOTIFY_CLIENT_ID` and no `SESSION_SECRET`
set, `readSpotifyEnv` returns `demo` and the app serves the whole product from a synthetic
catalog. This is why the app can be reviewed tonight: no Spotify account, no OAuth, no
login screen to get past.

**Do not create a `.env.local` before a review run.** Half-configured is worse than
unconfigured — a client id without a session secret still lands in demo mode, but you will
have spent the time wondering why.

The crown says `DEMO MODE` on every screen and names which variable is missing.

## What the demo data is

`packages/spotify/src/fixtures.ts` builds it from one seeded generator — no clock, no
`Math.random`, the same catalog every run. Fifty invented acts across thirteen invented
genres. Every name is made up. Nothing is scraped and nothing pretends to be real Spotify
content.

You will see Velvet Kettle, Bramblewire, Dinosaur Breakfast, Marmalade Mouse. Three
playlists — Kids Jams, Late Shift, Road Salt — each shown with a `(demo)` suffix. The
kids-music cluster exists so the headline feature, _never anything off this playlist_, can
be demonstrated with no account at all.

## The app is one page

There is no second route. `/` returns 200; everything else returns 404. The four
sections — Sources, Block, Shape, Deck — are client state behind the key row at the bottom,
not URLs.

So every screen in the spec is `/`, and the ten that need content carry a `?r=` share link
plus a key press in their `actions`. The link encodes a whole recipe, which is the app's own
share format, so it seeds the bench the way a person opening a shared link would.

## Four things that will mislead you

**A fresh browser is empty.** Sources 0, Deck `—`, "nothing built yet". No sample recipe
loads on a first visit. Every screen except the empty bench had to be driven to hold
anything, which is what the `actions` lists are for.

**Screen order matters.** The harness reuses one page for the run, and the app writes its
place to IndexedDB. Once a `?r=` recipe has loaded, plain `/` restores that recipe instead
of the first-run bench. `bench-empty` and `source-kinds` must run first. Do not reorder the
screens.

**Track order changes between runs.** Opening a share link mints a fresh seed, so the same
recipe gives a different 25 tracks and a different running time each time. Counts, shape and
layout repeat; titles do not. Never diff two deck screenshots.

**One console error is expected.** `GET /favicon.ico` 404, on every load. The app ships no
favicon. It is cosmetic and it is not a per-screen finding.

## Three findings the walk turned up

These are in the spec's `notes` as well. None were fixed — this branch changes no
application code.

**A share link shows raw ids.** The block screen reads `pl-kids-jams`, not `Kids Jams`.
Friendly names live in an IndexedDB `names` map that the link does not carry, so anything
arriving by link wears its fixture id. A person opening a shared recipe sees this too, not
just the harness.

**The shelf breaks when the deck is scrolled.** Scroll the deck to its foot and open the
shelf: the ledger bar and the key row paint across the middle of the shelf panel, the lower
half of the screen goes blank, and "Keep this recipe" cannot be pressed. The shelf is opened
non-modally, so the ledger's `z-index: 20` wins. Reproduced at 430x932 on every run, and
captured deliberately as the `shelf-blocked` screen. The ordinary `shelf` screen resets to
Sources first to get a clean shot.

**Two auth routes redirect to nothing.** `GET /api/auth/login` returns 307 to
`/?connect=unavailable`; `GET /api/auth/callback` returns 307 to `/?auth=notConfigured`.
Both render the plain empty bench with no notice of any kind — no client code reads either
parameter. In demo mode they are silent dead ends. `GET /api/auth/logout` returns 405; it
takes POST, which returns 303 to `/`.

## What was verified

| Screen          | Path    | Status | Rendered                                           |
| --------------- | ------- | -----: | -------------------------------------------------- |
| `bench-empty`   | `/`     |    200 | Empty bench, Sources 0, Deck `—`                   |
| `source-kinds`  | `/`     |    200 | The eight source kinds                             |
| `sources`       | `/?r=…` |    200 | 2 sources, 122 pooled                              |
| `block`         | `/?r=…` |    200 | Block −8, shown as `pl-kids-jams`                  |
| `block-picker`  | `/?r=…` |    200 | Three demo playlists                               |
| `shape`         | `/?r=…` |    200 | Both dials, length target, order                   |
| `deck`          | `/?r=…` |    200 | 25 slots, lock and reject on each                  |
| `why-these`     | `/?r=…` |    200 | Report open: 23/108 from library, 2/14 from artist |
| `save`          | `/?r=…` |    200 | Takeover: "Nothing reaches Spotify"                |
| `save-done`     | `/?r=…` |    200 | "Wrote 25 tracks in 1 batch", 3 requests           |
| `shelf`         | `/?r=…` |    200 | Night Drive kept, 2 sources · 1 blocks             |
| `shelf-blocked` | `/?r=…` |    200 | Ledger paints over the shelf — the defect above    |

Paths probed and left out of the spec, because none of them render anything worth looking at:

| Path                 | Status | Why it is not a screen               |
| -------------------- | -----: | ------------------------------------ |
| `/api/auth/login`    |    307 | Redirects to `/?connect=unavailable` |
| `/api/auth/callback` |    307 | Redirects to `/?auth=notConfigured`  |
| `/api/auth/logout`   |    405 | POST only; POST returns 303 to `/`   |
| `/favicon.ico`       |    404 | Not shipped                          |
| any other path       |    404 | There is no other page               |
