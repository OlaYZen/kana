# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

> The front end is four static files that work on their own — no build step, no bundler, nothing
> to install. The backend in `backend/` is **optional**: it adds accounts, server-side saves and
> the progress report, and if nothing answers `/api/health` the app hides all of that and runs
> exactly as it did before it existed. Don't make it a hard dependency.

`kana` — a Japanese kana (hiragana/katakana) recognition drill.

| File | Role |
|---|---|
| `index.html` | markup only — six screens (`#menu`, `#auth`, `#stats`, `#play`, `#end`, `#fatal`) plus three `<dialog>` sheets (`#moreSheet`, `#fontSheet`, `#chartSheet`); `#play` holds one answer block per mode (`#typeMode`, `#writeMode`, `#chooseMode`) |
| `styles.css` | the entire stylesheet, mobile-first |
| `kana.json` | **all content** — `fonts[]`, `charts[]`, `decks[]`. No kana or font names live in JS or CSS |
| `app.js` | all front-end logic, one IIFE, sectioned by `/* ---------- name ---------- */` banners |
| `icon.svg` | the app icon — see **The icon** below before touching it |
| `start.sh` | install / update / run, executable in git (mode `100755`) |
| `backend/` | the optional FastAPI server |

That plus `README.md` and this file is the whole repository. Three superseded standalone pages —
`hiragana-game.html`, `katakana-game.html` and `kana-chart.html`, near-identical predecessors of
the drill and the chart — were deleted; they are in git history at `3ece9c6` if one is ever
needed. Don't reintroduce a second copy of the game: they drifted out of sync with the real app
the moment they stopped being loaded.

The project directory used to be called `hkk`, and that name survives in exactly one place: the
localStorage key. See **Persistence** below — it is deliberate, not a leftover to tidy up.

## Running it

Must be served over HTTP. `fetch("kana.json")` is blocked on `file://`, so double-clicking
`index.html` shows the `#fatal` screen instead of the app.

```bash
./start.sh              # venv, deps, git pull, uvicorn — the whole backend
python -m http.server 8000   # front end only, no accounts
```

`start.sh` is idempotent: it only pulls when the tree is clean, only reinstalls when
`requirements.txt`'s hash changed, and FastAPI serves the static files itself, so there is one
origin and no CORS.

It binds **0.0.0.0** by default and prints the LAN address, because the flick drills only exist on
a touch device — testing them means opening the app on a phone, and a loopback-only bind makes
that impossible. The cost is that the whole network can reach it over plain HTTP; `--host
127.0.0.1` is the way back.

Kana glyphs need a CJK-capable font installed on the host to render at all.

## Architecture

**`kana.json` is the single source of content and `app.js` is script-agnostic** — it renders
whatever deck it is handed. Adding or changing decks, cards, accepted romanisations, chart layout
or font options is a JSON edit, never a code edit. Keys prefixed `//` (`"//fonts"`, `"//charts"`)
are prose comments for the section that follows; JSON has no comment syntax and `app.js` ignores
them. Keep them current when the shape they describe changes.

- deck: `{id, label, script, sample, subtitle, note, cards[]}` — `script` is `"hiragana"`/`"katakana"`
- card: `{q, a, alt?}` — `q` is the kana, `a` the canonical romaji, `alt` extra accepted spellings
  (`si` for `shi`, `hu` for `fu`, `sya` for `sha`, `nn` for `n` …)
- font: `{id, label, ja, note, families[], generic}` — `families` are probed at boot; omit it for
  an option that is deliberately just the device's `generic` face
- chart: `{id, label, ja, sample, subtitle, sections[]}`, one entry per script. A section is
  `{title, en, type, …}` where `type` is `"grid"` (consonant `rows` × vowel `cols`, `null` cells
  are grid gaps, optional `single` for the standalone ん/ン) or `"flow"` (a wrapping `items` list).
  **Charts carry layout, not readings** — a cell is just a kana string and its romaji is looked up
  from the decks, so the chart and the quiz can never disagree. The exception is a flow item
  written `{q, a}`, used for the extended katakana (ファ ティ ヴァ …), which are reference-only and
  in no deck.

**Colour** is washi paper throughout — cream ground, ink text, vermilion seal accent — defined
once in `:root` (`--paper*`, `--c-ink*`, `--shu`, `--brass`, `--matcha`). The accents are
deliberately darker than a dark theme's would be: the same red/gold/green at "glowing on indigo"
lightness fails contrast on cream. Nothing re-themes wholesale — the chart sheet and the menu only
re-point `--accent`, flipping shu-red/indigo-blue via `[data-script]`.

Six decks: base / dakuten / combination × hiragana / katakana (46 / 25 / 36 cards each, 214
total). Obsolete kana (ゐ ゑ ヰ ヱ, the archaic yi/ye/wu forms, polysyllabics) are excluded on
purpose — do not "complete" the charts by adding them back.

**Three answer modes**, chosen in the Options sheet and held in `state.mode`:

| mode | prompt | answer | graded by |
|---|---|---|---|
| `type` | kana | romaji, typed | `accepts()` — canonical `a` plus every `alt` |
| `choose` | kana | romaji, 1 of 4 | exact match on `a` |
| `write` | **romaji** | **kana, typed** | `writeAccepts()` — see the invariant below |

Plus `flick`, which is not selectable here — see the flick drills below.

`write` exists to build familiarity with the Japanese keyboard, so it needs a real IME; the
`#kanaInput` field is separate from `#input` rather than an attribute swap, because changing
`inputmode`/`lang` on a live field does not reliably re-trigger the on-screen keyboard. `type` and
`write` are the same interaction reversed and share `submitTyped()` / `markWrong()` / the Enter
handler, routed through `typedField()`.

**Two flick drills** train the phone keyboard rather than a deck. A Japanese flick keyboard has
ten keys, one per gojūon row, and the vowel comes from the swipe direction (middle a, left i, up
u, right e, down o). `flick-vowel` asks for a direction and accepts any character with that vowel;
`flick-key` asks for a key and accepts any character from its row. They are **runs, not modes** —
generated `FLICK_LEN` (20) prompts long, unaffected by the deck or answer mode, listed in their
own `#flickDecks` section, and scored under the reserved mode `"flick"` so their records never mix
with a deck's. `state.flick` holds `"vowel"`/`"key"` while one is running and `activeMode()` is
what everything records against.

**They are offered on touch devices only** (`TOUCH &&` in `buildMenu()`) — flicking is a phone
keyboard gesture, so there is nothing to practise with a physical keyboard. Records already set
survive, they just aren't shown. This is the one part of the app whose *existence* depends on the
device, so it cannot be exercised by resizing an iframe: `hover`/`pointer` come from the host, and
`window.matchMedia` has to be patched before `app.js` runs to reach it at all.

Both mappings are **derived from the chart grids, never listed in JS**: a grid row already knows
its consonant and a grid column already knows its vowel, so the drills cannot disagree with the
chart. Three things that fall out of that and are easy to get wrong by hand:

- **Dakuten rows are not their own keys.** が is the か key plus the ゛mark, so `BASE_KEY` folds
  `g z d b p` onto `k s t h h`. Skip this and が is unanswerable for `K`.
- **Romaji spelling cannot decide the key.** し is "shi" but the S key, ち "chi" and つ "tsu" are
  the T key, ふ "fu" is the H key. Only the grid row is authoritative. Vowels are the opposite
  case — the reading's last letter is always right, which is how yōon (きゃ→a) resolve, since
  ゃゅょ aren't in the grids.
- **Key prompts are the bare row letter** (`keyLabel()`, just an uppercase). The H key was briefly
  labelled "H/F" to flag ふ; that hands over the exact association the drill exists to build, so
  it is deliberately not signposted. Don't reintroduce it.
- **ん is deliberately excluded** from both drills: it has no vowel, and which key it sits on
  differs between keyboards, so drilling it would teach a guess. `kanaInfo()` returns null for it.

**The menu shows one script at a time.** The two seal-stamp buttons (`.hanko`, styled with the
chart sheet and reused by `.scriptbar`) filter `#decks` to that script's three decks and flip
`--accent` vermilion/indigo via `[data-script]` on `.menu`, mirroring the chart sheet. The chart
opens on whatever the menu is showing.

The same `.scriptbar` markup appears a third time on the progress screen, filtering the deck
picker rather than the deck list. It opens on the menu's script and then keeps its own selection,
since you may well be practising one script and reading about the other. The flick drills are the
one thing that survives both filters — they belong to neither script.

**Everything above `.stats__scroll` is pinned.** The script stamps, the device switch and the deck
picker are `flex:0 0 auto` siblings of the scroller, so they stay put while the report scrolls
under them. That is deliberately *not* `position:sticky` inside the scroller: sticky would need a
background matched to the page's radial gradient behind it, and a pinned sibling gets the same
result with nothing to mismatch.

**Persistence** is localStorage key `hkk.v1` (`STORE` in `app.js`), holding
`{rev, mode, script, deck, font, best, bestTime}`. All writes go through the `store` helper, which
merges patches — never `setItem` directly. **Do not rename the key to match the `kana` directory**:
it is the only handle on a returning user's saved bests, and changing it silently wipes every
record anyone has set. `rev` versions the *shape* inside the key, which is how shape changes ship
without renaming it. The session token lives in a *second* key, `hkk.token` — deliberately
outside the synced blob, since the blob is uploaded to the server and a token has no business
making that round trip.

**Records belong to a deck _and_ a mode**, keyed `deckId|mode` by `recordKey()` — reading kana,
picking from four, and writing kana from a sound are three different skills, and pooling them let
the easiest mode set a score the hardest could never beat. Every `store.best`/`setBest`/`bestTime`/
`setBestTime` call therefore takes a mode. Two consequences that are easy to miss:

- **`setMode()` has to rebuild the menu**, not just re-render the play screen. The deck rows show
  the selected mode's figures, so switching mode while on the menu changes every number in the
  list. The `<small>` under each figure names the mode for the same reason — an unlabelled
  percentage reads as *the* score for that deck.
- **`rev < 2` stores are migrated, not discarded.** Records keyed by bare deck id predate the
  split; `store.migrate()` moves them to whichever mode was last selected, that being the only
  evidence of which mode earned them. It runs once at boot and is idempotent.

**The menu is deliberately shallow.** Only three things sit on it: the script switch, the deck
list (which scrolls, and holds the flick drills), and one Options button. Answer mode, font, chart,
progress and account all live in `#moreSheet` behind that button — stacked on the menu they took
about a third of a phone screen away from the deck list, which is the thing you came to use. The
mode is the one setting that is otherwise invisible from the menu, so `setMode()` writes it into
the Options button's label. Anything opened from Options goes through `fromMore()`, which closes
it first: a second `showModal()` over an open dialog stacks them, and the backdrop-close handler
would then only ever see the top one.

**Layout model.** `body` → `.stage` (width-capped, and height-bounded from `dvh`) → one `.screen`
flex column per screen. `.play` is four bands: `.playbar` (fixed) / `.revealbar` (fixed, touch
only) / `.playmain` (flexes, holds the writing square) / `.dock` (fixed, holds feedback + answer
controls + stats).

**Reveal exists twice**, once in `.revealbar` above the square and once in `#typedTools` below the
answer, with exactly one shown: the dock is under the on-screen keyboard on a phone, and a single
node cannot be moved between the two by CSS because they are in different flex containers. Both
call `reveal()`. `#typedTools` is shared by `type` and `write` — only its hint text and class
change per mode, since the IME reminder must survive on touch where `.hint--keys` is suppressed.

**Font selection** writes a stack into the `--kana` CSS custom property, which every Japanese
glyph on screen uses. `--mincho` is kept separate for the Latin numerals (score, streak) so
switching kana faces never reshuffles the numbers.

## The backend

`backend/app/` — `db.py` (SQLite, no ORM), `auth.py`, `ratelimit.py`, `analytics.py`, `main.py`
(routes + static). Three pure dependencies; passwords are stdlib PBKDF2 rather than bcrypt so
`pip install` needs no compiler. Sessions are opaque tokens stored only as their SHA-256.

**Sign-in is throttled** (`ratelimit.py`), in-process and in-memory — one server, no Redis to
stand up, and counters that reset on restart, which is the right trade for a home network. Four
things about it are deliberate:

- **The check runs before the password is verified.** A throttled attempt costs ~7 ms instead of a
  600k-round PBKDF2, so the limit protects the CPU as much as the account. Move the check below
  the verify and that property is silently lost.
- **Only failures count, and a success clears the counter**, so signing in normally is never
  throttled however often you do it.
- **Per-IP is the real limit; per-username is deliberately much slacker.** A strict per-username
  limit lets anyone lock a user out of their own account by submitting rubbish for their name —
  trading a small attack for a more annoying one.
- **`exc.headers` must survive the custom exception handler**, or the `Retry-After` on a 429 is
  dropped and the client is told to wait without being told how long.

Signup is limited separately (it counts successes too — the cap is on how fast accounts can be
created at all). Behind a reverse proxy every request appears to come from the proxy, which
collapses per-IP into one global bucket; that needs uvicorn's `--proxy-headers` and
`--forwarded-allow-ips`, and never blind trust in `X-Forwarded-For`.

**There are no admin routes and no admin flag.** Every query is scoped to the authenticated user.
Keep it that way — a "just for debugging" cross-user read is the whole security model gone.

**The account outranks localStorage, it doesn't replace it.** The local copy stays as the offline
cache and the app still works signed out; the server holds the copy that follows you between
devices. `store.write()` mirrors up on an 800 ms debounce, and signing in pulls the server's blob
down — **through `applyStoredPrefs()`, never by writing localStorage alone.** `state.mode`,
`state.script` and the font were read at boot from the old copy, so every one has to go back
through its setter or the screen keeps showing the previous device's settings.

### What the analytics deliberately throw away

The rules exist because raw timings from a practice app are mostly noise. All of them are
enforced in `analytics.py`, and each one costs data on purpose:

- **Every deck is its own dataset.** `report()` takes a `deck_id` and nothing is ever summed
  across decks: katakana is not evidence about hiragana, and base gojūon is not evidence about
  dakuten or yōon. The three-run gate is **per deck**, so three hiragana runs do not unlock the
  dakuten report. There is no all-decks total, deliberately — it would be an average over
  unrelated material.
- **Flick drills are listed but never analysed** (`analysable: false` for any `flick-` deck).
  Their prompt is a direction or a key, not a character, and any character with that vowel or on
  that key is accepted — so there is nothing to call slow and a wrong answer can't be traced to a
  character. `enough` and `ready` are separate fields for exactly this: a flick deck can have
  plenty of runs and still never report.
- **Under `MIN_RUNS` (3) complete runs of that deck, no *aggregate* is reported** — no median, no
  "weakest character", not even a partial one, because a number on that screen reads as a finding.
  **`recent_runs` is exempt and always returned.** The distinction is fact versus inference: what
  you scored on a run you finished is a fact and is yours from the first one; calling a character
  weak or a time typical is an inference, and that is what needs several runs behind it.
- **Over `MAX_CARD_MS` (10 s) on one card, the time is discarded.** That is someone looking away,
  not someone thinking. The answer still counts towards *accuracy* — they did eventually answer —
  so the two are tracked separately by the `timed` column.
- **Reveals are never timed** either, for the same reason: nothing was recalled.
- **Drills are excluded from everything the API returns** — every figure, the run count, *and*
  `recent_runs`. A drill re-tests what the results screen just showed you seconds earlier, on a
  deliberately hard subset: its speed is fresh recall, its card mix is skewed, and "18/20, 0:31"
  sitting in the history beside a full 46-card run reads as a result when it isn't one. They are
  still stored in full — the rows exist, they are simply never selected — so the decision is one
  query away from being reversed.
- **Mobile and desktop are never pooled.** Typing romaji on a keyboard and flicking on glass are
  different physical acts. Every figure belongs to one bucket; the client sends `device` from the
  same `TOUCH` test the rest of the app uses.

**`slowest` and `fastest` are two ends of one ranking and can never overlap.** Each takes at most
half the tracked cards, so a deck with only a handful does not report the same character as both
your slowest and your fastest — which is what naive top-N slicing on each end produces.

Medians, not means, throughout — with a hard cap at one end and real hesitation at the other, one
slow card must not move the number. Confusions are cross-referenced through `kana.json` so a wrong
answer is reported as the character the user reached for ("つ → た"), and a pair needs to appear
twice before it is called a pattern rather than a slip.

## The icon

`icon.svg` is hiragana あ on the cream ground, inside the same genkō-yōshi square with the same
dashed guides the app draws characters in. Two things about it are load-bearing:

- **The glyph is an outlined `<path>`, not `<text>`.** An icon must render where no Japanese font
  is installed — which is most Windows machines. A `<text>` element would fall back to tofu or
  vanish. It was outlined from Noto Serif CJK JP with `fontTools`; regenerate the same way rather
  than reaching for `<text>`, and keep the file free of `@font-face` and external references.
- **SemiBold, not Regular.** A Mincho face at Regular weight breaks up into grey mush at 16 px.
  This was chosen by rendering at 16 px and looking, not by taste. The guides are deliberately low
  contrast so they read as texture when large and disappear when small instead of muddying the
  glyph.

`rel="apple-touch-icon"` points at the same SVG, which iOS does not support — it falls back to a
screenshot there. Generating PNG sizes would fix that if it ever matters.

## Invariants that are easy to break

These each cost a real bug once. Comments in the source mark most of them.

- **Reading→kana is many-to-one, and both directions have to respect it.** じ/ぢ are both `ji`,
  ず/づ are both `zu`. Choose-mode distractors therefore dedupe by *reading*, not by card, or two
  identical option buttons get rendered. Write mode hits the same collision from the other side:
  the prompt is only the reading, so the user cannot tell which of the pair is being asked and
  `writeAccepts()` must accept **any** card in the deck whose `a` matches — grading against
  `card().q` alone makes 4 of the 25 dakuten cards unanswerable.
- **Enter must not grade while an IME is composing.** That keypress belongs to the IME, which is
  confirming the kana being built; without the `e.isComposing || e.keyCode === 229` guard the
  first Enter of every `ka`→か submits a half-finished romaji string as the answer.
- **Kana arriving from an IME is normalised with NFKC before comparison** (`normKana`), so
  half-width ｱ and a decomposed dakuten both count as the character the user meant.
- **Never `disabled` the answer input after grading.** It blurs the field, which dismisses the
  on-screen keyboard between every card on a phone. Input is gated by `state.graded` instead.
- **The answer field is refocused on *every* card**, unconditionally, via `focusField()`. Guarding
  it with `document.activeElement === input` (i.e. "only refocus if focus is still here") looks
  tidier and means tapping the box again for every single character on a phone, because tapping
  the square to advance moves focus off the input. `preventScroll` matters: `.stage` is
  height-capped, so a focus that scrolls drags the dock out from under the keyboard.
- **Refocusing is not enough on its own — the keyboard visibly flickers.** The on-screen keyboard
  follows focus, so tapping the square, Check or Reveal closes it and the refocus on the next card
  reopens it. `keepKeyboard()` calls `preventDefault()` on `pointerdown` *and* `mousedown` for
  every control tappable mid-card, which stops them taking focus at all, so focus never leaves the
  field. Prevent the press, not the click: preventing the click would break the control. Any new
  mid-card control has to be added to that list or it reintroduces the flicker.
- **A blur that gets through means the user closed the keyboard themselves**, and `state.kbDismissed`
  makes `focusField()` respect that until they put the caret back in a field. `noteBlur()` ignores
  blurs while a sheet is open — that focus move is the app's doing, not theirs — and `start()`
  clears the flag so a fresh run always offers the keyboard.
- **Any new direct child of `.play` needs a `grid-area` in the landscape block, or hiding there.**
  That media query re-declares `.play` as a two-column grid with named areas; an unplaced child is
  auto-placed into a row of its own and shoves the square out of its cell. `.revealbar` is hidden
  there, which is also where it belongs — that layout has room for reveal in the dock.
- **Clear the auto-advance timeout whenever the card changes** (`state.timer`). A stale timer from
  card N will skip card N+1 the moment it is graded.
- **A portrait phone with the keyboard open reports `orientation: landscape`** — the layout
  viewport becomes wider than tall. Hence the `max-width`/`min-width` guards on the
  short-viewport and landscape media blocks; `orientation` alone is not a phone-vs-landscape test.
- **`.stage` needs `max-height`, not just `min-height`.** Without the cap, tall content grows the
  stage past the viewport and the *page* scrolls (dragging controls off-screen) instead of
  `.menu__scroll` / `.end__scroll` engaging.
- **`display` on a `<dialog>` belongs on `[open]` only.** An author `display:flex` on the dialog
  itself beats the UA's `dialog:not([open]){display:none}` — author rules always win over UA
  rules — leaving a dead, unclosable panel in the page.
- **Sibling `<span>`s sharing a grid cell need explicit `display:block`** or their text runs
  together (this bit `.deck__name`/`.deck__meta` and `.font__name`/`.font__note`).
- **The run is timed but the clock is never shown while practising** — deliberate, a visible
  ticking counter turns practice into a race. Total appears once, on the results screen.
- **Never select `.seg__btn` document-wide.** The answer-mode switch and the progress screen's
  device switch share the class. A global query wires `setMode(undefined)` onto the device buttons
  and blanks their `aria-checked` on every mode change. Go through `el.modeSwitch` /
  `el.deviceSwitch`.
- **`store.migrate()` is called from boot, not at the `store` literal.** It writes, a write reaches
  `schedulePush()`, and that touches the `api` const declared further down — running it early hits
  that binding's temporal dead zone and the whole IIFE throws.
- **Runs are posted whole, at the end.** A run abandoned halfway is not evidence of anything, and
  per-card posting would put a network call between every card.
- **Flick prompts are dealt out evenly, then shuffled** — never sampled at random. Over only 20
  prompts, random sampling can leave a whole direction out of the run, which is the one thing a
  drill whose entire purpose is covering all five directions must not do.
- **Best *time* is only recorded for a flawless (100%) run.** Timing every run lets a rushed or
  revealed-answer run set an unbeatable record. Reveals count as misses.
- **Never look a record up by deck alone.** `store.best(deckId)` without a mode silently returns
  `undefined`→`0`, which renders as "no attempts yet" rather than failing — a bug that reads as
  wiped records.
- **`kana.json` is fetched with `cache: "no-cache"`.** Without it the HTTP cache silently serves a
  stale deck file and edits appear to do nothing.

## Font availability detection

`app.js` decides which font options to offer by rendering kana to a canvas and hashing the
pixels. Both obvious alternatives are broken for this:

- `document.fonts.check('16px "Whatever"')` returns `true` for families that do not exist.
- Canvas *width* comparison cannot work — every CJK face is full-width, so all candidates measure
  identically (e.g. 432px for a 5-glyph string at 56px).

An option is dropped if none of its named families are installed, or if its stack renders
identically to the last-resort font or to an option already listed. So every visible option is
guaranteed to look different. If canvas is unavailable (privacy modes), all options are offered
unverified. Eight options ship (`mincho`, `textbook`, `gothic`, `rounded`, `ud`, `mono`,
`device-serif`, `device-sans`); how many survive is per-device. Note that Windows ships no
Japanese serif/textbook font unless the *Japanese Supplemental Fonts* optional feature is
installed, so `mincho`, `textbook` and `rounded` are commonly absent.

## Verifying changes

**No test suite is committed.** Nothing in the repo runs tests, and there is no test runner to
invoke. What follows is how to build one in a scratch directory — do that rather than assuming a
change is fine because it looks fine.

**Front end — jsdom.** `app.js` runs under it unmodified, which is enough to drive whole runs end
to end: script switching, all four modes, grading, records, the account flow, the progress screen.
Install jsdom in a scratch directory, never the project, and stub four things — `fetch` (return
`kana.json`, and *reject* `/api/*` unless you are deliberately testing the backend path),
`HTMLDialogElement.prototype.showModal`/`close` (jsdom implements neither), `matchMedia`, and
`confirm`. Canvas is absent, so font probing takes its documented privacy-mode path and offers
everything unverified. Two traps: **advance a graded card by clicking `#square`** rather than
waiting out the 620 ms auto-advance, or a suite with several full runs in it takes minutes; and
**`window.performance` has only a getter**, so it cannot be reassigned.

**Backend — a real server.** Start it on a random port and drive it with `urllib`; no HTTP client
dependency is needed. It must be a **fresh process per suite run**: the rate limiter is in-memory
by design, so a suite that trips it (any suite testing the throttle must run last) will fail the
login tests on a second pass against the same process.

**jsdom has no layout engine** — it proves logic, never geometry. Anything about size, overflow,
collision or whether a control is on screen still needs a real browser.

Two environment quirks worth knowing:

- **CSS animations do not advance while the preview pane is hidden** (no frames composited), so an
  entry animation stays frozen mid-transform and reads as a layout bug. Force the resting state
  with `document.getAnimations().forEach(a => a.finish())` before measuring. Awaiting
  `animation.finished` in that state hangs.
- **Sweep viewports with a sized `<iframe>`** rather than resizing the window repeatedly: `dvh`
  units and media queries resolve against the iframe box, so many device sizes can be checked in
  one pass. `hover`/`pointer` media features still come from the host device, so touch-only CSS
  cannot be emulated this way — patch `window.matchMedia` before `app.js` runs to exercise the
  touch *code* paths.

Worth asserting on, since geometry checks alone miss them: text collision between sibling spans,
page overflow (`scrollWidth`/`scrollHeight` vs viewport), whether a control is actually inside the
viewport, and layout shift of the square when an answer is graded.
