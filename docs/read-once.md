# Reading the person once

Measured 12 September 2026. A review on 9 September found that **every resolve started cold**:
`chooseClient` built a `LiveSpotifyClient` per server action with the default
`memoryCacheFactory`, whose own comment says the store lasts "for the life of the client" —
which is one request. `cache.ts` had promised since the beginning that the cache was an
interface "so the web app can hand in one backed by storage that survives a reload". The web
app never did.

So adding an eighth source re-fetched the first seven, genre lookups and all, and the person's
library was read again on every edit.

---

## What it cost, and what it costs now

`LiveSpotifyClient` against a stubbed `fetch` that answers in Spotify's shapes from the demo
catalog, driven through `chooseClient` exactly as a server action drives it. Every row is a
separate resolve, in order, in one sitting. Requests are exact counts.

| The edit                         | Was | Now |
| -------------------------------- | --- | --- |
| One artist, albums and singles   | 12  | 12  |
| Add a second artist              | 20  | 8   |
| Change nothing and resolve again | 20  | 0   |
| Add a blocked playlist           | 21  | 1   |
| **That sitting, end to end**     | 73  | 21  |

And the same again starting from the library rather than an artist:

| The edit      | Was | Now |
| ------------- | --- | --- |
| My library    | 57  | 57  |
| Add an artist | 61  | 4   |
| **Both**      | 118 | 61  |

The first resolve of a session costs what it always did — there is nothing yet to reuse. Every
resolve after it pays for the difference only. Adding the second artist is worth eight
requests: one discography, three albums of tracks and four artists whose genres nobody had
asked for yet. Twenty minus twelve is eight, which is the whole claim.

The numbers are pinned by `apps/web/test/read-once.test.ts`, so they cannot rot quietly.

---

## How the cache is keyed

**By the session id, and by nothing else.** `Session` now carries `sid`: a random label minted
at login by `newSessionId()`, sealed in the same encrypted cookie as the tokens, and carried
across every refresh by `applyRefresh`. It is not a credential and it is not derived from one —
holding it lets you do nothing.

`apps/web/src/lib/spotify/session-cache.ts` keeps one set of named stores per `sid`, and
`chooseClient` is the only place that looks one up. Two people therefore cannot meet in one
store, which matters more than the requests: a shared library read is a privacy defect, not a
performance one. A cookie old enough to carry no `sid` gets no shared store at all and behaves
exactly as the app did before this change.

The refresh token would have been the other candidate for a key. It was rejected twice over:
it is a bearer credential, and Spotify rotates it, so the key would change under a session
that had not.

---

## How long it lives

**In this process, and nowhere else.** Nothing is written to disk, so no token and no library
outlives the server. A restart empties it.

Inside one process an entry is dropped fifteen minutes after its last use, and at most twenty
sessions are held at once — the least recently used goes first. Fifteen minutes covers a
sitting at the bench, which is the thing this exists to make cheap, and is short enough that a
track saved on a phone reaches familiarity without signing out. Both numbers bound memory
rather than correctness: forgetting early costs a read, and that is all it costs.

There is no timer. Expiry is swept on the next look, so an idle process holds nothing open.

---

## What is never held

- **A read that failed.** The call throws and a throw writes nothing, so a set that could not
  be read is read again next time rather than remembered as empty.
- **A read that may have been cut short.** A list exactly as long as the ceiling asked for
  might have more behind it. Only a list that ended on its own is kept, and a call that named
  no ceiling is never kept, because from outside the client there is no way to tell those
  apart.
- **A search.** Two people searching the same words is not the same question as two people
  reading the same library, and a search is cheap.
- **A playlist the person has just written to.** Creating a playlist forgets the list of
  playlists; adding tracks forgets that playlist's tracks. Those are the only two writes that
  make a held read wrong.

## What is held, and what it is worth

| Read                                         | Where the cache is                         |
| -------------------------------------------- | ------------------------------------------ |
| Saved tracks, top tracks, recently played    | `CachedSpotifyClient`                      |
| Followed artists                             | `CachedSpotifyClient`                      |
| A blocked playlist's tracks                  | `CachedSpotifyClient`                      |
| The playlist picker's list                   | `CachedSpotifyClient`                      |
| Who the token belongs to                     | `CachedSpotifyClient`                      |
| Artists, albums, album tracks, discographies | `LiveSpotifyClient`, over the same factory |

The split is not arbitrary. The catalog reads are keyed by an entity id and the live client has
always cached them — they only needed a store that outlives the request, which is what the
factory now is. The `/me` reads are keyed by _who is asking_, which is not something the live
client knows, so they are held one layer out.

---

## One thing this fixed on the way past

`getArtistAlbums` cached a discography under the artist and the depth but **not under the
ceiling**. A `track` source walks a collaborator three albums deep; an `artist` source asks for
twelve. The three-album read answered the twelve-album question, and the artist's catalog size
— §3.5's obscurity proxy — was learned from a walk that had stopped early, making a prolific
act look obscure.

Both were reachable before this change, inside one resolve. Making the store outlive the
request would have made them last a session, so the ceiling is now part of the key and a size
is learned only from a walk that reached the end.

---

## Not changed here

- **The read caps.** `CONTEXT_LIMITS` is untouched. Raising them is an open pull request of its
  own, and what that work wanted was this one: `docs/read-caps.md` names "read the person once,
  not on every resolve" as the thing that would let the caps rise. With a sitting's second
  resolve now costing nothing, a higher ceiling is paid once per session rather than once per
  edit.
- **Demo mode.** The fake has no person to key a store to and is a fixture rather than a
  network, so it caches nothing and its ledger still shows what the reads would really cost.
- **Concurrent identical reads.** Two calls for the same set in flight at once both reach
  Spotify; only the second one to finish is kept. Nothing in the app does this — the four sets
  a resolve reads in parallel are four different keys — so there is no in-flight dedupe to go
  wrong.
- **The genre lookups.** They are cached now, which is most of what a second resolve saves, but
  they still cost up to sixty requests on the first one and nothing reads the field. That is
  its own change.
