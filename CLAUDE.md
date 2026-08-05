# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`kana` — a Japanese kana (hiragana/katakana) recognition drill. Pure client-side: no backend, no
build step, no dependencies, no package manager, no test suite. Four files are the app:

| File | Role |
|---|---|
| `index.html` | markup only — four screens (`#menu`, `#play`, `#end`, `#fatal`) plus two `<dialog>` sheets (`#fontSheet`, `#chartSheet`); `#play` holds one answer block per mode (`#typeMode`, `#writeMode`, `#chooseMode`) |
| `styles.css` | the entire stylesheet, mobile-first |
| `kana.json` | **all content** — `fonts[]`, `charts[]`, `decks[]`. No kana or font names live in JS or CSS |
| `app.js` | all logic, one IIFE, sectioned by `/* ---------- name ---------- */` banners |

Those four plus `README.md` and this file are the entire repository. Three superseded standalone
pages — `hiragana-game.html`, `katakana-game.html` and `kana-chart.html`, near-identical
predecessors of the drill and the chart — were deleted; they are in git history at `3ece9c6` if
one is ever needed. Don't reintroduce a second copy of the game: they drifted out of sync with the
real app the moment they stopped being loaded.

The project directory used to be called `hkk`, and that name survives in exactly one place: the
localStorage key. See **Persistence** below — it is deliberate, not a leftover to tidy up.

## Running it

Must be served over HTTP. `fetch("kana.json")` is blocked on `file://`, so double-clicking
`index.html` shows the `#fatal` screen instead of the app.

```bash
python -m http.server 8000
```

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

**Three answer modes**, chosen on the menu and held in `state.mode`:

| mode | prompt | answer | graded by |
|---|---|---|---|
| `type` | kana | romaji, typed | `accepts()` — canonical `a` plus every `alt` |
| `choose` | kana | romaji, 1 of 4 | exact match on `a` |
| `write` | **romaji** | **kana, typed** | `writeAccepts()` — see the invariant below |

`write` exists to build familiarity with the Japanese keyboard, so it needs a real IME; the
`#kanaInput` field is separate from `#input` rather than an attribute swap, because changing
`inputmode`/`lang` on a live field does not reliably re-trigger the on-screen keyboard. `type` and
`write` are the same interaction reversed and share `submitTyped()` / `markWrong()` / the Enter
handler, routed through `typedField()`.

**The menu shows one script at a time.** The two seal-stamp buttons (`.hanko`, styled with the
chart sheet and reused by `.scriptbar`) filter `#decks` to that script's three decks and flip
`--accent` vermilion/indigo via `[data-script]` on `.menu`, mirroring the chart sheet. The chart
opens on whatever the menu is showing.

**Persistence** is one localStorage key, `hkk.v1` (`STORE` in `app.js`), holding
`{rev, mode, script, deck, font, best, bestTime}`. All writes go through the `store` helper, which
merges patches — never `setItem` directly. **Do not rename the key to match the `kana` directory**:
it is the only handle on a returning user's saved bests, and changing it silently wipes every
record anyone has set. `rev` versions the *shape* inside the key, which is how shape changes ship
without renaming it.

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

There is no test runner. Verification means driving the real DOM in the browser and asserting on
geometry and state — `read_page`, then `javascript_tool` to script a run and measure.

**When no browser is available**, `app.js` runs fine under jsdom, which is enough to drive an
entire run end to end (script switching, all three modes, grading, records) — install jsdom in a
scratch directory, not the project, and stub four things: `fetch` returning `kana.json`,
`HTMLDialogElement.prototype.showModal`/`close` (jsdom implements neither), and `matchMedia`.
Canvas is absent, so font probing takes its documented privacy-mode path and offers everything
unverified. **jsdom has no layout engine** — it proves logic, never geometry, so anything about
size, overflow or collision still needs a real browser.

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
