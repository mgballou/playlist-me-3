# Read caps

Measured 11 September 2026 against `b966aee`, the branch that made a clipped set say how much
of it was read. With the ceiling now on screen, each one had to be either raised or shown to be
right.

**Three moved, two stayed, and one was spending eight requests to learn a number that the first
page already carries.**

| Set                   | Was | Now   | What bounds it                                         |
| --------------------- | --- | ----- | ------------------------------------------------------ |
| Saved tracks          | 200 | 1,000 | Twenty pages, read one after another, on every resolve |
| Blocked playlist      | 400 | 1,000 | The same twenty pages, per blocked playlist            |
| Followed artists      | 50  | 1,000 | The same twenty pages, one cursor at a time            |
| Top tracks            | 100 | kept  | Spotify serves 50 per range; the cap never binds       |
| Recently played       | 50  | kept  | Spotify keeps 50 plays; the cap is theirs              |
| Pasted playlist check | 400 | 50    | One page, which is where the length arrives            |

The constants live in `apps/web/src/lib/workbench/context.ts` (`CONTEXT_LIMITS`) and
`apps/web/src/lib/actions/catalog.ts` (`PASTED_PLAYLIST_READ`).

---

## What a cap here protects against

A read ceiling could be protecting any of three things: requests, wall time or memory. The
code settles which.

- **Requests, paid again on every resolve.** A resolve runs whenever the sources or the blocked
  playlists change. Each one builds a fresh client with an empty cache, and `resolveContext`
  reads the whole person again: every set, every blocked playlist. A cap is a request budget
  times the number of edits in a session.
- **Wall time, one page after another.** Offset paging waits for each page before asking for
  the next, and follows page by cursor, which cannot run any other way. A set's ceiling is a
  ceiling on how long a resolve waits for it. The resolver's own sources run the same way, one
  request at a time.
- **Memory is not a bound.** The payload carries ids. Five thousand of them, the worst case at
  the new ceilings with three blocked playlists, is about 130 KB of JSON.

So the caps protect against requests and waiting, and both costs fall only on a list longer
than the old cap. A shorter list ends on a short page and costs what it always did.

---

## The measurement

`LiveSpotifyClient` against a stubbed fetch that answers in Spotify's shapes after a fixed
delay. Requests are exact counts. Round trips are elapsed time divided by the delay, so they
measure the order of the waits and not Spotify's speed. The stub serves top tracks the way
developers report Spotify does: fifty, then an empty page.

Three accounts, each with 0, 1 and 3 blocked playlists of the size shown:

| Account (library / follows / each blocked list) | Blocked | Requests, was → now | Round trips, was → now |
| ----------------------------------------------- | ------- | ------------------- | ---------------------- |
| 150 / 30 / 120                                  | 0       | 8 → 8               | 4 → 4                  |
|                                                 | 1       | 11 → 11             | 7 → 4                  |
|                                                 | 3       | 17 → 17             | 7 → 5                  |
| 900 / 180 / 900                                 | 0       | 8 → 26              | 4 → 20                 |
|                                                 | 1       | 16 → 45             | 13 → 21                |
|                                                 | 3       | 32 → 83             | 13 → 22                |
| 12,000 / 2,000 / 10,000                         | 0       | 8 → 43              | 4 → 21                 |
|                                                 | 1       | 16 → 63             | 13 → 23                |
|                                                 | 3       | 32 → 103            | 13 → 29                |

What each account got back:

- **150 / 30 / 120** — whole, before and after. Nothing changes for a small account except the
  wait, which drops, because blocked playlists no longer queue behind the library.
- **900 / 180 / 900** — was library 200 of 900, follows 50 of 180, each block 400 of 900. Now
  every set is whole. This is the case a review on 9 September reproduced.
- **12,000 / 2,000 / 10,000** — was 200, 50 and 400. Now 1,000 of each, and the rows say so.

For scale, the sources side on the same stub, which a resolve pays before it reads the person:

| Recipe                                     | Requests | Round trips |
| ------------------------------------------ | -------- | ----------- |
| One artist, twelve albums, a guest on each | 26       | 27          |
| My library                                 | 9        | 9           |
| That artist, my library, one playlist      | 42       | 44          |

A round trip to `api.spotify.com` from here takes 80 ms on a reused connection. That number is
an unauthenticated `401` with no work behind it, so it is a floor: twenty-three round trips
cost at least 1.8 seconds, and a real page of fifty saved tracks takes longer.

---

## Why twenty pages

Twenty pages is 1,000 items at Spotify's page size of fifty. It sits inside what one source
already costs. The resolver reads one request at a time, an artist source at its album ceiling
takes thirteen requests before its first genre lookup, and the lookups alone may take sixty.

What it buys is the two headline exclusions. A clipped blocked playlist puts blocked tracks on
the deck. A clipped library lets a saved track through _only things you have not saved_. The old
numbers were also inconsistent with the resolver: a `library` source reads 400 saved tracks into
the pool while the familiarity set knew only 200 of them, so tracks 201 to 400 arrived from the
library and were scored as if never saved.

Follows back only the weakest familiarity signal. They get the same ceiling because the cost is
the same, a request per fifty acts and only for someone following more than fifty, and a
clipped read misjudges every act past it.

The worst case is real and is stated rather than hidden: an account with three blocked
playlists over 1,000 tracks spends 103 requests reading the person on every resolve. Spotify
counts calls in a rolling 30-second window and does not publish the number. Developers report
about 180 a minute in development mode; that figure is from forums and has not been checked
here. A `429` inside the person-read retries on `Retry-After`, and a set that still fails
arrives as `unread`, which the exclusion that relied on it says on its row.

## Why two stayed

**Top tracks, 100.** Spotify serves fifty top tracks per range, and asking at offset fifty
returns an empty page ([issue 1592](https://github.com/spotify/web-api/issues/1592)). So the
read costs two requests and holds fifty whatever the cap says. Lowering it to fifty would save
the second request, and that request is the one that proves the list ended: without it, the read would have to trust the page's `total`, and a `total`
above fifty would turn a whole set into a clipped one. A test in `live.test.ts` pins this.

**Recently played, 50.** Spotify keeps the last fifty plays and a `before` cursor past them
returns nothing
([forum thread](https://community.spotify.com/t5/Spotify-for-Developers/quot-Current-User-s-Recently-Played-Tracks-quot-before-param-not/td-p/5133179)).
One request. The set reports `unmeasured` when it is full, because Spotify sends no total, and
that is the truth rather than a limit of ours.

## The pasted link

`lookupPlaylist` read up to 400 tracks to put a length beside a pasted link, then discarded the
tracks. Since the coverage change, the length comes from the first page's `total`. It now reads
one page: one request for a list of any length, where it used to spend eight on a list of 400 or
more.

---

## Not changed here

- **The resolver's source ceilings** (`DEFAULT_RESOLVE_LIMITS` in `packages/spotify/src/resolve.ts`)
  bound how much a source contributes, not a set an exclusion checks. A thin source is reported
  by `SourceReport`, which still lacks a flag for a search that stopped at its page ceiling.
- **`PICKER_PLAYLISTS`, 200.** It bounds the list a picker shows, not a read an exclusion relies
  on. A playlist past it can still be pasted.
- **`DEFAULT_MAX_ITEMS`, 500.** The client's fallback when a caller names no ceiling. Every call
  in the app names one.
- **Familiarity is still not exact.** The README says it is. A library over 1,000 is still read
  in part, and the four `/me` sets carry coverage that nothing renders yet. That claim needs its
  own change.

## What would let these rise

- **Read the person once, not on every resolve.** The sets depend on the person and the blocked
  playlists, never on the sources, yet every source edit reads them all again. Holding the read
  between resolves turns a per-edit cost into a per-session one, and that, not the ceiling, is
  what makes a large library expensive.
- **Page offset lists concurrently.** The first page carries `total`, so the rest could go
  through the client's four-wide limiter at once. The request count stays the same and the
  wait drops to about a quarter.
- **Spend the genre lookups on something, or stop spending them.** They cost up to sixty
  requests per resolve and nothing reads the field. That is three sets' worth of pages.

## Sources

- Page size of fifty on saved tracks, playlist items, top items, follows and recently played:
  Spotify's Web API reference, read 11 September 2026.
- [Rate limits](https://developer.spotify.com/documentation/web-api/concepts/rate-limits): a
  rolling 30-second window, number not published.
- [Development-mode quota, July 2026](https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates):
  quota counted per developer account, `QUOTA_EXCEEDED` in the body of the `429`. No numbers.
- Top tracks stopping at fifty and recently played stopping at fifty are developer reports,
  not documentation. Neither has been checked against a live account, because there is none.
