# Review answers — 2026-09-01

Screens captured by `laila/scripts/review.py` from `review/playlist-me.json`, answered by Matthew.

| #   | Screen        | Question                                              | Answer       |
| --- | ------------- | ----------------------------------------------------- | ------------ |
| 1   | bench-empty   | Does the empty bench tell you what to do first?       | **clear**    |
| 2   | source-kinds  | Are the eight source kinds easy to tell apart?        | **easy**     |
| 3   | sources       | Can you see what each source gave the pool?           | **yes**      |
| 4   | block         | Is it clear what the block took out?                  | **clear**    |
| 5   | block-picker  | Is it obvious these playlists are invented demo data? | **hidden**   |
| 6   | shape         | Do the two dials say what they actually do?           | —            |
| 7   | deck          | At this width, is the track list readable?            | **readable** |
| 8   | why-these     | Does the report explain why these tracks were chosen? | **yes**      |
| 9   | save          | Is it clear that nothing reaches Spotify here?        | **clear**    |
| 10  | save-done     | Does the result say plainly what it did?              | **yes**      |
| 11  | shelf         | Would you recognize this recipe on the shelf later?   | **yes**      |
| 12  | shelf-blocked | Is anything covering the shelf panel here?            | **covered**  |

Not answered: 6 (shape). Those screens are unchanged until he says otherwise.

## What the two answers cost

Nine came back approving and were left alone. The other two:

- **5, block-picker — `hidden`.** A picker now prints the demo notice over its rows, and
  nothing at all over a real library, so the notice appearing is the fact. It arrives with the
  rows as `CatalogLookup.demoNotice`, sourced from `@pm/spotify`'s `DEMO_NOTICE`, so a picker
  cannot list fixtures while implying it read a library. All three pickers, not only this one —
  the artist and track pickers list invented names for the same reason.
- **12, shelf-blocked — `covered`.** The z-order was not the cause and is unchanged: the ledger
  sits above an overlay on purpose (§7). The cause was that the document had a scrollbar §7.1
  says it cannot have. `.slot__time` is absolutely positioned when clipped on a phone, and with
  no containing block on the stage all twenty-five of them resolved against the viewport, a
  thousand pixels past a frame that is exactly `100dvh` tall. Moving focus into the shelf
  scrolled the document and slid the pinned rails across the panel. The stage is now the
  containing block for what it scrolls.
