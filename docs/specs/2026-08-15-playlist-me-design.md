# Playlist.me — Design

**Build playlists on Spotify from inputs you choose, not from everything you have ever played.**

This is the third version of an idea. v1 was a bootcamp Vite app; v2 was a Next.js app built
around Spotify's `/recommendations` endpoint. This document specifies v3, which shares the
intent of both and none of the architecture.

> **How to read this:** every section is normative. "Prefer", "always", "never" are deliberate.
> Where two rules collide, the more specific one wins. Section numbers are stable — source
> files cite them by number, so a section may be rewritten but never renumbered.

---

## 1. Why v3 exists

### 1.1 The user problem

Spotify's own generators read the whole library and the whole listening history. For a parent,
that history is half kids' music, and there is no way to tell Spotify to ignore it. The result
is a generator that has been quietly poisoned by an input the person never chose and cannot
remove.

The want is narrower and more controllable than "make me a playlist":

- Build from **specific inputs** — these artists, this genre, this era, this playlist.
- Against **specific exclusions** — never this artist, nothing off the kids playlist, nothing
  I already own.
- With a bias toward **things I have not heard**, on demand rather than always.
- Then **write it to Spotify** as a real playlist.

### 1.2 The technical problem

v2 was a thin proxy over two Spotify endpoints. Both are gone.

| What v2 used                                     | Status                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------------------- |
| `GET /recommendations`                           | Deprecated 2024-11-27. 403 for any app without a pre-existing quota extension.   |
| `GET /audio-features`                            | Deprecated 2024-11-27. The five sliders v2 was built around no longer have data. |
| `GET /artists/{id}/related-artists`              | Deprecated 2024-11-27.                                                           |
| `GET /artists/{id}/top-tracks`                   | Removed for development-mode apps, 2026-02.                                      |
| `GET /browse/new-releases`, `/browse/categories` | Removed for development-mode apps, 2026-02.                                      |
| `GET /tracks`, `/albums`, `/artists` (batch)     | Removed for development-mode apps, 2026-02. Fetch individually.                  |
| `popularity` on track/artist/album               | Removed for development-mode apps, 2026-02.                                      |
| `GET /search` with `limit=50`                    | Capped at `limit=10`, default 5, 2026-02.                                        |

Development mode additionally now requires the app owner to hold active Spotify Premium, allows
**5 allowlisted users**, and counts quota **per developer account** rather than per app.
Extended quota is open only to registered businesses with 250,000+ monthly actives, so it is
permanently out of reach for a portfolio project. **We design for development mode and treat its
limits as fixed.**

### 1.3 What follows from that

v2 could not survive as a proxy, so v3 **owns its recommendation logic**. That is not a
consolation prize — it is the thing that makes the product work. A local engine can honor
exclusions that Spotify's endpoint never accepted, and it turns the app from an API demo into
a system with a domain model worth testing.

v2 also had no user login at all: client-credentials only, which meant it could never write a
playlist to the user's account. v3 authenticates the user. Writing the playlist is the point.

---

## 2. The domain model

### 2.1 A Recipe is the whole product

Everything the person builds is one value:

```ts
type Recipe = {
  readonly id: RecipeId;
  readonly name: string;
  readonly sources: readonly Source[]; // where tracks may come from
  readonly exclusions: readonly Exclusion[]; // what may never appear
  readonly shape: Shape; // how many, how ordered, how spread
};
```

A Recipe is **declarative, named, saved, and re-runnable**. Running it twice with different
seeds gives different playlists from the same intent. This is the difference between a tool and
a one-shot form, and it is what makes the app worth returning to.

### 2.2 Sources — the corpus, chosen deliberately

```ts
type Source =
  | { kind: 'artist'; artistId: ArtistId; depth: CatalogDepth }
  | { kind: 'track'; trackId: TrackId; expand: TrackExpansion }
  | { kind: 'search'; query: string; genre?: string; years?: YearRange; obscurity: Obscurity }
  | { kind: 'playlist'; playlistId: PlaylistId }
  | { kind: 'library' }
  | { kind: 'topTracks'; range: TopRange }
  | { kind: 'followedArtists'; depth: CatalogDepth }
  | { kind: 'newReleases'; genre?: string };
```

Notes that matter:

- **`artist` walks the discography**, because `top-tracks` is gone. Artist → albums →
  album tracks. `CatalogDepth` decides how much of that to pull.
- **`track` with `expand`** reaches the album and the collaborating artists. Collaboration is
  the only artist-similarity signal left after `related-artists` was removed, and it is a
  genuinely good one — features and split releases encode real scene adjacency.
- **`search`** is the workhorse. Spotify's query syntax still carries `genre:`, `year:`,
  `artist:`, and the `tag:hipster` / `tag:new` modifiers. `Obscurity` maps onto `tag:hipster`
  and is how "music I have not heard" gets requested at the API level.
- **`newReleases`** is implemented as `tag:new` search, since the browse endpoint is gone.

### 2.3 Exclusions — the reason the app exists

```ts
type Exclusion =
  | { kind: 'artist'; artistId: ArtistId }
  | { kind: 'playlist'; playlistId: PlaylistId } // "never anything off Kids Jams"
  | { kind: 'inLibrary' } // only things I have not saved
  | { kind: 'heardRecently' }
  | { kind: 'years'; range: YearRange }
  | { kind: 'duration'; range: DurationRange }
  | { kind: 'explicit' }
  | { kind: 'liveOrRemix' }; // title heuristics, see §3.4
```

**`playlist` and `inLibrary` are the headline features.** They are the two things Spotify's own
generator has never offered and the two that solve the stated problem. Every other exclusion is
ordinary; these two are the product.

### 2.4 Shape — how the pool becomes a playlist

```ts
type Shape = {
  readonly target: { kind: 'count'; count: number } | { kind: 'duration'; ms: number };
  readonly maxPerArtist: number;
  readonly order: 'shuffle' | 'byRelease' | 'artistClustered' | 'sourceInterleaved';
  readonly familiarity: Dial; // 0 = only what I do not know, 1 = only what I do
  readonly depth: Dial; // 0 = deep cuts, 1 = the obvious ones
};
```

`familiarity` and `depth` are the two dials on the bench. They are the interface's headline
controls, so they get first-class model positions rather than living in a settings drawer.

**`depth` without `popularity` is a real problem.** The field was removed in 2026-02, so
"obvious" cannot be read off the API. §3.5 specifies the proxy we use instead, and names its
limits honestly.

---

## 3. The engine

### 3.1 The one rule that shapes everything

```
resolve(sources)          → TrackPool     impure. network. lives in packages/spotify.
build({ pool, recipe, seed }) → BuildResult   PURE. no I/O, no clock, no ambient randomness.
```

**`build` is a pure function.** No `Date.now()`, no `Math.random()`, no fetch — enforced by
lint, not by good intentions. Time and seed enter as arguments at the boundary.

Three things fall out of that for free, which is why the rule is worth the discipline:

1. Every engine test is a plain assertion against a fixture pool. No network, no mocks, no
   flake.
2. Re-roll is deterministic, so a recipe plus a seed is a complete description of a playlist —
   which is what makes share-by-URL a two-line feature instead of a backend.
3. A recipe that produced a good playlist can reproduce it exactly, months later.

### 3.2 The pipeline

`build` is a sequence of pure passes, each independently testable:

```
pool
  → reject(exclusions)        drop anything excluded. §2.3
  → score(familiarity, depth) one weight per track. §3.5
  → honorPins(locks, rejects) fixed slots first, banished tracks removed. §3.3
  → select(target, maxPerArtist, seed)   weighted sample without replacement
  → order(order, seed)        arrange the chosen set
  → BuildResult
```

`BuildResult` carries the tracks **and** the reasoning: how many candidates each source
contributed, what each exclusion removed, and whether the target was reachable. The UI shows
this. A generator that cannot say why it chose is a black box, and a black box is not fun to
tinker with.

### 3.3 Lock and reject — the tinkering loop

The loop that makes this worth opening twice:

- **Lock** a track: it holds its slot through every subsequent re-roll.
- **Reject** a track: it is banished from this recipe and its slot is refilled.
- **Re-roll**: a new seed fills every slot that is neither locked nor already good.

Locks and rejects are part of the build input, not post-processing. Re-rolling a single slot is
the same function call with a different seed and a longer lock list — there is no second code
path, and therefore no second code path to get wrong.

### 3.4 Title heuristics are heuristics, and say so

`liveOrRemix` matches against title patterns — `Live`, `Remix`, `Remaster`, `Karaoke`,
`Instrumental`, `Radio Edit`, and their bracketed variants. This is a heuristic. It will miss a
live album whose tracks are not marked, and it will catch a studio track named "Live and Let
Die". The UI calls it "best effort" rather than implying certainty, and the pattern list lives
in one exported constant so it is testable and correctable.

### 3.5 Scoring without `popularity` or audio features

Both signals v2 relied on are gone. What remains, and what we do with it:

| Signal                                     | Source                          | Used for                                                                             |
| ------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------ |
| Artist genres                              | `GET /artists/{id}`, `genres[]` | Coherence — how well a track fits the recipe's genre center                          |
| Release year                               | `album.release_date`            | Era fit, `byRelease` ordering                                                        |
| Track number / album size                  | `GET /albums/{id}/tracks`       | **Depth proxy** — openers and singles skew "obvious"; track 9 of 14 skews "deep cut" |
| Appears in user's library / top / followed | user endpoints                  | **Familiarity**, directly and reliably                                               |
| Artist catalog size                        | `GET /artists/{id}/albums`      | Weak obscurity proxy                                                                 |
| `tag:hipster` membership                   | search-time                     | Obscurity, applied at fetch rather than at score                                     |

**Familiarity is measured well; depth is estimated.** Familiarity comes from the user's own
library, top tracks, and follows — those endpoints survive, and set membership is exact. Depth
leans on track position, which is a genuine proxy but a lossy one. The spec states this
plainly, the README states it plainly, and the UI labels the depth dial as an approximation.
Overclaiming here would be the easiest lie in the project to tell.

---

## 4. Layout and dependency direction

```
packages/core/     domain types + the pure engine. no DOM, no React, no I/O.
packages/spotify/  the client. interface + Live impl + Fake impl. quota-aware.
apps/web/          Next.js 16 + React 19. auth, the bench, the deck, the shelf.
```

Dependencies flow one way: **web → spotify → core**.

`core` never imports `spotify`. It deals in normalized domain types; mapping Spotify's JSON
onto them is `spotify`'s only job at the boundary. Anything that breaks this makes the engine
untestable against fixtures, which is the whole point of separating them.

Engine tests run against `packages/core/test/fixtures/`, never against live data or recorded
API responses.

---

## 5. The Spotify client

### 5.1 Interface, live, fake

```ts
interface SpotifyClient {
  getArtist(id: ArtistId): Promise<Artist>;
  getArtistAlbums(id: ArtistId, depth: CatalogDepth): Promise<readonly Album[]>;
  getAlbumTracks(id: AlbumId): Promise<readonly Track[]>;
  searchTracks(query: SearchQuery): Promise<readonly Track[]>;
  getSavedTracks(): Promise<readonly Track[]>;
  getTopTracks(range: TopRange): Promise<readonly Track[]>;
  getPlaylistTracks(id: PlaylistId): Promise<readonly Track[]>;
  createPlaylist(input: CreatePlaylistInput): Promise<PlaylistId>;
  // …
}
```

Two implementations ship, in the same namespace:

- **`LiveSpotifyClient`** — real HTTP, zod-validated at the boundary, quota-aware (§5.2).
- **`FakeSpotifyClient`** — backed by fixtures, deterministic, no network.

**The fake is load-bearing, not a testing convenience.** It is what lets someone clone this
repo and run it with zero credentials, which is the difference between a portfolio project
people can look at and one they can only read about. It also backs every Playwright run.

Fixture data is **synthetic** — invented artists, albums, and titles. It is not scraped
Spotify data and never presents itself as such, in the fixtures or in the UI. Demo mode says
it is demo mode.

### 5.2 Living inside the quota

Development-mode quota is per developer account and small, and the endpoints that would have
made this cheap were removed. So request discipline is a feature, not an implementation detail:

- **Batch endpoints are gone**, so individual fetches run through a concurrency limiter.
- **Caching by entity id**, in-memory per request and persisted across sessions for artists and
  albums, which change rarely.
- **429 handling** honors `Retry-After` and distinguishes rate limiting from the newer
  `{ reason: 'QUOTA_EXCEEDED' }` body — those need different messages, because one resolves in
  seconds and the other does not resolve today.
- **Every build reports its request cost**, and the UI shows it. Being honest about the budget
  is more useful than hiding it, and a recipe that would cost 400 requests should say so before
  it spends them.

### 5.3 Auth

OAuth Authorization Code with PKCE. Tokens live in encrypted, httpOnly, SameSite=Lax cookies
via `jose`; refresh happens server-side. No token ever reaches client JavaScript.

Scopes, and why each is needed:

| Scope                                               | For                                                |
| --------------------------------------------------- | -------------------------------------------------- |
| `playlist-modify-private`, `playlist-modify-public` | Writing the playlist — the point                   |
| `playlist-read-private`                             | Playlist sources and playlist exclusions           |
| `user-library-read`                                 | The `library` source and the `inLibrary` exclusion |
| `user-top-read`                                     | The `topTracks` source and familiarity scoring     |
| `user-read-recently-played`                         | The `heardRecently` exclusion                      |
| `user-follow-read`                                  | The `followedArtists` source                       |
| `ugc-image-upload`                                  | Generated cover art                                |

---

## 6. Persistence

**No database.** Recipes live in IndexedDB, export as JSON, and encode into a URL.

A recipe is a small declarative value, so a shared link carries the whole thing — no server, no
account, no row to migrate. Someone opening a shared link gets the recipe; running it against
their own Spotify gives them their own playlist, correctly, because the recipe describes intent
rather than results.

This is the right call for a project whose first-run experience should be `pnpm install &&
pnpm dev`.

---

## 7. The interface

`docs/ui-sensibility.md` is normative for everything in `apps/web`. The direction is **tactile
mixtape**: chunky high-contrast blocks, controls that feel physical, playful color. It should
invite fiddling, because fiddling is the product.

Four surfaces:

1. **The bench** — the workspace. SOURCES / BLOCK / SHAPE as three physical modules, the
   familiarity and depth dials beneath them, and a live pool count that moves as you tweak.
2. **The deck** — the built playlist. Per-track lock and reject, re-roll, and the build's
   reasoning available inline rather than hidden.
3. **The shelf** — saved recipes, each with generated cover art derived from its settings, so
   a recipe is recognizable before it is read.
4. **The save** — writes to Spotify, uploads the cover, links out to the real playlist.

Rules carried over from the reference sensibility that this project must not break:

- **One accent per region.** The accent means _act_. Navigation never takes it.
- **Nothing rebuilds to show that it is loading.** Placeholders in place, sized to content.
- **No raw values outside the token definitions.** Semantic names only.
- **Every terminal state names what happens next.** An empty bench is the highest-leverage
  screen in the app.
- **Reduced motion is designed, not stripped.**

---

## 8. Testing

Vitest. Tests mirror source paths.

- **The engine is pure, so it is never mocked.** Build real state from fixtures.
- **Prefer a property to three examples.** The properties worth pinning: same seed produces
  the same playlist; `maxPerArtist` is never exceeded; an excluded artist never appears; a
  locked track holds its index across re-rolls; a rejected track never returns.
- **`FakeSpotifyClient` backs integration tests**, so the network is never a test dependency.
- **Playwright smoke tests run against demo mode**, which needs no credentials and therefore
  runs in CI.
- No comments in tests unless the test is genuinely unusual. One assertion per `expect`.

CI runs `typecheck`, `lint`, `test`, `build` on every push and pull request.

---

## 9. Known limits, stated up front

These belong in the README too. A portfolio project that hides its constraints is worse than
one that names them.

1. **Depth is estimated, not measured.** Track position is a proxy for prominence. See §3.5.
2. **No audio-feature filtering exists any more.** Energy, danceability, and valence cannot be
   filtered on at any price. v2's five sliders are not coming back, and no third-party
   substitute is worth a hard dependency here.
3. **Development mode caps the app at 5 allowlisted users** and requires the owner to hold
   Premium. Anyone cloning this runs it against their own Spotify app.
4. **`search` returns at most 10 per request**, so building a large pool costs many requests.
   The budget display in §5.2 exists because of this.
5. **Artist similarity is inferred from collaboration**, not from Spotify's own graph, which
   is no longer exposed. It works well for scene-adjacent artists and poorly for artists who
   never collaborate.

---

## 10. Out of scope

Named explicitly so they do not creep in:

- Playback. The Web Playback SDK needs Premium and a token in the browser; linking out to
  Spotify is correct here.
- Collaborative or multi-user recipes. No accounts, no server, no rows.
- A third-party audio-analysis provider to replace audio features. It would add a second API
  key, a second failure mode, and a second set of terms, to restore a feature the product no
  longer needs.
- Mobile-native anything. The web app is responsive; that is the whole mobile story.
