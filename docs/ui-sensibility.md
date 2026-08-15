# Interface Sensibility

**The front-end bar for Playlist.me.** How a person moves through this app, and what it owes
them at every step. Normative for everything in `apps/web`.

> **How to read this:** every section is normative. "Prefer", "always", "never" are deliberate.
> Where two rules collide, the more specific one wins. Section numbers are stable — source
> files cite them by number, so a section may be rewritten but never renumbered.

`CLAUDE.md` holds how to write code here. The design spec holds what the app does. This holds
what the code has to produce.

---

## 0. The bar, in one page

The previous two versions of this app shipped **Level 0** and called it an interface. Level 0
is real work and it is not enough. **Level 1 is the bar.**

|           | **Level 0 — it works**                      | **Level 1 — the bar**                                                     |
| --------- | ------------------------------------------- | ------------------------------------------------------------------------- |
| Flow      | Four routes: search, adjust, results, save. | One bench. The playlist rebuilds as you tune it.                          |
| Landing   | A hero and a Get Started button.            | A bench with a recipe already on it, mid-thought, inviting a change.      |
| Unit      | A track row.                                | **The recipe.** The thing the person is actually authoring.               |
| Actions   | Save, Reset, More Songs, Clear, all equal.  | **One primary per region.** Re-roll is the act; everything else is quiet. |
| Feedback  | Results appear.                             | The deck **rebuilds as you tune**. The build says why it chose.           |
| Dead ends | "You must select tracks."                   | Every empty state names the one thing to do and offers it.                |
| Color     | `bg-slate-600` on everything.               | Tokens carry **jobs**. One color means _act_; none is decoration.         |
| Depth     | A border, sometimes.                        | A named surface stack. Every surface's height is a decision.              |
| Headings  | `text-xl` and hope.                         | A heading owns a **surface**, so weight comes from structure.             |
| Frame     | Routes swap the whole view.                 | A **persistent bench**. One region changes and transitions.               |
| Waiting   | Nothing, then everything.                   | Placeholders **in place**. Nothing unmounts, nothing moves.               |
| Copy      | Explains the sliders.                       | Shows the material. The music is the content.                             |

The gap is not polish. Each row on the right is a decision the left column never made.

---

## 1. The six failures

Every rule below exists to prevent one of these. Read them as the acceptance criteria for
"does this feel like an instrument rather than a form with a theme".

**1. It reads flat.** No depth, no weight, no hierarchy. A heading is body text at a larger
size. Nothing tells the eye where to start. → **§5, §6**

**2. It reads as pages, not an app.** Tuning a source navigates. The deck rebuilds because the
bench re-rendered. Scroll jumps to the top. → **§7, §9**

**3. It explains instead of showing.** A recipe is a list of settings where a picture of the
pool would do. The exclusion that removed 200 tracks is described in a tooltip rather than
drawn. → **§11**

**4. It buries the thing the person thinks in.** They reason in _the playlist taking shape_ and
_what their tuning did to it_. A form that collects settings and only reveals the result on
submit makes them hold the causal link in their head, forever. → **§2.2, §2.3**

**5. It drives no behavior.** Five equal buttons, so none of them is the answer. The person
fiddles and nothing feels like progress. → **§3**

**6. It lies about what it knows.** A depth dial presented as a measurement. A live-track
filter presented as exact. This app estimates two things and must say so. → **§12**

---

## 2. Flow

### 2.1 One bench, not a wizard

v2 was four routes: search → adjustments → results → save. **That decomposition is the bug.**
It severs the causal link between a tweak and its effect, which is the only thing that makes
the app worth using.

v3 is **one persistent bench**. Sources, exclusions, shape and the resulting deck are all on
screen together, and the deck rebuilds under your hands as you tune. The person watches their
edit land.

### 2.2 The unit is the recipe

The person is not picking tracks. They are **authoring a recipe** that picks tracks. Every
screen treats the recipe as the object: it is what gets named, saved, shared, re-run, and shown
on the shelf.

A track is material the recipe produced. It matters, and it is not the unit.

### 2.3 Show the causal link, always

The single highest-value thing this interface does is connect a tuning to its effect:

- **The deck rebuilds as you tune.** Exclusions, shape and both dials are free — they run
  against the pool already in hand, so the result changes under your hands with no request
  and no placeholder.
- **The pool count moves when the corpus moves**, which is when sources change (or when a
  playlist exclusion names a list nobody has read — spec §3.1). It is not a live counter on
  every keystroke, and copy must not imply it is; what changes as you tune is the deck and
  the ledger summary.
- **Every exclusion shows what it removed**, as a number, on the exclusion itself. "Kids
  Jams — 214 removed" is the feature working, visible.
- **A source shows what it contributed** after a build. A source contributing zero is a broken
  recipe telling you so.
- **When the target cannot be reached, the deck says which constraint is binding** — not
  "no results".

### 2.4 The tinkering loop is the product

Lock, reject, re-roll. This loop is why someone opens the app a second time, so it gets the
best of everything:

- **Re-roll is the primary action of the deck region.** It carries the accent. It is never
  more than one input away.
- **Lock and reject live on the track, not in a menu.** They are the two most-used controls
  in the app after re-roll.
- **A re-roll never moves a locked track.** Visibly: locked slots hold position while the
  others change. That is the whole demonstration of determinism, for free.
- **Reject is undoable**, and the undo is in reach for as long as the build lasts.

### 2.5 The app holds your place, not you

- **The recipe survives a reload.** Always, without asking. Someone mid-tune who refreshes has
  lost nothing.
- **The current build survives a reload too** — the seed is enough to reproduce it exactly
  (spec §3.1), so this costs one number, not a cache.
- **Scroll position is remembered per region** and restored on return.
- **A cursor keys on identity, never on position.** A deck that re-rolls must not jump the
  scroll because indices moved.
- **A filter that shrinks a list clamps the cursor**, it does not reset it.

### 2.6 Sequence decisions; do not flatten them

Too many choices at one level is fixed by **ordering** them, never by deleting any.

Adding a source is one decision (which kind), then a second (which artist / what query),
then optional third-level tuning (catalog depth, obscurity). The second appears after the
first. The third is a reveal, never a field sitting there pre-emptively.

**A recipe with no sources shows one control, not fifteen.**

### 2.7 A dead end is a bug

Every terminal state names what happens next:

- **An empty bench** — the highest-leverage screen in the app, and the only one where a call to
  action has no competition. It offers a starting move, not a description of the app.
- **A build that reached zero tracks** — names the binding constraint and offers to relax it.
- **A pool too small for the target** — says how short it is and what would fix it.
- **Not connected to Spotify** — demo mode is running, and it says so, and it works.

"Nothing here" is not a design.

### 2.8 Reversal is part of the flow

- **Every tuning change is reversible** by changing it back. Nothing is committed until the
  playlist is written to Spotify.
- **Writing to Spotify is the one irreversible act**, and it says so once, before it happens.
  It is also the one action that leaves the app's world, so it confirms.
- **Rejecting a track is undoable** for the life of the build.
- **Every control disables together while a confirm is open**, so a second input cannot race it.

### 2.9 Choose the depth of each step

| Depth                      | Costs                            | Use for                                           |
| -------------------------- | -------------------------------- | ------------------------------------------------- |
| **A full-screen takeover** | Changes where you are            | The Spotify connect handoff. The save confirm.    |
| **An overlay**             | Borrows attention, gives it back | Picking an artist, a playlist, a genre            |
| **An inline reveal**       | Nothing                          | Source tuning, the build report, a track's detail |

**Anything that today needs only a scroll to reach becomes a reveal or a panel.** The bench
must be actionable without scrolling on a laptop.

### 2.10 Speed is part of flow

The interface responds to the input, not to the network. 100ms is where an action feels
_caused_ rather than _requested_.

The engine is local and pure (spec §3.1), so **re-roll, reorder, lock and reject are
instantaneous** — there is no request to wait on and nothing may pretend there is. Only
_resolving sources_ touches the network, and only when the sources themselves changed.

**Never re-fetch to re-roll.** The pool is already in hand.

---

## 3. One action per region

Every region answers "what is the one thing to do here" before it is designed.

**Five equal buttons is the failure v2 shipped** — Save, Reset, More Songs, Start Over, Clear,
all the same weight. Give a set of actions real tiers:

| Tier        | Weight                    | Use                                          |
| ----------- | ------------------------- | -------------------------------------------- |
| Primary     | The accent, filled        | The one action. Exactly one per region.      |
| Secondary   | Structural outline        | Real alternatives that ask for another pass. |
| Quiet       | Ghost, no chrome          | Reachable, never competing for the eye.      |
| Destructive | Danger tone, quiet weight | Never primary, never the default.            |

The regions and their one action:

| Region       | The one action        |
| ------------ | --------------------- |
| The bench    | **Build** (first run) |
| The deck     | **Re-roll**           |
| The save bar | **Save to Spotify**   |
| The shelf    | **Load** (per recipe) |

**Navigation is not an action.** A control that takes you somewhere is structural. The accent
is spent on doing, never on going.

**Emphasize by de-emphasizing.** When something will not stand out, quiet its neighbors rather
than shouting louder.

---

## 4. Tokens

### 4.1 Three tiers, one direction

```
primitives  →  semantic  →  component
 raw values    named jobs    narrow overrides
```

Each arrow is one way. A reverse reference is a cycle.

- **Nothing outside `tokens.css` names a primitive.** No screen, no component, no style rule
  holds a raw color, a raw measure or a raw duration.
- **Semantic is the layer everything consumes.** Name the job, never the value: `--surface`,
  `--line`, `--accent`, `--ink`. Never `zinc-800`, never `orange`.
- **Component tokens are for the narrow case** where one component needs an override the
  semantic layer would distort. Adding one is a decision, not a shortcut.

### 4.2 Two themes, complete blocks

This app ships **light and dark**, and **dark is the one the design is drawn for**. A console
lives in a dim room; more to the point, a dark ground is what flatters album art, which is most
of what is on screen.

Resolution order, stated once so the two ideas stop being confused:

1. A stored explicit choice wins.
2. Otherwise follow `prefers-color-scheme`.
3. With no preference either way, dark — which `color-scheme: dark light` delivers for free,
   because the used scheme is the first listed when the viewer has expressed none.

Light is a **complete recolor, not a dimmed copy**. The two grounds are different materials:
cool desaturated slate in the dark, warm grey panel in the light. Inverting one to get the
other produces mud.

- **Both themes live in one `light-dark()` declaration per token**, not in two blocks. The
  original rule here was "complete blocks of the same token set, never a subset" — this is a
  stronger form of it. There is no second block to fall out of sync with, so a token cannot
  be defined for one theme and forgotten for the other. It is not possible to express the
  bug.
- **The toggle sets `color-scheme` on the root and every token follows.** `prefers-color-scheme`
  is the default; an explicit choice wins over it and persists.
- **`tokens.test.ts` asserts every semantic token resolves in both themes** — and that any
  token which is deliberately theme-invariant (`--accent-ink` is, on purpose) is listed as
  such rather than silently missing its pair. Contrast ratios are measured, not eyeballed.
- **The dark theme is a recolor, not a dimmed light theme.** Hold the accent's hue, change the
  ground and the ink. A desaturated warm accent over a dark ground goes muddy.
- **The accent carries ink in both themes.** Black text on yellow, light and dark alike. This
  reads as a mistake in a diff and is not one.

### 4.3 One surface stays hue-free

Any surface behind **content the person is judging** — album art, a cover preview, the deck
itself — is hue-free and sits outside the theme's warmth. A tinted ground tints the very thing
they are there to assess.

---

## 5. Depth and color

The direction is **Console**: a mixing desk in a dim room. Machined panels, recessed wells,
knobs and faders you operate with your hands, one signal red, amber meters. Dark is the theme
this is drawn for.

> **What this replaced, and why it matters.** The first attempt was called "tactile mixtape"
> and produced thick outlines and hard offset shadows. That is **neubrutalism** — a printing
> language, descended from deliberate crudeness. It reads as 8-bit chunk, not as hardware, and
> in dark mode it drew a near-white box around every module. The lesson is worth keeping:
> _naming a feeling is not naming a language._ "Tactile" pointed at two opposite idioms, and
> the wrong one was cheaper to build.

Four rules carry the whole palette.

**1. One color means act, and it is red.** The accent marks the single thing to do in a region.
Nothing else earns it. _A sprinkled accent is exactly why nothing stands out._

**2. Nothing is separated by an outline.** A panel is told from its neighbour by **its own
value plus the light falling on it**. Proud things carry a soft shadow and a faint top edge;
recessed things carry an inset one. A seam is a hairline you have to look for, and
`tokens.test.ts` asserts it stays _below_ 3:1 against its panel — the one contrast rule in this
file that is a ceiling rather than a floor.

**3. Depth is light, and the light comes from above.** Three heights and no others: `well`
(machined in), `flat` (flush), `raised` (proud). A raised element gets a soft shadow plus a
`--edge-top` highlight; that highlight is what makes a panel read as moulded rather than drawn.

> **Alignment, stated on purpose.** _Refactoring UI_ teaches elevation through an ambient
> shadow plus a direct one, consistent with a single light source. The previous direction
> diverged from that and was wrong to. This one follows it, because a console **is** a lit
> physical object. The book's real point is unchanged either way: **elevation must be a system,
> not a per-component guess.**

**4. Amber reports, red acts.** Status is an LED: a small illuminated dot, amber for ordinary
state, red when something is held or armed. An LED is never the only carrier of a state — it
always sits beside a word or a glyph, because red and amber are 48° apart and that is not
enough for everyone.

**Every meter is amber too, and this is the rule people get wrong.** A knob's value arc and a
fader's travelled length report a position; they do not act. Building them in the accent is
the obvious move and it was tried: two knobs and two faders put four red marks in the rack,
and the deck's one red key — the thing the whole region exists to do — stopped being the
thing your eye went to. That is rule 1 failing exactly as it says it will. **The accent is
spent on the one action per region and on the one state that is armed, and on nothing else.**

Supporting rules:

- **Use fewer lines.** A change of ground, or more space, separates two regions better than a
  rule. Reach for a rule when the two regions share a surface.
- **Never muted text on a colored ground.** Derive the muted tone from that ground — same hue,
  adjusted lightness — or it reads as dirt.
- **Color is never the only carrier.** A state needs a word or a glyph as well as a tone.
- **Every tone is enumerated and named**, and measured against its ground rather than picked by
  eye. Ad-hoc greens accumulate into six greens.

### 5.2 The palette, decided

Colors are authored in **oklch**, so the dark theme can hold a hue and move only lightness and
chroma (§4.2). These are the starting values; tune them against the contrast assertions in
`tokens.test.ts`, never by eye alone.

**The accent is red and it carries white.** The fill is dark enough to hold small type at
4.5:1, which is why `--accent` is not the brightest red available — `--accent-bright` is, and
it is reserved for indicators, which are never text.

`tokens.css` is the source of truth. This table follows it, never the reverse.

| Token              | Light                   | Dark                    | Job                                        |
| ------------------ | ----------------------- | ----------------------- | ------------------------------------------ |
| `--ground`         | `oklch(83% .008 87)`    | `oklch(19.5% .006 260)` | The desk the panels sit on.                |
| `--surface`        | `oklch(87.9% .007 89)`  | `oklch(23% .007 258)`   | The panel.                                 |
| `--surface-raised` | `oklch(92.2% .006 85)`  | `oklch(27.1% .009 256)` | Proud of the panel.                        |
| `--surface-top`    | `oklch(96% .005 85)`    | `oklch(31% .01 256)`    | The highest step. Knob caps, key faces.    |
| `--surface-well`   | `oklch(76.1% .009 85)`  | `oklch(16.8% .004 264)` | Machined into the panel. Slots, wells.     |
| `--ink`            | `oklch(21.8% .004 264)` | `oklch(91.1% .005 248)` | Text.                                      |
| `--ink-muted`      | `oklch(42% .007 85)`    | `oklch(60.1% .013 252)` | Secondary text. Never on a colour fill.    |
| `--line`           | `oklch(70% .008 85)`    | `oklch(33% .008 258)`   | **A seam, not a border.** Stays under 3:1. |
| `--accent`         | `oklch(50% .19 27)`     | `oklch(54% .185 25)`    | **Act.** Carries white.                    |
| `--accent-bright`  | `oklch(58% .2 27)`      | `oklch(66% .2 25)`      | Indicators. Never text.                    |
| `--led`            | `oklch(58% .12 68)`     | `oklch(75.8% .14 73)`   | Amber. Reports, never acts.                |
| `--danger`         | `oklch(48% .17 29)`     | `oklch(54% .18 29)`     | Destructive. Never primary.                |

**Source tones** (§5.1) — an even ramp 110°→313°, ~29° apart, dodging the red accent by ≥45°
and the amber LED by ≥35°.

| Source kind       | Hue | Light                | Dark                 |
| ----------------- | --- | -------------------- | -------------------- |
| `track`           | 110 | `oklch(48% .13 110)` | `oklch(74% .13 110)` |
| `newReleases`     | 139 | `oklch(48% .13 139)` | `oklch(74% .13 139)` |
| `search`          | 168 | `oklch(48% .11 168)` | `oklch(74% .11 168)` |
| `library`         | 197 | `oklch(48% .10 197)` | `oklch(74% .10 197)` |
| `followedArtists` | 226 | `oklch(48% .12 226)` | `oklch(72% .11 226)` |
| `artist`          | 255 | `oklch(46% .15 255)` | `oklch(70% .13 255)` |
| `playlist`        | 284 | `oklch(46% .16 284)` | `oklch(72% .14 284)` |
| `topTracks`       | 313 | `oklch(46% .17 313)` | `oklch(72% .15 313)` |

**An earlier draft of this table failed its own rule** — a green sat 35° from the accent — and
`tokens.test.ts` caught it by measuring rather than by eye. That is why the test computes hue
separation instead of trusting the table.

**Three heights, and no others** (§5 rule 3). Separation is light, never an outline:

| Height   | Surface            | Light                            | Use                                   |
| -------- | ------------------ | -------------------------------- | ------------------------------------- |
| `well`   | `--surface-well`   | `--shadow-well` (inset)          | Slots, recessed module bodies, faders |
| `flat`   | `--surface`        | none                             | Flush panels, inert rows              |
| `raised` | `--surface-raised` | `--shadow-raised` + `--edge-top` | Modules, rows, keys, secondaries      |
| `lifted` | `--surface-top`    | `--shadow-lifted` + `--edge-top` | The primary action. One per region.   |

**A height is one step from the ground the thing sits on, not one fixed token.** The deck's
ground is `--surface-neutral` (§4.3), which is a step _lighter_ than the panel in the light
theme — so a track slot on `--surface-raised` sits two points of lightness from its own ground
there and reads as nothing at all. Measured from the neutral ground, one step up is
`--surface-top`, which is what a slot takes, and it reads in both themes. The system is the
step; the token is whatever that step lands on.

On press, a proud control sinks: the shadow shortens and the top edge dims, over
`--duration-fast` with `--ease-settle`. It travels 1px, not 4 — hardware has weight, and a big
jump reads as a sticker rather than a key. Under reduced motion it changes fill and shadow
without translating (§8).

### 5.1 Source tones are identity, not action

Each source kind carries its own tone, the way cassette labels did — artist, search, playlist,
library, top tracks. This is **identification**, and it does not violate §3:

- **A source tone never appears on a control that acts.** It tints a label, a chip edge, a
  swatch. It never fills a button.
- **No source tone sits within 45° of the accent.** The accent means act, and nothing may be
  mistaken for it.
- **The tone rides with the data** (§12). No screen decides what color a source kind is.

---

## 6. Type, and the heading problem

**A heading gets weight from structure, not from size.** The failure is a heading that is body
text at 1.5×, floating over its own content with nothing tying them together. v2 shipped this.

One primitive fixes it, and every titled region is built from it:

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  ← the band: its own surface, a heavy rule
┃ ▶  SOURCES              3     ┃    beneath it, glyph left, count right
┡━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┩
│   content sits recessed       │  ← the body: inset, one step back
└───────────────────────────────┘
```

- The heading owns a **surface**, not just a size.
- The body is **inset and one step back**, so heading and content read as one built unit.
- Four slots cover nearly every titled region: title, glyph, a count or state set to the
  trailing edge, and actions. A fifth is a smell.
- **Build it once, before the second module needs it.** Three hand-laid headings produce three
  spacings.

Type rules:

- **One scale.** Sizes come from `--text-*`; nothing is nudged to fit.
- **Two families, and the split is meaningful.** `--font-display` carries labels, headings and
  the app's voice; `--font-numeric` is monospaced and carries anything compared character by
  character: counts, durations, years, request costs. §6.1 names both, and it names them as
  one family rather than as a grotesque and a mono — a console's silkscreen and its readouts
  are cut from the same drawing.
- **Module labels are uppercase with generous tracking.** They are printed labels on a device.
  Body copy never is.
- **A number that changes in place must not reflow the text around it.** Tabular figures and
  reserved width, or the pool count twitches the whole header on every keystroke.
- **Duration and count formatting is one shared function** from `@pm/core` (§CLAUDE.md). It is
  among the most-read text in the app.

### 6.1 The two families, decided

Loaded through `next/font/google`, which self-hosts them at build time — so the app still has
no external font request and §14's "nothing depends on a service being reachable" holds.

- **`--font-display`: IBM Plex Sans.** Drawn for technical and industrial contexts, which is
  exactly what a panel of labelled controls is. It is neutral without being anonymous — the
  slight humanist warmth keeps it from reading as a system default. Sets headings, module
  labels, buttons and body copy.
- **`--font-numeric`: IBM Plex Mono.** Every count, duration, year, request cost and knob
  value. Always `font-variant-numeric: tabular-nums`, so a number changing in place cannot
  move its neighbours (§14).

The pair is deliberate: **they are the same family**, drawn together, so the readout under a
knob and the label above it share their skeleton. That is how real panel silkscreen works, and
it is why this is not simply "a sans and a mono".

Module labels run **uppercase at `--tracking-label` (0.16em)** and small — silkscreen is wide
and quiet, not big and bold. Body copy never does.

---

## 7. The frame

**The frame persists; one region changes.** This is the single largest jump from v2.

```
┌────────────────────────────────────────────────────────────┐
│  PLAYLIST.ME            demo mode · 412 in pool      ◐ ⚙   │ ← the crown
├──────────────────────────────┬─────────────────────────────┤
│ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━┓ │  ┏━━━━━━━━━━━━━━━━━━━━━━━┓  │
│ ┃ ▶ SOURCES           3   ┃ │  ┃ ⏻ DECK        30 · 1h58┃  │
│ ┡━━━━━━━━━━━━━━━━━━━━━━━━━┩ │  ┡━━━━━━━━━━━━━━━━━━━━━━━┩  │
│ │ artist   Khruangbin     │ │  │ 🔒 01 Maria También    │  │
│ │ genre    dub · 1975-85  │ │  │    02 Evan Finds…      │  │
│ └─────────────────────────┘ │  │    03 …                │  │
│ ┏━━━━━━━━━━━━━━━━━━━━━━━━━┓ │  └────────────────────────┘  │
│ ┃ ✕ BLOCK             2   ┃ │                              │
│ ┡━━━━━━━━━━━━━━━━━━━━━━━━━┩ │      ╔══════════════════╗    │
│ │ Kids Jams      −214     │ │      ║    RE-ROLL       ║    │ ← the act
│ │ in my library  −88      │ │      ╚══════════════════╝    │
│ └─────────────────────────┘ │                              │
│ ┏━━━━━━━━━━━━━━━━━━━━━━━━━┓ │                              │
│ ┃ ⚙ SHAPE            30   ┃ │                              │
│ ┡━━━━━━━━━━━━━━━━━━━━━━━━━┩ │                              │
│ │ ◉──────●───  DEEP CUTS  │ │                              │
│ │ ◉─●─────────  FAMILIAR  │ │                              │
│ └─────────────────────────┘ │                              │
├──────────────────────────────┴─────────────────────────────┤
│ ▸ 30 tracks ready · Kids Jams removed 214    [SAVE TO ▸]   │ ← the ledger
└────────────────────────────────────────────────────────────┘
```

**The crown** never moves and never rebuilds. It carries the pool count, the connection state,
and the theme toggle. Nothing else.

**The rack** is the three modules. It is the only region that is always visible, because it is
the recipe, and the recipe is the app.

**The deck** is the result. It transitions on re-roll; it does not rebuild.

**The ledger** is the lowest layer of chrome and the highest layer of attention: what the build
did, and the one way out of the app. Nothing may dim it.

Rules:

- Changing a module **transitions**. It does not rebuild the tree.
- **Place is restored on return** (§2.5).
- **Collapse is one decision, shared.** Below a threshold the rack and the deck stack, and
  every part reads the same answer so they can never disagree about whether there is room.

  "One decision" is easy to write and impossible to honor naively, because a media query in
  CSS and a `matchMedia` in JavaScript are already two numbers that can drift. What it costs
  in practice, and what this codebase does:

  1. **One exported query constant.** The only place a width appears.
  2. **A pre-paint script** that evaluates it and stamps `data-collapsed` on the root, so the
     first paint is already correct and nothing reflows.
  3. **A stylesheet that selects on the attribute** and names no width at all.
  4. **A subscription** (`useSyncExternalStore` over the same query) for anything that needs
     the answer in React.

  The stylesheet not knowing the number is the part that makes it one decision rather than
  two that agree today.

- **A collapsed region is inert**, not merely hidden. Someone moving through by keyboard must
  never land inside a panel they cannot see.
- **A glyph-only control keeps its name.** The visible label goes; the accessible name does not.

---

## 8. Motion

- **One vocabulary, defined once.** `--duration-fast` for a state change, `--duration-base` for
  a transition, `--duration-slow` for anything rare and large. No component invents a timing.
- **One house transition:** a short rise plus a fade. Something entering eases out; something
  that moves and settles eases in and out.
- **The press is the signature motion** (§5 rule 4). It is `--duration-fast`, it is on every
  raised control, and it is identical everywhere.
- **Re-roll animates what changed and only what changed.** Locked slots hold perfectly still
  while the rest turn over. This is the interface teaching determinism without a word of copy,
  and it is the best thing this app does. Get it right.
- **Reduced motion is designed, not stripped.** The reduced branch is its own design rather
  than an absence: slots cross-fade instead of turning over, the press changes color instead of
  translating, counts still count. **Nothing visible under normal motion may go missing under
  reduced motion.** The preference lives beside the durations and every animated primitive
  reads it, so no caller has to remember.
- **Motion earns its place by explaining a change.** It never decorates a state that did not
  change.

---

## 9. Waiting, emptiness, failure

- **Placeholders in place, never a swapped view.** The container stays; only its contents
  change. A deck that unmounts to load makes the whole page jump, which is a worse lie about
  progress than a spinner.
- **Size a placeholder to the content it stands for**, so nothing moves when the real thing
  lands. A 30-track deck shows 30 slots while it resolves.
- **Reduced motion drops the shimmer, not the block.**
- **A neighboring region never rebuilds because its sibling is reloading.** Ever. Tuning the
  shape module must not flicker the sources module.
- **Nothing a row can hold may push the page sideways.** A long track title, a long artist
  name, a four-digit count — each wraps, truncates or scrolls inside its own container.
- **Resolving sources shows real progress**, because it is genuinely slow and genuinely
  bounded: this many requests of that many. The request budget is visible (spec §5.2) — being
  honest about the cost is more useful than hiding it.
- **A failure says what broke and what to do.** The three that will actually happen, each with
  its own words:
  - **Rate limited** — resolves in seconds. Say how many, and retry automatically.
  - **Quota exceeded** — does not resolve today. Say so plainly; do not retry in a loop.
  - **Token expired** — reconnect, and return to exactly where they were. **This works only
    because of §2.5**, and the two rules are load-bearing together: a return path alone
    survives an OAuth round trip as a URL, but the recipe and the seed are what make the
    person land on their own work rather than an empty bench. Neither rule delivers this
    on its own.
- **An expected absence is a state, not an error.** No recipes on the shelf yet, no Spotify
  connection, no cover art — each is a designed state.

---

## 10. Forms and input

The bench is the form. It should never feel like one.

- **Every control has a real label bound to the real control.** Nothing relies on nesting or on
  placeholder text.
- **Search-as-you-type is debounced and cancellable**, and a stale response never overwrites a
  fresh one.
- **Validate and normalize at the boundary, and name the field that failed.** A malformed
  shared recipe URL says so and changes nothing.
- **A required marker is an annotation, not an action** — danger tone, never the accent.
- **Never present a wall.** Source tuning is stepped (§2.6), not a fifteen-field panel.
- **A slider always shows its value**, and the value is reachable by keyboard in sensible
  increments. The two dials are the most-touched controls in the app.

---

## 11. Show, do not explain

- **The bench never explains itself.** No blurb, no tutorial text that outlives its moment.
- **Surface the real material**, sized unequally by what needs attention: album art, track
  titles, the counts actually moving. Not a row of labelled numbers.
- **Album art is the color in this app.** The palette is deliberately restrained so that the
  art carries the visual interest. Never tint it, never overlay it, never crop it to a shape
  that fights it.
- **A drawing beats a sentence about the drawing.** The build report is a picture of where the
  tracks went and what was removed, not a paragraph.
- **Generated cover art is a real feature, not a placeholder.** A recipe's cover is derived
  from its own settings, so two recipes are told apart on the shelf before either is read.
  See §11.1 — it is a fingerprint, not a random pattern.
- **Replace a label with a glyph wherever the label is not the point** — but the accessible
  name always survives the label.

---

### 11.1 The cover is a fingerprint

A recipe's cover art is **derived from the recipe**, deterministically. Two recipes look
different because they _are_ different, and the same recipe always draws the same cover. A
random pattern would be decoration; this is a reading of the recipe you can learn.

Drawn on a canvas, 640×640, exported as JPEG under 256 KB (spec §5.1.1):

```
┌────────────────────────────────┐
│████████│▒▒▒▒▒▒▒▒▒▒▒▒│░░░░░░░░░░│ ← one band per source, width by its share
│████████│▒▒▒▒▒▒▒▒▒▒▒▒│░░░░░░░░░░│   of the pool, filled with its source tone
│████████│▒▒▒▒▒▒▒▒▒▒▒▒│░░░░░░░░░░│
│███▉▉▉▉▉▉▉▉▉▉▉▉▉▉▉▉▉▉▉▉▉▉▉▉▉▉▉▉▉│
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ ← one solid ink bar per exclusion, struck
│                                │   across the bands it removed from
│  LATE DUB,                     │ ← the name, display face, ink, bottom-left
│  NOTHING I KNOW                │
│  ──────●──   ─●───────         │ ← the two dials as notched rules
└────────────────────────────────┘
```

The rules that keep it legible rather than clever:

- **Every mark means something.** Band width is a source's share of the pool. Bar count is
  exclusion count. Notch position is a dial value. Nothing is added for texture.
- **It is deterministic**, seeded from the recipe's own content, so it is stable across
  sessions and machines and reproduces from a shared link.
- **It reads at 64px**, which is its size on the shelf. Test it there first, not at full size.
- **It uses the same source tones as the bench** (§5.2), so a violet band on the shelf and a
  violet chip in the rack are the same idea.
- **It holds one palette in both themes**, and that palette is the light one. It is a printed
  object, and it ends up on Spotify where there is no theme at all, so a cover that followed
  the app's would be one recipe with two fingerprints.

  **That last rule cannot be built by reading the semantic layer**, and the way it fails is
  worth writing down because it looked correct for two versions. A browser resolves
  `light-dark()` in a custom property at **computed-value time**, so a canvas asking
  `getComputedStyle(root).getPropertyValue('--ink')` is handed one already-themed colour with
  no pair left to split. Code that parsed off "the light half" found nothing to parse, passed
  the value through, and the cover quietly followed the theme — black in the dark, white in
  the light, and whichever the person happened to be looking at got uploaded. The fix is a set
  of `--cover-*` component tokens (§4.1) that hold no `light-dark()` at all, and the assertion
  is that they never do.

- **It never contains album art.** The cover describes the recipe, not the result — the result
  changes on every re-roll and the cover must not.
- **A recipe with no sources draws the empty state**, not a blank square.

The same drawing renders in three places, from one function: the shelf card, the save preview,
and the JPEG uploaded to Spotify.

---

## 12. Presentation follows data

**No screen decides what color a state is.** Each enumerated kind — source kinds, exclusion
kinds, build outcomes — carries its own tone, glyph and label in one registry, and one shared
component reads them.

- Adding a source kind makes it render correctly everywhere with no UI change.
- One place, and one only, turns a tone into a look.
- A state meaning "not yet decided" renders **nothing**, not a chip saying unknown. Absence of
  a judgment is not a status.

### 12.1 The honesty rules, in the interface

The app estimates two things (spec §3.5, §9). The interface says so, in these words or better:

- **The depth dial is labelled as an approximation.** Its help text says it reads album
  position because Spotify no longer publishes popularity. Never write copy implying it is
  measured.
- **The live/remix filter says "best effort".** It misses and it over-catches.
- **Demo mode announces itself** in the crown, permanently, and its data is visibly synthetic.
  A person must never believe they are looking at real Spotify results.
- **Familiarity, by contrast, is exact** — it is set membership in the person's own library —
  and may be stated plainly.

Overclaiming here would be the easiest lie in the project to tell, and the interface is where
it would be told.

---

## 13. The accessibility floor

Not a phase. Build-time rules, and WCAG 2.2 AA is the floor.

- **A visible focus indicator on everything focusable.** Set once, from the accent, with an
  offset. Never removed without a replacement.
- **Focus is never obscured** by fixed chrome, a drawer or the ledger bar (2.4.11).
- **Targets are at least 24×24, or spaced** so a near miss cannot hit the wrong one (2.5.8).
  Lock and reject sit next to each other on every track; a mis-tap there is destructive.
- **Anything draggable has a single-pointer alternative** (2.5.7). Reordering the deck by drag
  must also be reachable by keyboard.
- **The two dials are real sliders** with keyboard steps, `aria-valuetext` naming the position
  in words, not just a number.
- **Never re-ask for information already given** in the same flow (3.3.7).
- **Reduced motion is honored** (§8).
- **Use the platform's own primitive** for dialogs and menus wherever one exists. It supplies
  the focus handling and dismissal behavior a hand-rolled version always gets wrong.

  **This collides with §7's "nothing may dim the ledger", and the collision is real.**
  `dialog.showModal()` renders in the top layer, where `z-index` does not reach and the
  backdrop covers the entire viewport — ledger included. So the two depths in §2.9 use two
  different mechanisms, which is what the `--z-*` scale was already encoding:

  | Depth        | Mechanism                                                 | Covers the ledger |
  | ------------ | --------------------------------------------------------- | ----------------- |
  | **Overlay**  | non-modal `<dialog>` in normal stacking, at `--z-overlay` | No                |
  | **Takeover** | `dialog.showModal()`, top layer                           | Yes, by design    |

  An overlay borrows attention and gives it back, so the ledger stays lit and readable
  behind it. A takeover changes where you are, so covering everything is correct. The
  overlay pays for this by supplying escape-to-dismiss and focus return by hand — that is
  the real cost of the rule, and it is worth it.

- **Contrast holds in both themes**, asserted by `tokens.test.ts` (§4.2).
- **Pinch-zoom is never taken away.**

---

## 14. Rules that are engineering and design at once

Enforced in review, because each is a screen that does not survive real data.

- **Design every screen against the largest plausible content, never the seed data.** Track
  titles run to 90 characters. Artists have seven collaborators. A pool is 4,000 tracks. A
  layout that only works on "Maria También" breaks on the first Sigur Rós track.
- **A number that changes in place must not move its neighbors.** Tabular figures and reserved
  width, or the pool count twitches the header on every keystroke.
- **Album art loads from an address the component is handed**, never one it builds. Every
  image has a designed fallback, because Spotify images 404 and demo mode has none at all.
- **Nothing in the build may depend on Spotify being reachable.** Demo mode renders the entire
  app with zero credentials and zero network. This is a hard requirement, not a nicety —
  it is what makes the repo runnable by anyone (spec §5.1) and it is what CI tests against.

---

## 15. What to test

Test the structural half properly and the visual half stays a person's job.

**Always tested:**

- **The token contract** — both themes declare the same set, and every measured ratio holds
  (§4.2, §5).
- **Layer order** — an overlay sits above the rack; the ledger is never dimmed; a takeover sits
  above both.
- **Collapse behavior** — a collapsed region is inert, a glyph-only control keeps its name.
- **Place-keeping** — the recipe and the seed survive a reload; a cursor keys on identity and
  survives a re-roll.
- **Every terminal state**: empty bench, zero-track build, pool short of target, disconnected.
- **The reduced-motion branch** of every animated primitive.
- **The honesty copy** (§12.1) is present where required — a test that fails if the depth dial
  loses its approximation label.

**Not worth automating:** exact spacing, exact color, anything an image diff would own.
Geometry that jsdom cannot measure is **unverified**, in those words, and gets a browser pass
instead.
