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
- **`search`** is the workhorse, and its filters do not all compose. See §2.2.1 — getting this
  wrong is the most likely way to ship a source that silently returns nothing.
- **`newReleases`** is implemented as a `tag:new` album search, since the browse endpoint is
  gone.

#### 2.2.0 The supporting unions, enumerated

Named as types above and pinned here, because `packages/spotify` maps every one of them onto a
request parameter and guessing differently would be a silent mismatch.

| Union            | Members                                                           | Maps to                                        |
| ---------------- | ----------------------------------------------------------------- | ---------------------------------------------- |
| `CatalogDepth`   | `albums` · `albumsAndSingles` · `everything`                      | `include_groups` on `GET /artists/{id}/albums` |
| `TrackExpansion` | `album` · `collaborators` · `both`                                | Which edges a `track` source walks             |
| `Obscurity`      | `any` · `obscure`                                                 | Binary, because `tag:hipster` is               |
| `TopRange`       | `shortTerm` · `mediumTerm` · `longTerm`                           | `time_range` on `GET /me/top/{type}`           |
| `OrderStrategy`  | `shuffle` · `byRelease` · `artistClustered` · `sourceInterleaved` | Engine-only                                    |

**`sourceIndex` is first-source-wins.** A track reachable from two sources is credited to the
earlier one in `Recipe.sources`. Deduplication happens in the resolver, before the pool reaches
the engine — so `packages/spotify` must dedupe by `TrackId` and must not emit the same track
twice under different source indices.

#### 2.2.1 What search filters actually allow

The filters apply to different search types, and **the two we most want cannot be combined**:

| Filter        | Applies to           |
| ------------- | -------------------- |
| `artist:`     | album, artist, track |
| `album:`      | album, track         |
| `track:`      | track                |
| `year:`       | album, artist, track |
| `genre:`      | **artist, track**    |
| `tag:hipster` | **album only**       |
| `tag:new`     | **album only**       |

`genre:` is artist/track-scoped; `tag:hipster` is album-scoped. A single query cannot ask for
"obscure dub". Resolution therefore branches on obscurity rather than building one query:

- **Ordinary obscurity** → `type=track`, `q=<terms> genre:"…" year:a-b`. One request per page,
  tracks come back directly.
- **High obscurity** → `type=album`, `q=<terms> tag:hipster year:a-b` (no `genre:`), then
  `GET /albums/{id}/tracks` per album. Genre coherence is recovered at scoring time from
  `artist.genres` (§3.5) rather than at query time.

**The genre word is not discarded on the album path — it becomes free text.** A `genre:` filter
is unavailable there, so the term joins the query as ordinary search terms. That is a text
match against names rather than a classification, so it behaves differently, and the difference
is real enough to state rather than paper over.

**`newReleases` hits the same collision.** `tag:new` is album-scoped and `genre:` is not, so its
optional genre is also free text, not a filter.

**Encode this in the types, not in a comment.** The client's `AlbumSearchQuery` carries `tag`
and has **no `genre` field at all**; `TrackSearchQuery` carries `genre` and no `tag`. "Obscure
dub" is then unrepresentable rather than silently empty, which is the only version of this rule
that cannot be forgotten.

The second path costs one request per album on top of the search, which is exactly the kind of
thing the request budget in §5.2 exists to show the person before it spends it.

`limit` is capped at 10 and `offset` at 1000, so a single search source can reach at most
1,000 results across 100 requests. Pool building pages until it has enough or hits either
ceiling, and reports which.

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

**Where each half runs.** Resolving touches the network and holds the token, so it is a server
action returning the pool, the `EngineContext` and the request cost. `build` runs in the
browser over the pool already in hand, so re-roll, lock, reject and reorder cost nothing and
never re-fetch (ui-sensibility §2.10). The `EngineContext` — library, top tracks, recent plays,
follows — rides along with the pool for the same reason: fetching it lazily would make the
dials expensive, and the dials are the most-touched controls in the app.

**Re-resolving is keyed on the sources alone**, plus the playlist ids named by any `playlist`
exclusion. Everything else is free. The exception is honest and unavoidable: adding a playlist
exclusion names a list nobody has read yet, so it costs a resolve. There is no way to answer
"never anything off Kids Jams" without reading Kids Jams, and the UI says so rather than
hiding it.

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
  → reject(exclusions)        drop anything excluded, and anything rejected. §2.3
  → score(familiarity, depth) one weight per track. §3.5
  → select(target, maxPerArtist, locks, seed)   weighted sample without replacement;
                              locked tracks are guaranteed *membership* here
  → order(strategy, seed)     permute the free tracks only
  → placeLocks(locks)         locked tracks take their *positions* last. §3.2.1
  → BuildResult
```

#### 3.2.1 Why locks are resolved in two places

An earlier draft of this section put a single `honorPins` pass between `score` and `select`.
That is not implementable, and the reason is worth writing down: **a lock carries a playlist
index**, but `order` runs afterwards and would move it. Pinning before ordering cannot survive
`byRelease`.

So a lock is two guarantees, resolved at the two different moments each belongs to:

- **Membership** is settled inside `select` — a locked track is in the chosen set regardless of
  its weight, and it still counts against `maxPerArtist` and the target.
- **Position** is applied after `order`, which permutes only the unlocked tracks around the
  reserved indices.

This is what makes "a locked track holds its exact index across re-rolls" true under every
ordering strategy rather than only under `shuffle`. `select` and `order` also run off separate
RNG streams derived from the one seed, so changing the ordering strategy cannot silently change
which tracks were chosen.

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

`liveOrRemix` looks for `Live`, `Remix`, `Remaster`, `Karaoke`, `Instrumental` and `Radio Edit`
— but **only in suffix position**: after a `-` separator, or inside parentheses or brackets.
That is where Spotify's catalog actually puts them (`Song - Live at Budokan`, `Song (Radio
Edit)`, `Song - 2011 Remaster`).

Matching the bare word anywhere in the title is the obvious implementation and it is wrong. It
throws away "Live and Let Die", "Live Forever", "Live Wire" and "Long Live" — studio tracks,
silently removed, with no way for the person to work out why. A filter that quietly deletes
correct results is worse than no filter.

**The heuristic therefore under-catches rather than over-catches**, which is the right direction
to fail. A missed live track is one odd entry in a playlist; a wrongly excluded studio track is
a person wondering why a song they asked for never appears.

It misses two things, and both are deliberate:

- a live album whose tracks carry no marker in their titles at all — the dominant case
- a title punctuated `Song -Live` or `Song-Live`, because the separator rule requires the
  spaces Spotify itself uses

The UI calls it "best effort" rather than implying certainty, and the vocabulary lives in one
exported constant, separate from the segment-extraction rule, so adding a term later is one
line.

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

#### 3.5.1 Genres are borrowed time

`artist.genres` still returns, but Spotify marks it **deprecated** — the same notice
`popularity` carried before it was removed. Coherence scoring therefore treats genres as a
signal that may vanish:

- An artist with an empty `genres[]` is already normal today ("if not yet classified, the
  array is empty"), so the empty case is the tested path, not the edge case.
- When genres are unavailable, coherence falls back to **source provenance** — tracks from the
  same source, and artists that co-appear on the same albums, are treated as adjacent. This is
  weaker and it is not nothing.
- The fallback is exercised by a fixture with no genres on any artist, so the day the field
  disappears the app degrades instead of breaking.

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
  getUserPlaylists(): Promise<readonly PlaylistSummary[]>;
  createPlaylist(input: CreatePlaylistInput): Promise<PlaylistId>;
  // …
}
```

`getUserPlaylists` reads `GET /me/playlists` and is what makes the headline exclusion (§2.3) a
click rather than a pasted link. The `/users/{id}/playlists` form went in the 2026-02 cull; the
`/me` form did not. A `PlaylistSummary` is `{ id, name, trackCount }` — `trackCount` is Spotify's
own `tracks.total`, so naming a playlist costs nothing and only reading its tracks spends a
request. The picker keeps a link/URI/id field underneath the listing, because listing reaches
only what a person owns or follows and a public playlist they do neither with is a fair thing to
exclude.

Two implementations ship, in the same namespace:

- **`LiveSpotifyClient`** — real HTTP, zod-validated at the boundary, quota-aware (§5.2).
- **`FakeSpotifyClient`** — backed by fixtures, deterministic, no network.

#### 5.1.1 Endpoint facts the client is built against

Verified against the current reference, because several differ from what the old app assumed:

| Operation          | Endpoint                            | Limits that matter                        |
| ------------------ | ----------------------------------- | ----------------------------------------- |
| Search             | `GET /search`                       | `limit` ≤ 10, `offset` ≤ 1000. See §2.2.1 |
| Top tracks/artists | `GET /me/top/{type}`                | `limit` ≤ 50 — **not** capped like search |
| Saved tracks       | `GET /me/tracks`                    | `limit` ≤ 50                              |
| Playlist items     | `GET /playlists/{id}/items`         | Renamed from `/tracks` in 2026-02         |
| Own playlists      | `GET /me/playlists`                 | `limit` ≤ 50; entries can be `null`       |
| Add items          | `POST /playlists/{id}/items`        | 100 URIs per request                      |
| Create playlist    | `POST /me/playlists`                | `/users/{id}/playlists` was removed       |
| Cover upload       | `PUT /playlists/{id}/images`        | base64 JPEG, ≤ 256 KB, returns 202        |
| Artist / album     | `GET /artists/{id}`, `/albums/{id}` | One at a time; batch forms were removed   |

The batch removals are the expensive change: resolving 300 tracks' artists once meant 6
requests and now means up to 300, which is what the cache and the budget display in §5.2 exist
to manage.

Three details that only surface once you build against it:

- **`GET /albums/{id}/tracks` returns _simplified_ tracks** — no album object, so no
  `release_date` and no album track count. Every album-tracks fetch therefore needs a companion
  `GET /albums/{id}` to supply `releaseYear` and the denominator the depth proxy divides by
  (§3.5). It caches well, but it is a real per-album cost the budget must count.
- **`limit ≤ 10` with `offset ≤ 1000` reaches 1,010 results, not 1,000.** Paging stops when the
  _next_ offset would exceed the ceiling, and reports that it stopped there — "we ran out of
  results" and "Spotify will not show more" are different facts and the UI says which.
- **Playlist items can be `null`, a local file, or a podcast episode.** Each is caught and
  dropped rather than failing a page of 200 over one hole. `GET /me/playlists` carries the same
  holes, where a followed playlist has since been deleted. A hole is counted before it is
  dropped, because the page's own length is what says whether there is another page — filter
  first and a list of four hundred ends at the first hole in it.

#### 5.1.2 The client returns catalog tracks, not domain tracks

`SpotifyClient` cannot return a complete `Track`, and pretending otherwise pushes the problem
into every call site. Two fields are outside its reach:

- **`sourceIndex`** is resolver provenance. The client does not know which recipe source asked.
- **`artistGenres`** needs a separate `GET /artists/{id}`, which the track payload cannot
  supply.

So the client returns `CatalogTrack` — a `Track` without `sourceIndex`, with `artistGenres`
empty — and `resolveSources` fills both in. `FakeSpotifyClient` returns empty genres too, on
purpose, so the enrichment path is exercised in demo mode and in every test rather than only
against live data.

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
| `playlist-read-private`                             | Listing, and playlist sources and exclusions       |
| `user-library-read`                                 | The `library` source and the `inLibrary` exclusion |
| `user-top-read`                                     | The `topTracks` source and familiarity scoring     |
| `user-read-recently-played`                         | The `heardRecently` exclusion                      |
| `user-follow-read`                                  | The `followedArtists` source                       |
| `ugc-image-upload`                                  | Generated cover art                                |

#### 5.3.1 Flow details

- **`code_challenge_method` is `S256`.** Verifier is 43–128 chars of CSPRNG output; challenge
  is its SHA-256, base64url-encoded without padding.
- **PKCE needs no client secret.** The token exchange sends `client_id` and `code_verifier`
  instead. This is why setup asks for exactly one Spotify value (§9, README): there is no
  secret to leak, rotate, or explain.
- **`state` is required in practice, not just recommended.** It is generated per attempt and
  checked on return; a mismatch aborts without exchanging the code.
- **The verifier never reaches client JavaScript.** It is minted server-side and held in a
  short-lived httpOnly cookie alongside `state`, both cleared on callback.
- **The return path is a third handoff cookie**, not a field inside `state`. Both work; they
  have different tamper stories, and this one keeps `state` doing exactly one job. All three
  cookies are cleared on every callback path, success or failure.
- **`state` is checked before `code` is read**, so a mismatch returns without ever reaching the
  token exchange.
- **Refresh tokens may or may not rotate.** The response "might not include a new refresh
  token" — when it does not, keep using the existing one. Handling only the rotating case is
  the bug that logs everyone out an hour in.
- **Access tokens last an hour.** Refresh happens server-side, ahead of expiry, on demand
  rather than on a timer.

The only two environment values the app needs are `SPOTIFY_CLIENT_ID` and a `SESSION_SECRET`
for cookie encryption. Without them the app runs in demo mode rather than failing (§5.1).

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
