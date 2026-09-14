# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

> The front end is `frontend/` — `index.html`, `kana.json`, `css/`, `js/` and the fonts — and works on its own — no build step,
> no bundler, nothing to install, and nothing fetched from anyone else's server. The backend in
> `backend/` is **optional**: it adds accounts, server-side saves and the progress report, and if
> nothing answers `/api/health` the app hides all of that and runs exactly as it did before it
> existed. Don't make it a hard dependency.

`kana` — a Japanese kana (hiragana/katakana) recognition drill.

| File | Role |
|---|---|
| `frontend/index.html` | markup only — ten screens (`#menu`, `#auth`, `#stats`, `#play`, `#end`, `#fatal`, `#options` — shown as More — `#settings`, `#fontPicker`, `#chart`) and one dialog, `#quickDialog`; `#play` holds one answer block per kind of answer (`#typeMode`, `#writeMode`, `#numberMode`, `#chooseMode`) |
| `frontend/css/` | `core.css`, every rule and no colour, mobile-first; `light.css` and `dark.css`, one theme each and nothing but colour tokens |
| `frontend/kana.json` | **all content** — `fonts[]`, `charts[]`, `decks[]`, `derived[]`, `numbers{}`. No kana, font name or number reading lives in JS or CSS |
| `frontend/js/` | all front-end logic, seventeen classic scripts that `index.html` loads in order — see **Scripts** |
| `frontend/icon.svg` | the app icon, and the source the `.ico` is generated from — see **The icon** |
| `frontend/favicon.ico` | six sizes rasterised from `icon.svg`; what `<link rel="icon">` points at |
| `frontend/fonts/` | the five bundled Japanese faces, subset to kana, plus `LICENSES.txt` and the `subset.py` that regenerates them — see **Bundled fonts** |
| `start.sh` | install / update / run, executable in git (mode `100755`) |
| `backend/` | the optional FastAPI server |
| `NOTES.md` | hand-written study notes — numbers, time, months, weekdays, dates. Read by nobody; `kana.json` is still the only content the app loads |

That plus `README.md`, `NOTES.md` and this file is the whole repository. Three superseded standalone pages —
`hiragana-game.html`, `katakana-game.html` and `kana-chart.html`, near-identical predecessors of
the drill and the chart — were deleted; they are in git history at `3ece9c6` if one is ever
needed. Don't reintroduce a second copy of the game: they drifted out of sync with the real app
the moment they stopped being loaded.

**The front end and the backend are sibling folders, and the split is also a security boundary.**
`frontend/` is everything the browser loads — the four files, the icons and `fonts/` — and still
works on its own from any static host. `backend/` is the server and its database,
`backend/kana.db`, which `db.py` locates from the repo root and which nothing in `frontend/`
touches. `main.py` mounts `StaticFiles` on `frontend/` and **must never be pointed back at the repo
root**: until the split it was, and anyone on the network could fetch `/backend/kana.db` — every
password hash and session token — along with `/.git/` and the backend source. The front end refers
to its own files relatively (`kana.json`, `fonts/…`), so the move changed nothing inside it.

### Scripts

**The front-end logic is seventeen classic scripts in `js/`, not modules**, and `index.html` loads
them in this order: `base` → `fonts` → `state` → `screens` → `theme` → `chart` → `flick` →
`numbers` → `calendar` → `decks` → `menu` → `run` → `backend` → `progress` → `quick` → `wiring` →
`boot`.
They were one IIFE, `app.js`, cut at its section banners with not a line of logic changed. Classic
scripts share one global scope, which is what let the cut be mechanical: every function still sees
every other, as it did inside the IIFE. Modules would have meant an import and an export for most
of 224 top-level names that call each other in every direction. Three rules come with it:

- **Order is load-bearing, and only for what runs while a file loads.** A function may call
  anything, whichever file declares it, because by the time anything is *called* every file has
  loaded. What may not happen is a file *using* a later one's name at load time — a `const`
  initialiser that calls it, or a listener handed a function by name. Inside the IIFE, hoisting
  forgave that; across files it is a `ReferenceError` and the app never boots. That is why
  `wiring.js` sits after `backend.js` and `progress.js`, whose functions its listeners name, and
  why `boot.js` is last. The split was checked with a parser for exactly this before it shipped.
- **Every top-level name is now a global.** None of the 224 collides with anything on `window` —
  checked in Chromium, since a clash with a non-configurable property such as `top` or `location`
  would stop the script loading at all. A new top-level name has to clear the same bar.
- **Each file starts with `"use strict"`**, because the one at the top of the IIFE no longer
  covers them. No top-level code uses `this`, which is the one thing that would have changed
  meaning outside the function.

A new file goes into `index.html` at the point its load-time needs put it, and `subset.py` reads
every file in `js/`, so a kanji a new file renders is checked like any other.

The project directory used to be called `hkk`, and its three localStorage keys carried that prefix
long after. They are now `kana.*`, and `renameKeys()` in `app.js` moves anything still found under
the old names at boot. **Don't delete it** — it is the only thing standing between a returning user
and a silently wiped set of records, and it costs one pass over three keys on a load that finds
nothing. See **Persistence** below.

## Running it

Must be served over HTTP. `fetch("kana.json")` is blocked on `file://`, so double-clicking
`index.html` shows the `#fatal` screen instead of the app.

```bash
./start.sh              # venv, deps, git pull, uvicorn — the whole backend
python -m http.server 8000 --directory frontend   # front end only, no accounts
```

`start.sh` is idempotent: it only pulls when the tree is clean, only reinstalls when
`requirements.txt`'s hash changed, and FastAPI serves the static files itself, so there is one
origin and no CORS.

It binds **0.0.0.0** by default and prints the LAN address, because the flick drills only exist on
a touch device — testing them means opening the app on a phone, and a loopback-only bind makes
that impossible. The cost is that the whole network can reach it over plain HTTP; `--host
127.0.0.1` is the way back.

Kana glyphs no longer need a CJK-capable font on the host: five faces ship in `frontend/fonts/`. The
device's own faces are still used where it has them, and are still what renders anything outside
the subset — see **Bundled fonts**.

## Architecture

**`kana.json` is the single source of content and `app.js` is script-agnostic** — it renders
whatever deck it is handed. Adding or changing decks, cards, accepted romanisations, chart layout
or font options is a JSON edit, never a code edit. Keys prefixed `//` (`"//fonts"`, `"//charts"`,
`"//derived"`) are prose comments for the section that follows; JSON has no comment syntax and
`app.js` ignores them. Keep them current when the shape they describe changes.

- deck: `{id, label, script, sample, subtitle, note, cards[]}` — `script` is `"hiragana"`/`"katakana"`
- card: `{q, a, alt?}` — `q` is the kana, `a` the canonical romaji, `alt` extra accepted spellings
  (`si` for `shi`, `hu` for `fu`, `sya` for `sha`, `nn` for `n` …)
- font: `{id, label, ja, note, families[], generic}` — `families` are probed at boot; omit it for
  an option that is deliberately just the device's `generic` face
- chart: `{id, label, ja, sample, subtitle, sections[], seal?, note?}`, one entry per stamp that
  has one. A section is `{title, en, type, …}` where `type` is `"grid"` (consonant `rows` × vowel
  `cols`, `null` cells are grid gaps, optional `single` for the standalone ん/ン), `"flow"` (a
  wrapping `items` list) or `"numbers"` (`items` of `{n, x, q, a}` — what the row is, how it is
  written, the kana, the reading, with `wide` for one per row). `x` is optional and holds the
  kanji — 六, 二十日, 月曜日, the form the drill puts on the square — while `n` names the row in
  plain terms: `6`, `Monday`, `the 20th`. `seal`/`note` are the footer, and default to the 五十音 stamp and the
  gojūon line the two kana charts want.
  **Charts carry layout, not readings** — a cell is just a kana string and its romaji is looked up
  from the decks, so the chart and the quiz can never disagree. The exception is a flow item
  written `{q, a}`, used for the extended katakana (ファ ティ ヴァ …), which are reference-only and
  in no deck.
- derived: `{id, label, script, sample, subtitle, note, sources[]}` — a deck with **no `cards`**,
  built at boot from the decks `sources` names. `script` places it under a stamp exactly as a real
  deck's does. See **Derived decks** below.
- numbers: `{ones[], places[], groups[], operators[], percent{}, drills[]}` — the parts a number is *composed* from, not a
  list of them. Each part carries `j` (its kanji), `r` (romaji) and `k` (kana). See **Numbers**.
- calendar: `{weekdays[], counters[], drills[]}` — the seven days listed, and the five counters
  months, dates, hours, minutes and seconds are composed with. See **The calendar and the clock** below.

**Colour** is washi paper throughout — cream ground, ink text, vermilion seal accent — defined
once in `:root` (`--paper*`, `--c-ink*`, `--shu`, `--brass`, `--matcha`). The accents are
deliberately darker than a dark theme's would be: the same red/gold/green at "glowing on indigo"
lightness fails contrast on cream. Nothing re-themes wholesale — the chart and the menu only
re-point `--accent`, flipping shu-red/indigo-blue via `[data-script]`.

**A theme is one file of custom properties and nothing else.** `css/light.css` is `:root`,
`css/dark.css` is `:root[data-theme="dark"]`, and `css/core.css` holds every rule and not one
colour. A new theme is a copy of `light.css` with the values changed and the selector renamed to
`:root[data-theme="<name>"]`; *offering* it is still a small `app.js` change — a button in the Theme
switch and an entry in `THEME_COLOR` — since `auto` only ever resolves to light or dark. Every token
`light.css` declares has to be declared again, because `core.css` falls back on none of them.
`--accent`, `--accent-dark` and `--focus-glow` live in `core.css`: they only point at `--shu`, so a
theme gets them for nothing. The dark theme re-declares the palette rather than inverting it — the same paper at night, sumi ground
and warm off-white ink, with every accent opened up in lightness because the sentence above cuts
both ways. Three rules follow from that and are what keep a theme to one file:

- **No literal colour may appear in `core.css`.** A literal can only be right in one
  theme. That includes the translucent ones, which is what `--press`, `--on-fill`,
  `--paper-lift`, `--square-bg` and the `--shadow-*` values exist for. (`--backdrop` and
  `--shadow-sheet` went with the old dialog sheets — and `--backdrop` came back, in both theme files, for the quick
  options dialog.) Shu-derived washes use
  `color-mix(in srgb, var(--shu) N%, transparent)` instead and need no dark twin at all.
- **`--accent-dark` is the accent's *label* colour, not "the dark theme's accent"** — `--shu-3` in
  light, a lighter tint in dark. Same for `--ai-2`, its katakana counterpart. The three
  `[data-script="katakana"]` blocks point at the variable, never at a hex.
- **`auto` is resolved in JS, never in CSS.** `data-theme` on `<html>` is only ever `light` or
  `dark`, so no rule in the stylesheet tests `prefers-color-scheme` and there is one code path to
  reason about instead of two overlapping ones.

`--c-ink-mute`'s floor is 4.5:1 against **`--paper-card`**, not against the page ground: labels and
hints sit on cards more often than not, and the card is the lighter surface. A value that clears
the ground and fails the card is the trap here, and it is where the first pass landed.

**`--page-bg`'s glow is matched by proportion, not by step**, and the two themes therefore look
nothing alike in the source: light lifts twelve points off its ground, dark three. Equal RGB steps
are not equal gradients — +12 on cream's 239 is a 4% lift the eye barely registers, while +12 on
sumi's 27 is +58% luminance and reads as a spotlight pointed at the top of the page. Both now fall
off ~3.8%. Keep the dark step neutral as well as small; a warm one reads as a glow rather than as
paper catching light, which is what made the first version obvious.

Six decks: base / dakuten / combination × hiragana / katakana (46 / 25 / 36 cards each, 214
total). Obsolete kana (ゐ ゑ ヰ ヱ, the archaic yi/ye/wu forms, polysyllabics) are excluded on
purpose — do not "complete" the charts by adding them back.

**A seventh card deck, `time-kanji`, lives under the 日時 stamp** — 時 分 秒 半 午前 午後, each
asked on its own as a kana card is, reading as `a` and the other spellings (`pun` for 分, `byou`
for 秒) as `alt`. It is a plain deck because it *is* a plain deck: a fixed list of characters with
one reading each, so the kana path — type, choose, write — fits it exactly and it needs no code.
`script: "calendar"` is all that places it, since every filter compares `script`. Three things
follow from it sitting in `state.decks`, all harmless and worth knowing: `chartReadings()` and
`buildFlickIndex()` both see its six cards, and neither looks them up, because no chart cell and
no grid holds a kanji; the derived decks name their sources, so Mixed kana is still exactly 214;
and its id carries no `cal-` prefix, so `rev 4`'s migration — which matches on that prefix —
cannot touch its records.

**Six more decks are derived from those six**, and none of them is a new list of cards.
`kana.json`'s `derived[]` carries each one's identity and the `sources` it is built from;
`buildDerivedDecks()` fills in the cards at boot and holds **the same card objects**, not copies.
That identity is load-bearing twice — `state.missed.includes(c)` and the chart-order review on the
results screen are both `===` comparisons — and its cost is the rule that nothing walking every
card in the app may ever be handed one of them, or characters are counted two and three times
over. `state.decks` therefore stays the six decks `kana.json` lists, `state.derived` is kept beside
it, and `allDecks()` is what the four places meaning "every deck the menu can start" use. Building
them *after* `buildFlickIndex()` in boot is part of the same rule.

| Derived deck | Stamp | Sources | Cards |
|---|---|---|---|
| Mixed hiragana | あ | the three hiragana decks | 107 |
| Mixed katakana | ア | the three katakana decks | 107 |
| Kana | かな | both base decks | 92 |
| Dakuten kana | かな | both dakuten decks | 50 |
| Combination kana | かな | both yōon decks | 72 |
| Mixed kana | かな | all six | 214 |

**There are five seal stamps, and only two of them are scripts anyone writes in.** `kana` is where
the decks spanning both scripts live; `number` is the counting drills and `calendar` — the 日時
stamp, labelled **Time** — the weekdays, months, dates and the clock, neither of which is kana at
all. The stamp is `calendar` everywhere in the code, in `SCRIPTS`, in the `cal-` deck ids and in
the `script` column of every run already posted, and it covers the clock as well because *when*
is one subject and because a sixth stamp has nowhere to put its label. Only what the user reads
says Time. Giving each a `script` value like any other is
what keeps `buildMenu()` and `forScript()` to a single comparison each. An earlier version had the everything-deck carry no script and be shown
under "either" stamp; that listed it twice and meant every filter had a second clause, and the
number drills sat in a section below the list with their own build step and their own visibility
flag — which was the same mistake a second time. `SCRIPTS` in `app.js` is the list, and it has to
match the `data-script` values in the two `.scriptbar`s in `index.html`. **Five labels is what the
bar can hold**; a sixth would have to come with somewhere else for the labels to go.

`allDecks()` is `state.decks + state.derived + NUMBER_DECKS + CALENDAR_DECKS`, and the drills are
safe in it for precisely the reason the rule about derived decks exists: **they have no `cards` at
all**, and nothing that counts characters uses `allDecks()`. The flick drills stay out of it — they carry no
script, and a direction belongs to none.

Three things follow:

- **A deck is found where it was started.** One stamp, one deck id, one report — no deck appears
  under two stamps. The flick drills still do, because they are not decks at all and `allDecks()`
  never finds them.
- **Records and runs key off the deck id as always.** `mixed` still means all 214, so a record set
  before the かな stamp existed still reads. Runs post their deck's own `script`, which is now
  sometimes the string `"kana"`; the backend column takes any string.
- **Writing names the script only where it is ambiguous.** か and カ are both "ka", so a deck
  spanning both scripts has to say which it wants. `spansScripts` is computed from the sources, not
  declared, so Mixed hiragana — three source decks, one script — says nothing extra. `writeAsk()`
  and `writeAccepts()` are scoped together; see the invariants.

**The deal is balanced, not shuffled**, and that is why these can't be replaced by concatenating
their sources and calling `shuffle()`. Each source deck is a *category*; each is shuffled on its
own, and `mixedQueue()` then deals from them under one rule — never more than `MIX_RUN` (2)
consecutive cards from the same category. Every character still appears exactly once per run; this
decides order alone, and nothing is sampled or dropped. Three parts of it are easy to get wrong:

- **Which category to take from is drawn at random, weighted by what it has left** — not
  round-robin, which turns the run into a visible rotation, and not "largest pile first", which is
  the same rotation with extra steps.
- **`mixFits()` is checked before every take, not repaired afterwards.** Weighted choice empties
  the piles at roughly the same rate but not exactly, so whichever pile is left over at the end has
  nothing to alternate with and the last dozen cards all come from it. The arithmetic: *m* cards of
  one category need the other *r* as separators, which open *r+1* gaps of at most `MIX_RUN` each,
  so *m* ≤ `MIX_RUN` × (*r*+1), less whatever a run already under way has eaten from the first gap.
- **The no-candidates fallback deals the biggest pile anyway.** It is unreachable for the deck
  sizes that ship — the tightest is Kana, 46 against 46, needing only 46 ≤ 2×47 — and exists for a
  `kana.json` grown so lopsided that no ordering can space it out. Bunching up is the right failure
  there; dropping cards would break "every character exactly once", which is the invariant that
  actually matters.

Drills of a derived deck take the plain shuffle instead. Balancing a handful of cards says nothing,
and five misses that all came from one category have nothing to interleave with. A derived deck
with fewer than two surviving sources is dropped at boot rather than offered as a run of one
category, which is also what stops `mixFits()` being asked a meaningless question.

**Three answer modes**, chosen in Settings and held in `state.mode`:

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

## Numbers

**`num-50` and `num-random` are the app's second subject, and the first content that is generated
rather than enumerated.** 1 to 1,000,000 is not a card list, so `kana.json` carries the *parts* —
the nine digits, the places 千 百 十, the group 万 — and `readNumber()` composes a reading out of
them while `kanjiNumber()` composes the written form. No number's sound and no number's spelling
is written in `app.js`, for exactly the reason no kana reading is.

**The two composers are deliberately not one.** A place's `forms` change how it *sounds* — 三百 is
`sanbyaku` — and never how it is written, so `kanjiNumber()` walks `j` alone and cannot be dragged
off by a sound change. What they do share is the 一: a place drops a leading one (十, never 一十)
and a group keeps it (一万), which is the same split that makes `places` and `groups` two lists.

**They answer to the three answer modes like a deck does, and the mode is what decides which way
round a prompt goes.** `state.numbers` holds `"count"`/`"random"` while one is running, but it
never touches `activeMode()` — a number record is keyed `num-10|type` exactly as a deck's is.

| mode | prompt | answer | field |
|---|---|---|---|
| `type` | 六 or `roku` — see below | the digits | `#numInput`, a numeric keypad |
| `choose` | 六 or `roku` | the digits, 1 of 4 | `#choices` |
| `write` | the digits — `6` | the kana — ろく | `#kanaInput`, the IME |

**Which mirrors the decks exactly**: type and choose share a direction and differ only in how the
answer arrives, and write is the reverse of both and the one that needs an IME. The unifying rule
across all three subjects is *type = a plain keyboard, write = a Japanese IME, choose = a pick* —
and it is the reason numbers and dates can be decks rather than extra modes.

**Which script the two reading modes ask in is a setting** — `state.prompt`, `PROMPTS`, the
`Numbers & dates ask with` switch in Settings — because 六 → 6 and `roku` → 6 are both worth
practising and neither is a substitute for the other. Reading the kanji is what you need on a price
tag; hearing the reading and knowing the value is what you need at a till. Three things about it:

- **It is a setting and not a fourth mode.** The mode means *how does the answer arrive* — plain
  keyboard, IME, pick — and it must not also come to mean *which script is the question in*. Those
  are two independent questions and the app asks them separately.
- **Writing ignores it**, because that direction asks with the identity — 6, 20日, Monday — and
  answers in kana. There is no reading for it to ask with.
- **It belongs to `store`, so an account carries it**, unlike the theme and Fast. Which script you
  want to be asked in is a fact about what you are learning, not about the screen in front of you.
  `applyStoredPrefs()` therefore runs it through `setPrompt()` on sign-in like every other synced
  preference, and boot calls `setPrompt()` **before** `setMode()` — `buildMenu()` reads it.

**An earlier version dealt the direction per card and ignored the mode.** Typing then showed a
number half the time and a reading the other half, and the answer box changed under you mid-run.
Don't go back to it: "which way round am I being asked" is a property of the mode, and a mode the
user chose is the one place that answer belongs. Two things fell out of the fix, both worth
keeping — `numberCard()` carries no direction at all, so switching mode mid-run flips every
remaining prompt instead of leaving a half-dealt run inconsistent; and `pairedQueue`, which existed
to space a value's two askings apart, went with it.

**They are a stamp, though, where the flick drills are a section.** A number drill is a deck-shaped
thing — a fixed identity, a record, a report, an answer mode — that simply is not kana, so it
carries `script: "number"` and every existing filter finds it. A flick drill is not a deck at all,
belongs to no script and ignores the mode, which is why it still needs a section of its own. Number
drills are also **not touch-only**: counting is the same skill on either keyboard.

**Writing takes either script here, and `alt` is graded rather than shown.** `numKanaAccepts()`
walks the parts against `k` + `altk`, `numRomajiAccepts()` against `r` + `alt`, and Writing accepts
whichever matches — 2 is に or `ni`, 4 is よん, し, よ, `yon`, `shi` or `yo`. The same rule governs
both: only a bare trailing digit carries alternates, because 四十 is よんじゅう and never しじゅう.
That falls out of `readGroup()` building compounds from `k` and `r` alone and needs no rule of its
own.

**The romaji path exists exactly where romaji is not the prompt, and nowhere else.** A deck asks
Writing with the reading — か is asked as "ka" — so accepting romaji there would be typing the
question back; `writeAccepts()` stays kana-only and must. A generated drill asks with the identity
instead — 6, 20日, Monday — so "roku" is a real answer to it. Without that, Writing is simply
unanswerable on a machine with no Japanese input installed, which is a fact about the machine and
not about the person practising. The hint under the field says which: *Kana or romaji* for a
generated drill, *Japanese keyboard* for a deck.

**Choosing generates its distractors** (`numNeighbours()`) — the same value with one digit changed
or two adjacent digits swapped. Four numbers drawn at random would give the answer away by length
alone: 六 beside 6, 400 and 12,000 is not a question about the reading. The top of the range is
the case that breaks it — every digit of 1,000,000 that can be changed leaves the range, and its
swaps are all zeros — so a value with fewer than three neighbours tops up from its own
`NUM_BANDS` band, which is still a wrong answer of the right size.

**The digits answer has a field of its own** (`#numInput`), and this is not tidiness. A keypad and
a Japanese IME are two different on-screen keyboards, and changing `inputmode` on a live field does
not reliably re-trigger it — the same reason `#kanaInput` is not `#input` with an attribute swap.
`typedField()` is the single place that decides, and it asks `numericAnswer()`: *is this card
answered with a number?* Not *which drill is running* — a month and a date answer with theirs too,
and a weekday, alone among the generated prompts, does not.

### Composing a reading

`readNumber()` returns **chunks**, each a list of parts, and the distinction is load-bearing twice:

- **A group takes its whole multiplier with it.** 999,999 is 九十九万 九千九百九十九 —
  `kyūjūkyūman kyūsen kyūhyaku kyūjū kyū`, not "ninety, nine, ten-thousand". Everything
  below the last group is one chunk per place.
- **Chunks are for the display; grading walks the parts flat.** A chunk is written as one word and
  chunks are spaced apart, so the chart shows `ichiman nisen sanbyaku yonjū go` — 一万 二千 三百
  四十 五 at a glance. Real romaji runs it together, which hides the one thing the chart teaches.
  Nothing is graded on the spacing, because nothing is graded on the romaji at all. **The calendar
  joins the same parts with no spaces**, because a date is one spoken word — `nijūyokka`, never
  "nijū yokka" — and the counter is what welds it into one.

Four rules in `kana.json` that are easy to get wrong by hand:

- **`places` drop a leading 一 and `groups` keep it.** 10 is `jū`, never `ichijū`; 10,000 is
  `ichiman`, never `man`. That difference is the entire reason they are two lists rather than one
  with a flag — and it holds for the kanji too, 十 against 一万, which is why `kanjiNumber()` can
  reuse the same pair of loops.
- **Readings are spelt with macrons** — `jū`, `kyū`, `yōka` — which is only possible because
  nothing grades them. ō and ū are the only two, and `subset.py` carries `U+014D,U+016B` for them.
- **The sound changes are not optional and are not derivable.** 300 is `sanbyaku`, 600 `roppyaku`,
  800 `happyaku`, 3,000 `sanzen`, 8,000 `hassen`. They live in each place's `forms`, keyed by the
  leading digit, and a place with none carries `"forms": {}`.
- **A digit's `alt` is deliberately not carried into a compound.** 四 alone is `yon`, `shi` or
  `yo`, but 四十 is only `yonjū` and 四百 only `yonhyaku`. Propagating `alt` would have the drill
  agree with `shihyaku`, which is not how anyone counts. Only the trailing bare digit takes them,
  which is what makes 17 `jūnana` *or* `jūshichi` — and what forces every date ending in 4, 7 or 9
  to be written out by hand; see **The calendar and the clock**.
- **Reaching 億 or 兆 is one more `groups` entry plus a wider band in `NUM_BANDS`.** Nothing else
  changes; `readNumber()` already loops the groups biggest-first.

### Grading

**`numKanaAccepts()` walks the answer against the parts instead of expanding them.** 7 is なな or
しち and 9 きゅう or く, so a seven-part reading has a few hundred spellings between them; matching
left to right with a backtrack costs a handful of string compares, and a wrong prefix prunes the
rest. Spellings are normalised once and cached on the part object, which `kana.json` shares across
every card that uses it.

**`normRomaji` folds the spellings nobody agrees on**, in this order: case, spaces and the
apostrophe in kin'yōbi; macrons off, ō → o and ū → u; the y-form `jyu` → `ju`; then every way a
long vowel gets written down, so `jū`, `juu`, `jyuu` and `ju` are one string and so are `yōka`,
`youka` and `yooka`.

**Vowel length is therefore not graded on the romaji path**, and that is the price of the path
existing rather than a bug to fix later. A fold that makes those four spellings one answer cannot
also tell a long vowel from a short one; demanding the macron instead would be asking someone on a
plain keyboard to guess a romanisation convention. **The kana path grades length exactly** — じゅう
is じゅう — which is the strongest argument for using the IME where there is one, and it is why the
romaji in `kana.json` is still spelt properly with macrons rather than however the grader could
cope with.

**`normDigits` NFKC-folds first**, so an IME's full-width ７ counts, and then drops everything that
is not a digit — which is what lets `1,000,000` and `1000000` both be the answer, and why the
prompt can be written with separators at all.

### The two drills

`num-50` is 1–50, every value once, and is a fixed set of prompts like a deck. `num-random` deals
20, and **deals them across magnitude bands rather than sampling the range** (`NUM_BANDS`). Uniform
sampling of 1..1,000,000 is not what "random numbers" should mean here: nine tenths of that range
is six digits long, so a run would be twenty variations on one problem and never once ask for 8 or
40. Same argument as flick prompts being dealt rather than sampled.

That difference is also why **`num-random` is the one deck the backend refuses to analyse**
(`UNANALYSABLE` in `analytics.py`) while `num-50` is analysed like any other. Twenty values drawn
from a million are never seen twice, so "slowest to recall" over them is a list of things you will
not be asked again. `num-50` is the opposite case: fifty fixed prompts, and which of them you are
slow on is exactly what the report is for.

**`logAnswer()` files a number under `card.key`, not `card.q`.** A number asked both ways is one
thing you either know or don't, so both directions pool under the value itself — the report should
say "you are slow on 8", not rank "8" against "hachi". `key` is the general escape hatch for a card
whose prompt is not what it is about — the calendar files under the identity, and the arithmetic
drill files a sum under its operator.

### Arithmetic

**`num-math` reads a sum aloud and asks for the result.** Plus, minus, times, divide and percent,
dealt four of each across twenty prompts — dealt rather than sampled, for the flick drills' reason.
A sum is two numbers composed exactly as `readNumber()` already composes them, with the operator
said between: 三たす四 is `san tasu yon`. Nothing new is spelt in `app.js`; the words, signs and
ranges are `operators` and `percent` in `kana.json`.

| mode | prompt | answer | field |
|---|---|---|---|
| `type` | 三たす四 or `san tasu yon` | 7 | `#numInput` |
| `choose` | the same | 7, 1 of 4 | `#choices` |
| `write` | `3 + 4` | さんたすよん (or romaji) | `#kanaInput` |

Five things about it are deliberate:

- **The answer is the result, not the expression.** It keeps the mode rule whole — the reading
  modes answer on the keypad, Writing is shown signs and answers with how they are said — and it
  makes the operator the thing tested: 八わる二 answered with 16 is a word misread, not a slip.
  Writing still answers with the reading alone; the result is never part of it.
- **An operator is a part like a digit.** It is a `kana.json` object with `k`/`r` and alternates,
  put in the chunk list between the operands, so `numKanaAccepts()` walks it unchanged and プラス
  is accepted for たす and マイナス for ひく with no code. Operands keep their own rules, so し for a
  bare trailing 4 is accepted here as it is everywhere.
- **Percent is said after its number and joined with の** — 二百の二十五パーセント, 25% of 200 —
  and 十 before パ closes up to じゅっ (or じっ). That is a whole-reading change, so it lives in
  `percent.irregular` exactly as a calendar counter's does, and the invariant is the same: every
  value the drill can ask whose reading changes, or that ends in 4, 7 or 9, is listed. Writing asks
  in English order, "25% of 200", and grades the Japanese order; that reversal is the lesson.
- **The operators are written in kana**, 三たす四 and not 三足す四. That is how arithmetic read
  aloud appears in teaching material, and it keeps the square inside the bundled subsets without
  four more kanji. The signs × ÷ − are in `subset.py`'s `RANGES` for the Writing prompt and chart.
- **A card files under its operator** (`key: "plus"`), so the drill is analysable where
  `num-random` is not: twenty sums never recur, but five words come round every run, and "you are
  slow on わる" is a real finding. Which pairs are allowed — a minus that stays positive, a divide
  that comes out whole — is arithmetic and is in `mathOperands()`; the ranges are content.

The chart's three new sections — the words, 十 before パーセント, and sums read aloud — were
generated from `kana.json` and asserted against a hand-written table, like every other row of it.

### Two smaller decisions

- **The prompt sizes itself.** `6` and 九十九万九千九百九十九 arrive in the same slot, which
  nothing else in the app has to cope with. `.square` is a container, so `app.js` picks a `--fit`
  multiplier and `.glyph.is-number` does the arithmetic in `cqw`. Buckets (`NUM_FIT`) rather than a
  formula: there are a handful of sizes that matter and a bucket can be looked at. The CSS fallback
  is the shortest bucket, so a missing property under-fills rather than overflowing.
  **The bucket is chosen on columns, not characters** (`fitWidth()`). Now that the prompt comes in
  both scripts that distinction is the whole game: `1,000,000` is nine narrow glyphs where
  一万二千三百四十五 is nine full-width ones and wants twice the room. Everything from CJK
  punctuation up counts two; Latin, digits and ō count one.
  **Columns are not the whole story either**, which is why seven has a bucket to itself. A column
  of Latin is wider against the font size than half a full-width glyph is, and — the part that
  actually matters — a Latin prompt is one *word*: 一万二千三百四十五 wrapping onto two lines is
  fine, `Tuesda / y` is not. So where the two scripts share a bucket, the Latin case sets the size.
  This is invisible to jsdom and invisible to a bounding box, since the glyph is a block that fills
  the square whether the text inside it wrapped or not — measure the line boxes with a Range, and
  measure each *word* with one too: what must not happen is a word broken across lines, and a
  prompt with a space in it — every clock reading is two words — is allowed to wrap between them.
  **The 12/13 boundary was measured, not chosen**, and was wrong until the clock made it visible:
  at 13cqw a thirteenth column is past the square's inner width, so `sanjūichinichi` and two other
  date readings had been breaking mid-word for as long as they had existed.
- **The deck samples use only characters the bundled subsets carry.** 十 for `num-10`, 五十 for
  `num-50`, 万 for `num-random`. That last one used to be まん in kana, because 万 was not in
  `subset.py`'s `KANJI` and the stamp would have been tofu on any machine with no Japanese font
  installed; it is in the list now, since a number is written in kanji on the square. Any new
  interface glyph faces the same choice, and the answer is to add it to `KANJI` and regenerate the
  eight files — never to ship a character no bundled face carries. See **Bundled fonts**.

**The menu shows one stamp at a time.** The five seal-stamp buttons (`.hanko`, styled with the
chart and reused by `.scriptbar`) filter `#decks` to that stamp's decks and flip `--accent`
via `[data-script]` on `.menu` — vermilion for hiragana, indigo for katakana, `--murasaki` for
かな, which is the two mixed and lands between them on contrast rather than reading as a louder
third colour, `--nando` for 十 and `--kuri` for 日時.

**`--nando` and `--kuri` are deliberately outside that family, and deliberately not `--matcha` or
`--brass`.** Numbers and dates are different subjects rather than further scripts, so a colour that
reads as another point on the shu→murasaki→ai line would be saying the wrong thing. The two
greens/golds already in the palette were the obvious reach and are both taken: `--matcha` means
*correct* everywhere in a run and `--brass` means *your record*, and a stamp is neither. `--nando`
is a teal; `--kuri` had no hue left to take — six accents had the circle covered — so it is the
unsaturated one instead, bark against dyes, which happens to suit the only stamp that is about time
rather than about writing. Both label colours land near 8:1 on `--paper-card` in either theme,
inside the band the other three sit in.

The chart opens on whatever the menu is showing, except under かな, where there is no combined
chart and `renderChart()` falls back to the first one. **Every other stamp opens its own chart or
none**: falling back under 十 or 日時 would hand over a kana table in answer to a question about
counting or about dates, so if `kana.json` ever loses one of those charts the button is hidden
instead. `chartApplies()` is the single test — `state.script === "kana" || charts.some(id ===
state.script)` — and it also carries the "are there any charts at all" case, so the two can never
disagree.

### The two generated charts

**The numbers and calendar charts carry their own readings, and are the only ones that could not do
otherwise** — every other cell's romaji is looked up from the decks, and there is no deck of
numbers or of dates to look one up from. That loses the guarantee the lookup exists for, so it is
bought back a different way: **every derivable entry in the two shipped charts was generated by
`readNumber()` and `kanjiNumber()` rather than typed** — 46 rows and 94 — and the generator asserts
each one against a table of the readings written out independently before it emits anything. Edit
an entry by hand and the charts become the only things in the app that can lie about a reading;
regenerate them instead.

The four parts are `{n, x, q, a}` — what the row is, how it is written, the kana, the reading —
because a row has four facts and `.nrow` has three slots. `n` and `x` share the leading cell, the
kanji leading in `--accent-dark` with the identity quiet underneath, and the kana and romaji stack
beside them. Every row is its own grid, so the leading cell carries a `min-width` just past the
longest identity either chart has ("Wednesday", 71px) — without it nothing lines up down the page
and 水曜日 sits a dozen pixels right of 月曜日. `wide` drops a section to one item per row, which
the worked examples need: 12,345 is nine kanji and eighteen kana and does not sit beside another.

Six sections, and the order is the argument: the ten digits, the three second readings, how 十
behaves either side of a digit, the places, the five sound changes, then whole numbers coming
apart. **"Second readings" is the section that is not a composition** — し・よ, しち, く are
alternates, not what `readNumber()` returns — so the suite checks them the other way round, by
asserting the grader accepts each one for that value.

Nothing in it can reach `buildFlickIndex()`, which reads `type: "grid"` sections only.

The かな stamp's glyph is two characters, あア, where the other three are one. `.hanko__glyph` is sized
through a `--stamp` custom property rather than `font-size` directly, so `.hanko__glyph--pair` can
scale with it at every breakpoint instead of needing an override beside each one.

The same `.scriptbar` markup appears a third time on the progress screen, filtering the deck picker
rather than the deck list. The flick drills are the one thing that survives every filter — they
are not decks, so `allDecks()` never finds them, and a direction belongs to no script. The number
drills used to do the same and no longer do: they are in `allDecks()` now, so their reports are
found under 十 and nowhere else, which is the point of a stamp.

**Four stamps share the width three used to**, so the label is what runs out of room first —
"Katakana" and "Numbers" are the long ones, and "Time" is the shortest — part of why the clock
went under a stamp that already existed rather than taking a sixth. The bar closes its gap a
little and the labels are held to one line, with a narrow-phone block that drops the
letter-spacing before the size.

**That connection is one-way, and deliberately so.** `openStats()` copies `state.script` into
`statsScript` on **every** open, not just the first: practising katakana and then finding the
report on hiragana is never what was meant. Nothing goes back the other way — flipping the stamp
inside progress is a question about your history ("how am I doing on the other script"), not a
decision to go and practise it, so it must not retarget the menu you are about to return to.
`setStatsScript()` therefore writes only `statsScript` and never `state.script` or the store, and
`openStats()` is the single point where the two touch. The device switch calls `loadStats()`
rather than `openStats()` for the same reason — re-fetching must not reset the chosen script.

**Only the script stamps are sticky.** The whole progress screen scrolls inside `#statsScroll`, in
the order device → stamps → deck picker → report. The device switch is the coarsest split and you
set it once, so it scrolls away; the stamps are what you actually flip between, so they stick to
the top of the scroller.

A sticky element has page showing through behind it, and the page ground is a *gradient* with
`background-attachment: fixed` — so a solid `--paper` bar would sit a shade off wherever the
gradient hasn't faded out. `.stats .scriptbar` instead repaints `--page-bg` with the same fixed
attachment, which resolves against the viewport and therefore lines up exactly. `--page-bg` exists
in `:root` for that reason and is used by `body` too; keep them one declaration, or they drift.

**The deck is named exactly once, wherever that lands.** Three things could name it — the seal
stamp, the selected picker chip, and the `.sdeck` heading — so each is suppressed when an earlier
one already did the job:

- the picker is dropped when it would hold **one** chip, because a single option isn't a choice;
- the heading is dropped when there **is** a picker (the checked chip names it) **or** when the
  deck label is just the script (`Hiragana` under the あ stamp says nothing new).

What survives is the one case neither covers: a lone non-base deck, where the picker is gone and
the stamp would give the *wrong* name — `Dakuten hiragana`, `Mixed hiragana` and `Flick
directions` all sit under the あ stamp. Don't simplify this to "never show the heading"; that case loses the
deck's identity entirely.

**Persistence** is localStorage key `kana.v1` (`STORE` in `app.js`), holding
`{rev, mode, prompt, dates, clock, script, deck, font, best, bestTime}`. All writes go through the `store` helper, which
merges patches — never `setItem` directly. **Renaming that key wipes every record anyone has set**,
because it is the only handle on a returning user's saved bests — the `hkk.v1` → `kana.v1` rename
was only safe because `renameKeys()` moves the old value across first, and any future rename needs
the same treatment. `rev` versions the *shape* inside the key, which is how a shape change ships
without touching the name at all; reach for that first.

Two things are kept in keys of their own, both deliberately outside the synced blob:

- **`kana.token`**, the session token — the blob is uploaded to the server, and a token has no
  business making that round trip.
- **`kana.theme`**, `auto`/`light`/`dark` — see the theme rules below. It is read and written
  directly, never through `store`, which is precisely what stops it syncing.
- **`kana.perf`**, `on`/`off` — performance mode, kept out for the theme's reason exactly: whether
  animation costs this device anything is a fact about this device. Read and written directly, for
  the same reason.

**The theme is the one setting that must not follow the user between devices.** Which theme is
right is a fact about the screen in front of them — a phone in a dark room, a laptop under office
lights — so an account carrying it across is wrong more often than right. Moving it into `store`
would sync it, silently and immediately: that is the whole mechanism. `paintTheme()` resolves
`auto` against `prefers-color-scheme` and listens for OS changes while the page is open, and it
also owns the `theme-color` meta, whose two values have to match the two `--paper` grounds.

**The theme is applied twice, and that duplication is load-bearing.** An inline `<script>` in
`<head>` sets `data-theme` before first paint; `app.js` is loaded at the end of `<body>`, so
without it every load flashes light before the theme lands. The inline copy is deliberately the
minimum — the key name and the two output values — and both copies have to change together.

`<meta name="darkreader-lock">` is in `<head>` because the app has a real dark theme; Dark Reader's
automatic inversion would fight the palette rather than add to it.

## The calendar and the clock

**Weekdays, months, dates and telling the time — the third subject, and nearly all of it is
counting.** 四月 is the number four with a counter on the end, 二十日 the number twenty with
another, 四時 and 四十五分 two more, so a reading is *composed* exactly as a number's is:
`readNumber()` for the value, `kanjiNumber()` for how it is written, then the counter. `kana.json`
writes down only what composition gets wrong.

That list is each counter's `irregular`, and it is **keyed by the whole value rather than by a
digit**, because these replace the entire reading and not one part of it — 一日 is `tsuitachi`,
二十日 `hatsuka`, 四月 `shigatsu`. Everything absent from it is built, kanji included.

**Which values have to be listed is not a matter of taste.** 4, 7 and 9 carry `alt` readings in
`numbers` (yon/shi, nana/shichi, kyū/ku) and a bare trailing digit takes them, so **every value
ending in one of the three is written out** — 四日 七日 九日, 十四日 十七日 十九日, 二十四日
二十七日 二十九日 — or the drill would quietly accept `jūnananichi` for 十七日, which no calendar
says. Everything else composes: 十一日 is `jū` + `ichi` + `nichi` and needs no entry.

**Weekdays are not counting at all and are simply listed.** What makes them the same kind of thing
as a date is that both have an **identity that is not Japanese** — the number for a month or a
date, the English name for a weekday — and that identity is what Typing and Choosing answer with,
exactly as the number drills answer with digits.

| mode | prompt | answer | field |
|---|---|---|---|
| `type` | 二十日 or `hatsuka`, 月曜日 or `getsuyōbi` | 20, 4, `Monday` | `#numInput`, or `#input` for a weekday |
| `choose` | the same prompt | the same answer, 1 of 4 | `#choices` |
| `write` | the identity — `20日`, `4月`, `Monday` | the kana — はつか | `#kanaInput`, the IME |

Four things about that table are load-bearing:

- **Which script the first two ask in is the `Numbers & dates ask with` setting**, shared with the
  number drills — see **Numbers**. Both forms are worth practising and each keeps its own records.
- **Writing asks with `20日`, not with 二十日.** The kanji is one of the two things the other modes
  show, so asking with it there could be the same question twice. The counter still has to be
  named, though, or a bare "20" could want either はつか or にじゅう — which is why the prompt is
  the plain numeral with the counter's own kanji after it.
- **A weekday takes the plain field, not the keypad.** `numericAnswer()` is what decides, and it
  asks whether *this card* is answered with a number rather than which drill is running. It is the
  one generated prompt that isn't.
- **Grading is `numKanaAccepts()` / `numRomajiAccepts()`, unchanged.** An irregular value is a
  single part — the whole word — which is also what puts its `altk` in the right place: 十七日 takes
  じゅうしちにち or じゅうななにち, and nothing composed has an alternate at all, because everything
  that would have had one is listed instead.
- **A weekday takes its stem alone**, げつ for げつようび, which is one more `altk`/`alt` on the
  entry in `kana.json` and no code at all — a weekday card's parts are that entry, so the machinery
  that already reads alternates reads these. It works here and would not anywhere else in the app:
  every weekday ends in the same ようび, so the stem is the whole of what distinguishes them, and it
  is a *word* rather than a number. A month's stem is the bare number (四月 → し, which is also 4)
  and a date's is either the bare number or nothing separable at all (はつか does not come apart),
  so accepting a stem there would drop the counter the drill exists to teach. The instruction line
  says "its first part is enough" in general terms rather than by example, since naming the stem
  would name the answer.
- **`key` is the identity**, so `logAnswer()` files a date under `20` and a weekday under `Monday`.
  A date asked both ways is one thing you either know or don't; the report should say you are slow
  on the 20th, not rank `hatsuka` against `20`.

### How a date is written

**Months, dates and times are shown 9月, 20日 and 3時45分 by default, and 九月, 二十日 and
三時四十五分 only when `Dates & times written as` says so** — `state.dates`, `DATE_FORMS`,
`setDates()`. Digits are how a calendar, a ticket or a sign prints them; the kanji form is what a
textbook uses. A weekday has no number in it and looks the same either way. It belongs to `store`
for the prompt setting's reason, and boot runs `setDates()` before `setMode()` for the same one.

**Under 9月 the two reading modes ask for the reading, not the value.** 9月 → 9 is the answer
copied off the square, so Typing takes romaji (or kana) on the plain field and Choosing offers four
readings, each built by `calendarCard()` from the neighbours `calNeighbours()` / `timeNeighbours()`
already pick. `answersReading()` is the single test, and three things hang off it:

- **`numericAnswer()` is false under it**, so `typedField()` hands over `#input`, not the keypad.
- **`pick()` grades a calendar card against `choiceAnswer()`**, never `c.a` directly. `c.a` stays
  the identity, which is what `key` and the report want.
- **It is a third record form, `-numeral`**, beside `-kanji` and `-reading` (`promptForm()`),
  because it is a different question from both. A weekday keeps `-kanji`. Nothing migrates: 九月
  records stay where they were earned, and 9月 starts its own.

The Reading prompt and Writing are untouched — `kugatsu` → 9 still answers on the keypad, and
Writing already asked with 9月. **`c.cal.numeral` sits beside `c.cal.face`, and `calFace()` is what
picks between them** for the square, the feedback line and the missed list alike. The chart keeps
one `x` column rather than two: `numeralText()` turns the kanji numerals in it into digits at render
time, reading them back from `numbers`, so the two forms cannot drift and the generator still has
one thing to emit.

**Choosing draws its distractors from nearby** (`calNeighbours()`) — the dates either side, then a
week and ten days away, then whatever the drill still holds; for a weekday, the rest of the week.
Deliberately *not* `numNeighbours()`'s digit surgery, which over a range of 31 offers 10 and 30 for
the 20th and never 19 — the two you actually mix up.

**Every value is asked exactly once**: seven, twelve, thirty-one, or the thirteen a drill picks out
of them. A calendar is a fixed set, so there is nothing to sample and no magnitude band to deal
across, and `calendarQueue()` is a plain shuffle of `calPool()`.

**A drill may name the values it asks** — `values` in `kana.json`, which `cal-day-native` carries:
1–10, 14, 20 and 24, the dates that are said as words instead of ending in にち. It is a *subset of
the same material*, not a fourth kind of thing — same composition, same grading, same three answer
modes, same report — and the only code it needs is `calPool()`, which returns either the list or
the counter's whole range. Two details that are not optional:

- **It carries no `len`.** Two copies of the same count are one of them waiting to go stale, so
  boot derives it from the list. The three full drills keep theirs, which is the counter's range
  and not a second copy of anything.
- **Choosing draws from the pool, not from the counter.** Offer the 19th against はつか in a drill
  that only ever asks thirteen dates and anyone who knows *which* thirteen answers without reading
  the prompt — the same giveaway `numNeighbours()` tops up its band to avoid. That is why
  `calNeighbours()` takes the pool rather than a `max`, and why its fallback runs nearest-first: a
  subset is sparse, so the offsets it is asked for mostly miss.

**The English is a card field, not a lookup.** A weekday's comes from `en` in `kana.json` and a
month's from the counter's `names`; a date's ordinal is generated, because "the 21st" is a rule
about a number rather than a word anyone had to write down — the same reason `fmtDigits()` is code
and not content. That is what lets the feedback say *二十日 is the 20th — はつか "hatsuka"*, which
is the one useful way round however the card was asked.

**A drill whose counter has gone from `kana.json` is dropped at boot**, and so is one left with no
values — or, for the clock, without both of its counters and its marks — rather than offering a run
that cannot generate a card. The same rule that drops a derived deck with nothing left to derive
from.

### The clock

**Three more drills, and between them they add exactly one idea: two counters said one after the
other.** Hours and minutes are counters like 月 and 日 — `cal-hour` is 一時 to 十二時 and
`cal-minute` the nineteen values `values` names — so they need no code at all beyond being listed.
`cal-time` is the new shape, and `timeChunks()` is all of it: the hour composed, then the minute
composed, then joined.

- **The two counters are named by the drill**, in `counters`, and the marks it asks in `minutes`.
  An id belongs to the content, so `"hour"` and `"minute"` appear in `kana.json` and are read from
  the deck — never written into a lookup in `app.js`.
- **A clock reading is two words where a date is one.** 三時四十五分 is `sanji yonjūgofun`, so the
  romaji keeps the space between the counters and the kana runs together as it is written. That is
  the one place the calendar's own "join with no spaces" rule doesn't hold, and it costs nothing:
  grading walks the parts flat and `normRomaji` drops spaces anyway.
- **半 is an alternate on the minute, not a second reading of the time.** 三時半 and 三時三十分 are
  the same clock face, so `half` in `kana.json` is merged onto a *copy* of the minute part — the
  part objects are shared between cards and cache their spellings on themselves — and only while
  the two counters are being said together. A bare 三十分 is さんじゅっぷん and never はん, which is
  why this must not reach the minutes drill, and doesn't. The merge is guarded on the minute being
  a single part, which being listed in `irregular` is what makes it.
- **The identity has a colon and the keypad has no colon key**, so `readClock()` takes the digits
  and reads the last two as the minutes: `3:45`, `345` and `03:45` are one answer. Asking for the
  colon would leave the drill unanswerable on a phone, which is the device it is for. The
  placeholder says `h:mm…` rather than the instruction line naming a format above the question.
- **`n` is null on a clock card and on a weekday**, one because it is not counted and the other
  because it is counted twice, so every branch tests `kind` instead. Reading `c.cal.n` to tell them
  apart is what the weekday branch used to do and is what broke first.

**Seconds are a fourth counter and a sixth drill, and add nothing to the machinery.** `cal-second`
is 秒 on the same nineteen values as the minutes, and it is the calmest counter in the file: びょう
never changes the number in front of it, so the only entries in its `irregular` are the three the
4/7/9 rule forces — よんびょう, ななびょう (or しちびょう), きゅうびょう — which exist to *refuse*
しびょう, よびょう and くびょう rather than to change a sound. That contrast with 分 is the lesson,
and the chart puts the two side by side. Seconds are deliberately not part of `cal-time`: a clock
is read aloud to the nearest five minutes, and 3時45分30秒 is a timer, not a time of day.

**The faces are dealt, not sampled.** Twelve hours against twelve marks is 144 faces and a run asks
twenty, so `timeValues()` cycles a shuffled list of each: every hour is asked before any hour is
asked twice, and the same for the marks. Sampling twenty of 144 can leave 四時 or 七時 out of a run
altogether — the same argument that deals the flick prompts. The distractors wrap around the face,
so 12:55 is offered against 1:00.

**Which is also why `cal-time` is the second drill the backend refuses to analyse.** One face comes
round about every seventh run, so ranking them says nothing; `cal-hour` and `cal-minute` are twelve
and nineteen fixed prompts and are analysed like any deck. See `UNANALYSABLE`.

### 午前 and 午後

**`cal-ampm` is the clock with the half of the day in front**, and it is a drill of its own rather
than a change to `cal-time`, for the reason records split by mode: 三時四十五分 → 3:45 and
午後三時四十五分 → 15:45 are different questions, and Clock times' records were earned on the first.
The two words are `meridiem` in `kana.json`, each carrying the 24-hour `from` its half starts at,
and a time drill opts in with `"meridiem": true`. Four things about it:

- **The identity is the 24-hour clock.** It is the other way Japan writes a time — timetables,
  opening hours — and the only way to say *pm* on a keypad, so Typing takes `1545` for 午後3時45分
  exactly as Clock times takes `345`. `c.cal.h24` is what `readClock()` is checked against; on a
  plain clock card it is simply the hour. **Writing asks with `3:45 pm` instead**, because the words
  are what is being written and a 24-hour prompt would turn the question into arithmetic.
- **Hours run 1 to 11**, from the drill's `hours`. Twelve is left out on purpose: the 1872
  ordinance that brought in the solar clock makes 午前12時 noon, everyday use and most timetables
  say 午後0時 for noon and 午前0時 for midnight, and a drill should not grade one side of that.
- **The other half of the day is always a wrong option** (`meridiemNeighbours()`) — first, and
  never shuffled out of the three. 午前 against 午後 is the whole of what the drill adds, and three
  neighbouring minutes in the right half would never test it. The rest are `timeNeighbours()`,
  kept to this half and to the drill's hours.
- **It is unanalysable**, on `cal-time`'s reason twice over: eleven hours, twelve marks and two
  halves is 264 faces against a run of twenty. `timeValues()` deals the halves **over the finished
  list**, a shuffled pair at a time, so every run is exactly half of each. They were first dealt
  inside the loop beside hours and marks, where every skipped duplicate threw a half away and a run
  could come out eleven to nine.

`timeEntry()` is the one place an identity is read back into `{h, m, mer}`; Choosing under 9月
needs it to build a reading for each neighbour.

**The words on their own are a card deck, not a drill** — `time-kanji`, listed first under 日時
because it is where to start. See the architecture section: it is kana-shaped content, and giving
it a `kind` would have built a generator for six fixed cards.

**Minutes stop at the five-minute marks**, deliberately: 3:47 is composition plus one more
`irregular` entry, and a clock is read to the nearest five aloud far more often than not. It is a
`kana.json` edit away — the marks are a list on the drill — and needs no code.

## Performance mode

**`kana.perf` drops every animation and the pause after a right answer.** `setPerf()` writes
`data-perf` on `<html>` and the stylesheet does the rest; `revealDelay()` is `0` instead of
`REVEAL_DELAY` while it is on, so a correct answer advances on the next tick rather than after
620 ms of 〇.

Four things about it are deliberate:

- **It is not `auto`, where the theme is.** The OS already has a way to ask for less motion and the
  stylesheet obeys `prefers-reduced-motion` unconditionally, as it always did. What this adds on
  top is the *pacing* change, which no system setting has an opinion about — inferring it would
  quietly change how fast someone's drill runs because of an accessibility preference they set for
  an unrelated reason. The two overlap on animation and agree there.
- **The 〇 is removed, not sped up.** It is the one animation that is not decoration — half a
  second of reward — and `animation-duration: .001ms` would leave it *stamped on the square* for
  the rest of the pause rather than skipping it. `display: none` is what "no circle" means. The
  red/green square and the feedback line still say what happened.
- **A wrong answer is untouched.** It waits for Enter or a tap in either mode, because the
  correction is the part worth reading; skipping it would make Fast a way to answer badly and never
  find out.
- **A Fast run sets records like any other, and there is one pool.** It shipped for a day refusing
  to set a *time*, on the grounds that dropping ~0.6 s per card makes it a different measurement —
  which is true, and was still the wrong call: it threw away a run the user actually did and sat
  through, and told them so on the results screen. Don't reinstate it. A record you can't take by
  playing better is not a record, and the honest fix for the comparison — if it ever matters — is
  to stop counting the app's own pause towards the clock, never to start rejecting runs.

  What follows is that the record for a deck ends up being a Fast one, since Fast is quicker by the
  stamp delay per card. That is accepted, not overlooked. **The per-card timings the backend
  analyses are unaffected either way**: they measure the card's time on screen *before* the answer,
  which no pause after it can touch. Only the run total moves, and `recent_runs` reports it as the
  fact it is.

There is deliberately **no inline `<head>` script** for it, where the theme needs one. The theme
would otherwise flash the wrong palette on every load; nothing animates at boot — transitions fire
on change and nothing animates on arrival — so there is nothing to catch, and a
second duplicated pre-paint script is a cost with no bug behind it.

**Records belong to a deck _and_ a mode**, keyed `deckId|mode` by `recordKey()` — reading kana,
picking from four, and writing kana from a sound are three different skills, and pooling them let
the easiest mode set a score the hardest could never beat. Every `store.best`/`setBest`/`bestTime`/
`setBestTime` call therefore takes a mode. Two consequences that are easy to miss:

- **A generated drill's record carries the prompt form too**, keyed `deckId|type-kanji` by
  `recordMode()`. 六 → 6 gives itself away to anyone who has met ten kanji where `roku` → 6 does
  not, so pooling the two would let the easier one set a score the harder can never beat — which is
  the whole reason records split by mode in the first place. Only the two reading modes are
  suffixed; Writing asks the same question either way. `promptApplies()` is the single test, and
  `modeLabel()` is what takes the key apart again for display, including for run rows the server
  sends back.
- **`setPrompt()` and `setDates()` have to rebuild the menu** for the same reason `setMode()` does, below: every
  figure under 十 and 日時 belongs to the form on screen.
- **`setMode()` has to rebuild the menu**, not just re-render the play screen. The deck rows show
  the selected mode's figures, so switching mode while on the menu changes every number in the
  list. The `<small>` under each figure names the mode for the same reason — an unlabelled
  percentage reads as *the* score for that deck.
- **`rev < 4` stores are migrated, not discarded**, in three steps. `rev 2` moves records keyed by
  bare deck id into `deckId|mode`; `rev 3` moves `deckId|number` — the reserved mode the number
  drills briefly used — onto the mode that was last selected, that being the only evidence of which
  one earned them, and never overwrites a record the real mode already holds. `rev 4` moves a
  generated drill's `|type` and `|choose` records onto `|type-reading` and `|choose-reading`,
  because romaji was the only way those drills asked before the kanji prompt existed. It matches on
  the `num-` and `cal-` id prefixes rather than on `allDecks()`, which is empty at that point —
  `store.migrate()` runs at boot, before `kana.json` has been fetched. All three run once and are
  idempotent.

**The menu is deliberately shallow.** Only three things sit on it: the script switch, the deck
list (which scrolls, and holds the flick drills), and one More button — plus whatever the user pins above it as quick access, below. Answer mode, theme, font,
chart, progress and account all live on `#options` behind that button — stacked on the menu they
took about a third of a phone screen away from the deck list, which is the thing you came to use.
The mode is the one setting that is otherwise invisible from the menu, so `setMode()` writes it
into the More button's label, which `buildQuick()` hides while Answer by is pinned. That shallowness holds on a wide window too, where the menu is
the rail: the rail is the same element, so promoting Progress or the chart into it would mean a
second copy of a row that already exists, and rows drift the moment there are two of them.

**More, Settings, and quick access.** The menu's one button is **More** (`#options` in the code),
and More is five buttons and nothing else: Settings, Character font, All characters & romaji, Your
progress, Account. **Settings** (`#settings`) holds every switch — Practice, Display — plus the
Quick access toggles and a Keyboard note. Any row carrying `data-setting` can be pinned, and a
pinned row shows in two places: at the foot of the menu, above More, and in the **quick options
dialog** the Q key opens. Answer by is pinned by default, so the most-changed setting is back on the
menu without anyone asking. Five things keep that from becoming the second copy the paragraph
above warns about:

- **A pinned row is a clone, not a copy anyone writes.** `buildQuick()` clones the row from
  Settings into both places and strips its ids; a tap on a cloned button clicks the original, so
  the listener in `wiring.js` and the setter behind it are the only ones there are.
- **Setters paint only the originals**, and a `MutationObserver` on `#settings` copies
  `aria-checked` onto every clone (`mirrorQuick()`). Nothing paints a clone directly, so
  `el.modeSwitch` and the rest stay the one handle per switch.
- **The toggles are named from the rows' own labels**, so a label changed in `index.html` changes
  everywhere.
- **The pins are this device's**, in `kana.quick`, read and written directly like the theme — how
  much menu there is room for depends on the screen. More names the answer mode only while Answer
  by is *not* pinned, since it is otherwise invisible from the menu.
- **Pinned rows on the menu are capped at 38dvh and scroll past it** (24dvh under 450px tall), and
  never shrink below that. All six on a 320x568 phone stood 394px and took the deck list to zero
  and More off the screen; a shrinkable area instead squeezed the one default row to a 25px sliver
  on a landscape phone. Both were measured, and the cap is what fixed both.

A new setting is pinnable the moment its `.modebar` row has a `data-setting`; `initQuick()` runs
from boot after every setter, so the clones start from the state the originals are in.

**Shortcuts** live in `shortcut()` in `wiring.js`, and both work **on the menu only**: **1–5** pick
a stamp (the stamps carry `aria-keyshortcuts`), and **Q** opens quick options. Q shipped working
mid-run too, guarded by "not while a field has focus" — and that guard is not enough, because the
answer field loses focus all the time: a tap on the square, the keyboard put away, a click
elsewhere. A Q after any of those opened the dialog over the card. Don't bring it back mid-run.
Neither shortcut fires while a field has focus, with Ctrl, Alt or Cmd held, mid-composition, or on a
panel, which returns before `shortcut()` is reached; and digits stay Choosing's during a run.

**Layout model.** `body` → `.stage` → one `.screen` flex column per screen. `.play` is four bands:
`.playbar` (fixed) / `.revealbar` (fixed, touch only) / `.playmain` (flexes, holds the writing
square) / `.dock` (fixed, holds feedback + answer controls + stats).

**Nothing is a modal.** Options, the font picker and the chart were `<dialog>` sheets and are now
screens like every other — `#options`, `#fontPicker`, `#chart` — reached with `navTo()` and left
with `navBack()`. What that bought, in order of how much it mattered:

- **A sheet has to cap its own height and a screen does not.** Options is the tallest thing in the
  app and the *last* row in it is Account, which is the way to Sign out, so the cap was what
  decided whether the way out was on screen. There was a whole invariant about re-measuring two
  `max-height` values whenever a row was added. It is gone, along with `--backdrop` and
  `--shadow-sheet`.
- **One way out instead of four.** A sheet closed by its ✕, its backdrop, Escape, or another sheet
  opening over it, and only `<dialog>`'s own `close` event caught all four. Screens have `navBack()`
  and the keydown handler sends Escape to it.
- **A trail rather than a single trigger.** `navTo()` pushes `{screen, focus}`, so menu → Options →
  chart → back lands on Options and not on the menu, and 字 from a running card comes back to the
  card. `show()` is the plain move that cuts the trail; every "go to the menu" path uses it.

**The one exception is the quick options dialog**, `#quickDialog`, and it is a real `<dialog>` on
purpose. It opens over the menu, from Q, and has to come straight back, which is exactly the job a
screen and its trail do badly. What sank the old sheets does not
apply: it holds a handful of switches, so there is no height cap deciding whether a way out is
visible, and every way it closes — ✕, Escape, a click on the backdrop — lands on the one `close`
event, where `afterQuickDialog()` puts focus back where it was. The panel inside fills the dialog, which is what makes "the click's target is the dialog"
mean "the backdrop". While it is open the document keydown handler returns first, so no digit or
Escape reaches the screen behind it. jsdom has no modal dialogs, so a suite that opens it has to
stub `showModal`/`close` and fire `close` itself.

`navBack()` keeps the one piece of the old `close` handler that was load-bearing: **back into a
running card refocuses the answer field**, because the on-screen keyboard follows focus and the
point of coming back is to keep typing.

**On a wide window the menu is a rail and everything else is the pane.** One media query does it
(`min-width:1100px and min-height:560px`) and there is no second copy of anything: `#menu` is the
same element, placed in column one and exempted from `.hidden`, and every other screen is placed
in column two. Four things about it:

- **`activeScreen()` still reads the class, not what is painted.** `.hidden` stays on the menu
  while a drill runs; CSS is what decides it is still visible. So app.js keeps thinking one screen
  at a time, which is what kept this to a layout change instead of a rewrite.
- **`.hidden` carries `!important`** — it has to, or a later `display:` rule like `.play`'s grid
  would beat it — so the two exemptions carry it too. An id beats a class, which is what settles
  which important rule wins.
- **`data-screen` on `<body>` is the one thing JS tells the stylesheet**, and it decides the idle
  pane: with nothing running, the chart fills it and its Back link is dropped. `paint()` keeps the
  chart built and `setScript()` re-renders it, because a stamp has to move the deck list and the
  table beside it together.
- **1100px is a measured floor, not a round number.** Below it five seal stamps and their labels
  do not fit in a rail that still leaves a usable pane — the bar overflows before the labels are
  legible. `#fatal` is the one screen that suppresses the rail: there are no decks to list.

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

**Changing a password is not resetting one.** There is no email on file and no recovery flow, so
knowing the current password is the entire proof — `POST /api/password` asks for it even though the
caller already holds a valid session, because the case it exists for is a borrowed unlocked phone.
Four things about it are load-bearing:

- **A wrong current password is a 400, never a 401.** `api.call()` signs the client out on any 401,
  so returning one here would log someone out for a typo.
- **Every session dies and the caller gets a fresh token in the reply.** You change a password
  because someone might know the old one; leaving the sessions it already opened alive defeats it.
  The client must store the returned token or it logs *itself* out on the next request.
- **It is throttled on its own bucket**, keyed by user id rather than IP (`ratelimit.password_user`).
  A session is needed to reach the endpoint at all, so the attacker worth stopping is at an
  already-signed-in device; keying it to the account also caps the CPU. Deliberately *not*
  `login_user` — fumbling this must not be what stops you signing in on your phone.
- **The confirm field never reaches the server.** Two boxes exist to catch a typo before it becomes
  a password nobody knows, which is a fact about what was typed on that screen; the API takes
  `{current_password, new_password}` and the client compares.

The rule for the new password comes from `auth.validate_password()`, which signup calls too — two
copies would drift, and the looser one would be the one that mattered.

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
  unrelated material. **The derived decks are not the exception they look like**: `mixed`, `kana`,
  `hiragana-mixed` and the rest are deck ids like any other, and each one's figures come only from
  runs of it. What is forbidden is *deriving* a cross-deck figure from runs of separate decks;
  sitting down and practising all 214 in one go is a thing you did, and its accuracy and times
  describe it. None of them feeds a source deck's report or is fed by one, and each needs its own
  three runs. The consequence worth knowing is that there are twelve reports to fill, not six.
- **The random number drill is listed but never analysed**, for the reason above; `num-50` is
  analysed like a deck. `UNANALYSABLE` is the set, kept beside `FLICK_PREFIX` because it is the
  same distinction — a prompt that will not recur cannot be ranked. **The arithmetic drill is not in
  it**, because it files under its five operators, which recur every run. **The clock drill is the
  other one in it**: twelve hours against twelve marks is 144 faces and a run deals twenty, so one face
  comes round about every seventh run and ranking them would say nothing. `cal-ampm` is in it for the same reason twice over. **Every other calendar
  drill is analysable** and needs nothing added: seven, twelve, thirteen, nineteen, nineteen, twelve and
  thirty-one fixed prompts, every one of them asked every run, which is exactly the case the
  report is for.
- **Flick drills are listed but never analysed** (`analysable: false` for any `flick-` deck).
  Their prompt is a direction or a key, not a character, and any character with that vowel or on
  that key is accepted — so there is nothing to call slow and a wrong answer can't be traced to a
  character. `enough` and `ready` are separate fields for exactly this: a flick deck can have
  plenty of runs and still never report.
- **The per-character findings read the last `RECENT_RUNS` (5) runs, not all of history.**
  `slowest`, `fastest` and `confusions` are about how you are doing *now* — a character you
  struggled with in week one and have since drilled flat would otherwise head that list forever,
  long after it stopped being true, and the list exists to say what to practise next. `overall`
  and `cards_tracked` deliberately still span everything; they are the long view, and a lifetime
  accuracy that moved on every run would be a different figure. **`weakest` also stays on all
  history** — over five runs of a 46-card deck a character is seen five times, so accuracy moves
  in 20% steps and one slip reads as a collapse. The window is one `SELECT` of run ids that
  `recent_rows` filters against; `recent_window` reports what it actually came to, which is fewer
  than 5 early on, and the UI prints that number rather than claiming "last 5" over three.
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
- **`recent_runs` carries `created_at`**, which `runs` has always stored: the server stamps every
  run in UTC ISO-8601 and the client renders it in the device's own zone. `fmtWhen()` formats it
  by hand rather than with `toLocaleString`, so the shape is the same everywhere — one history
  reading `05.08.26` on a phone and `8/5/26` on a laptop looks like two.
- **`fastest_run_ids` tags the run holding the time record**, one per mode, with a brass
  *Fastest* pill in the Runs list. It follows the best-time rule — flawless runs only — and is
  chosen from all history, not from the 25 listed: when the record is older than the list, nothing
  is tagged rather than the quickest of what happens to be on screen. A tie goes to the earlier run.
- **Mobile and desktop are never pooled.** Typing romaji on a keyboard and flicking on glass are
  different physical acts. Every figure belongs to one bucket; the client sends `device` from the
  same `TOUCH` test the rest of the app uses.

Blocks whose scope isn't "everything" say so in their own subtitle — an unqualified "Slowest to
recall" is a claim about every run ever, and that is no longer the figure being shown. Change the
window and those strings have to move with it.

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

**`favicon.ico` is what the page actually links**, and `icon.svg` is the source it comes from —
neither is redundant. The `.ico` is the conventional one: it is also the path every browser requests
unprompted when no link tag resolves, and `StaticFiles` at the root serves it without a route.

It carries **16, 32, 48, 64, 128 and 256**, and every size is rendered from the SVG *at that size*:

```bash
for s in 16 32 48 64 128 256; do rsvg-convert -w $s -h $s -o icon-$s.png icon.svg; done
# then packed with Pillow: Image.save("favicon.ico", sizes=[...], append_images=[...])
```

**Do not generate it by scaling one large raster down.** The 16px frame has to hold up alone —
that is the whole reason the glyph is SemiBold and the guides are faint — and a 256px render
squeezed to 16 turns it into the grey mush that choice was made to avoid. Regenerate all six
whenever `icon.svg` changes, or the favicon quietly keeps showing the old glyph.

The frames are PNG-compressed rather than BMP, which every browser has read for well over a decade
and which keeps the file at ~21 KB instead of several times that.

`rel="apple-touch-icon"` still points at the SVG, which iOS does not support — it falls back to a
screenshot there. A 180×180 PNG from the same pipeline would fix that if it ever matters; the `.ico`
does not, since iOS ignores it for the home screen.

## Invariants that are easy to break

These each cost a real bug once. Comments in the source mark most of them.

- **Reading→kana is many-to-one, and both directions have to respect it.** じ/ぢ are both `ji`,
  ず/づ are both `zu`. Choose-mode distractors therefore dedupe by *reading*, not by card, or two
  identical option buttons get rendered. Write mode hits the same collision from the other side:
  the prompt is only the reading, so the user cannot tell which of the pair is being asked and
  `writeAccepts()` must accept **any** card whose `a` matches — grading against `card().q` alone
  makes 4 of the 25 dakuten cards unanswerable.
- **"Any card whose `a` matches" means within the card's own category, not the whole deck.** In a
  deck spanning both scripts the collision also runs across them — か and カ are both `ka` — and
  every card has a twin. Scoped to the deck, write mode there would accept hiragana for all 214
  and stop being a test of katakana at all; scoped to `card().q`, じ/ぢ break again. `cardGroup()`
  is the single knob: it returns the source deck for a derived deck's card and `state.deck` for
  everything else, so the six real decks grade exactly as they always did. A deck that spans
  scripts also has to say which one it wants (`writeAsk()`, gated on `spansScripts`) or the
  scoping is just an unwinnable guess — the two ship together.
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
  blurs once the play screen is gone — that focus move is the app's doing, not theirs — and
  `start()` clears the flag so a fresh run always offers the keyboard.
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
- **`.hidden` is `display:none !important`, and the rail layout is the only thing allowed past
  it.** The `!important` is load-bearing: a later `display:` rule — `.play`'s grid, say — would
  otherwise beat a plain `.hidden`. So the two wide-window exemptions (`#menu.hidden` always, and
  `#chart.hidden` while `data-screen="menu"`) are important *and* id-scoped, which is what makes
  them win. Anything else that wants to show a hidden screen is a bug waiting: the class is how
  `activeScreen()` knows what is up.
- **Sibling `<span>`s sharing a grid cell need explicit `display:block`** or their text runs
  together (this bit `.deck__name`/`.deck__meta` and `.font__name`/`.font__note`).
- **The run is timed, and the clock stays off screen while practising unless the Timer switch
  shows it** — deliberate, a visible
  ticking counter turns practice into a race. Hidden is the default for that reason; `setClock()` syncs the choice through `store`,
  and `runClockTick()` is the only thing that repaints the play bar's clock — it is a display,
  and nothing is measured by counting its ticks. The results screen shows the total and the best
  time with `fmtExact()`, to the millisecond, never rounded: those are the figures the records keep.
- **Never select `.seg__btn` document-wide.** Seven switches share the class now — answer mode,
  prompt form, date form, timer, theme, performance, and the progress screen's device switch. A global query wires
  `setMode(undefined)` onto the others and blanks their `aria-checked` on every mode change. Each
  has a handle of its own for exactly this reason: go through `el.modeSwitch` / `el.promptSwitch` /
  `el.datesSwitch` / `el.clockSwitch` / `el.themeSwitch` / `el.perfSwitch` / `el.deviceSwitch`. The shared *layout* is `.modebar--stack`,
  which is a layout modifier and not a handle on the mode.
- **`activeMode()` is a record key, not a test of what is on screen.** It carries a `-kanji` or
  `-reading` suffix for the generated drills, so `activeMode() !== "choose"` silently stopped being
  true and the two places that asked it now call `choosingNow()`. That can't be `state.mode ===
  "choose"` either: a flick run ignores the mode and is always typed.
- **A panel is left with `navBack()`, and Escape has to be wired to it by hand.** `<dialog>` used
  to handle Escape natively; a screen does not, so the document keydown handler sends it there —
  and returns early while a panel is up, or the digits that pick an answer would reach the card
  behind it. Leaving a panel any other way (calling `show()` from inside one) drops the trail and
  strands you on the menu. **`PANELS` is the list, and a new `navTo()` screen has to join it** — and `SCREENS`, and the two
  id lists in the wide-window block of `core.css`, or it is laid out as a phone screen beside the
  rail —
  Account and Progress were `navTo()` screens with Back buttons that never did, so Escape did
  nothing on either until they were added. Escape goes one layer at a time: the change-password
  form inside Account closes first, and only the next Escape leaves. The results screen takes
  Escape to the menu. And nothing leaves on an Escape the IME is composing with, for the reason
  Enter must not grade on one.
- **Back into a running card refocuses the answer field.** This is the one piece of the old sheet
  `close` handler that was load-bearing rather than plumbing: the on-screen keyboard follows focus,
  so without it 字 mid-card left the keyboard down for the rest of the card. It lives in
  `navBack()` now, and it has to stay ahead of the "focus what opened this" branch.
- **A stamp on a wide window moves two things.** The deck rail and the chart in the pane beside it
  are the same stamp, so `setScript()` re-renders the chart when the menu is the active screen.
  Miss it and the rail says Time while the pane still shows hiragana.
- **A form that validates itself needs `novalidate`.** `required` stays on the fields, because that
  is what tells a screen reader they are mandatory — but the browser's own bubble fires first and
  suppresses `#authMsg`/`#pwMsg` entirely, so the message the app writes is never seen and
  `aria-invalid` is never set. Both forms carry `novalidate` and validate in `submitAuth()` /
  `submitPassword()`.
- **A submit button is disabled only while its request is in flight**, never to gate a form: an
  always-pressable button lets the error say what is wrong instead of leaving you to guess what the
  button is waiting for. `busy()` is the one place that does it, and it swaps the label too —
  signing in is 600k PBKDF2 rounds, long enough that a button which only greys out reads as dead.
  It stashes the idle label in `dataset.idle`, so `setAuthMode()` swapping Sign in ↔ Create account
  mid-request writes where `busy()` will find it rather than over the top of it.
- **`store.migrate()` is called from boot, not at the `store` literal.** It writes, a write reaches
  `schedulePush()`, and that touches the `api` const declared further down — running it early hits
  that binding's temporal dead zone and the whole IIFE throws.
- **Runs are posted whole, at the end.** A run abandoned halfway is not evidence of anything, and
  per-card posting would put a network call between every card.
- **Flick prompts are dealt out evenly, then shuffled** — never sampled at random. Over only 20
  prompts, random sampling can leave a whole direction out of the run, which is the one thing a
  drill whose entire purpose is covering all five directions must not do.
- **Best *time* is only recorded for a flawless (100%) run.** Timing every run lets a rushed or
  revealed-answer run set an unbeatable record. Reveals count as misses. Performance mode is *not*
  a second condition on this and was briefly and wrongly made into one — see **Performance mode**.
- **Never look a record up by deck alone.** `store.best(deckId)` without a mode silently returns
  `undefined`→`0`, which renders as "no attempts yet" rather than failing — a bug that reads as
  wiped records.
- **Choose-mode distractors are drawn from the prompt's category first.** Over Mixed kana's 214
  cards a plain draw puts three yōon readings beside a one-mora prompt, and the option answers
  itself; the score stops measuring anything. The widen-to-the-whole-deck fallback is only reached
  when a category can't spare three distinct readings, which no shipping deck hits.
- **A derived deck's cards are the source decks' card objects, not copies.** Put them in
  `state.decks` and `chartReadings()`, `buildFlickIndex()` and every other full sweep sees each
  character three or four times over. `allDecks()` is for the menu, `deckLabel()`, `forScript()`
  and the stamp check; `state.decks` is for anything counting characters.
- **A generated run answers to the mode, so the branch for it has to come first.** `render()`
  computes its prompt from `state.numbers` / `state.calendar` before it looks at `state.mode`, and
  `submitTyped()` tests them before the deck paths. Miss that and a numbers run started while
  Writing is selected shows the IME field with a digit prompt in it.
- **`typedField()` is the only thing that knows which of the three fields is live**, and it asks
  `numericAnswer()` — *is this card answered with a number?* — never *which drill is running*. A
  month and a date answer with theirs; a weekday, alone among the generated prompts, answers with
  an English name and takes the plain field. Reading `el.input` directly in a grading path is what
  this exists to stop.
- **Anything that walks `state.deck.cards` needs a branch for the generated drills.** A number or
  calendar drill has no `cards` — the end screen's miss ordering and the "practise again" wording
  both reached for `.length` and would throw. `deckSize()` is the one place a generated run's
  length is known.
- **Romaji is accepted exactly where it is not the prompt.** Writing takes `roku` for 6 and
  `hatsuka` for 20日, because those drills ask with the identity; it must never take `ka` for か,
  because a deck asks Writing with the reading and the answer would be the question. `writeAccepts()`
  is kana-only and `numRomajiAccepts()` is reached only from the two generated branches.
- **A calendar value a drill *asks* and whose last digit is 4, 7 or 9 must be in `irregular`.**
  Composition hands a bare trailing digit its number-alternates, so 十七日 would answer to
  `jūnananichi` and 七分 to `shichifun` — see **The calendar and the clock**. "Asks" is the whole
  rule now that a drill can name its `values`: 四十七分 is not listed because nothing asks it, and
  listing every value a counter *could* take would be a hand-written table where composition does
  the work. The generator that produces the chart asserts this over each drill's own pool,
  including the clock's marks; a hand edit has nothing checking it.
- **The static mount is `frontend/`, never the repo root.** `StaticFiles` serves any file under
  the directory it is given, by path, so mounted on the root it handed out `backend/kana.db` and
  `.git/`. Anything the browser needs goes in `frontend/`; anything it must not see stays out of it.
- **`kana.json` is fetched with `cache: "no-cache"`.** Without it the HTTP cache silently serves a
  stale deck file and edits appear to do nothing.

## Bundled fonts

Five of the eight font options ship with the app, in `frontend/fonts/`, declared by the `@font-face` block
at the top of `css/core.css` (with `url("../fonts/…")`, relative to the stylesheet) and marked `"bundled"` in `kana.json`:

| Option | Face | Files |
|---|---|---|
| `mincho` 明朝 | Noto Serif JP | one variable, wght 200–900 |
| `gothic` ゴシック | Noto Sans JP | one variable, wght 100–900 |
| `textbook` 教科書体 | Klee One | 400 + 600 |
| `rounded` 丸ゴシック | Zen Maru Gothic | 400 + 700 |
| `ud` UDフォント | BIZ UDPGothic | 400 + 700 |

They were bundled because the picker used to be mostly empty on Windows, which ships no Japanese
serif or textbook face unless the *Japanese Supplemental Fonts* optional feature is installed —
`mincho`, `textbook` and `rounded` were commonly all absent, and the app's entire subject is what
a character looks like. Nothing is fetched from Google or anyone else at runtime: **the app must
keep working with no network at all**, on a LAN, and from a folder on a static host.

**They are subsets, and `frontend/fonts/subset.py` is how they are regenerated.** The upstream faces are
3.6–13 MB each because they carry thousands of kanji; cut to what this app renders they are
32–110 KB, 424 KB for all eight files. Three decisions there are load-bearing:

- **The cut is defined by Unicode *ranges*, not by the current contents of `kana.json`.** Every
  kana block is kept whole, so adding a card can never produce tofu — which would otherwise make
  "adding a deck is a JSON edit" quietly false. The enumerated part is the forty-four kanji the
  interface actually draws — 設定 記録 五十音 …, the numerals 一二三四五六七八九十百千万 both
  generated subjects write their values in, the calendar's 月火水木金土日曜, and 時分秒半 午前後 for the
  clock — plus `U+014D` and `U+016B` for the ō and ū the readings are spelt with, and
  `U+00D7,U+00F7,U+2212` for the × ÷ − the arithmetic drill asks with. `subset.py`'s `check()` re-derives the
  kanji from the sources and fails if the list has drifted, so that can't rot silently.
  **`check()` reads only what is rendered**: comments are cut out of all four files and `kana.json`'s
  `//` keys with them. Those discuss characters the app never draws — 億 and 兆 in the prose about
  how a number is read, 納戸 and 栗 beside the colours named after them — and a kanji that is only
  ever *written about* cannot come out as tofu. Counting them grew all eight files for nothing.
- **Zen Maru Gothic has no ō or ū upstream**, so those two fall back per character to a device face
  in 丸ゴシック. That is harmless only because romaji never renders in `--kana`: `.glyph.is-romaji`
  is `--mincho`, the chart's reading line is `--mono`, and the feedback is the page's own sans. Put
  romaji in `--kana` and this becomes a visible mismatch.
- **No `vert`/`vrt2`/`palt`.** The app never sets `writing-mode` or `font-feature-settings`, and
  dropping those prunes every vertical alternate glyph with them — 30% of the subset. `mark`/`mkmk`
  stay, so a decomposed dakuten arriving from an IME is positioned rather than stacked on the origin.
- **The two Notos stay variable; the other three ship as a regular/bold pair.** One variable file
  is *smaller* than the two static instances the app would otherwise need, and the app does need
  two: the chart headings are 600 and the feedback line's `<b>` is 700.

Two things in the CSS will silently ruin the result:

- **`font-weight` on a variable `@font-face` must be the *range*** (`200 900`, `100 900`). Their
  default instance is the thinnest on the axis — Thin 100, ExtraLight 200 — so a single weight, or
  none, renders every kana on screen as a hairline. That is the same grey mush the app icon is
  drawn in SemiBold to avoid.
- **`font-display: block`, not `swap`.** The glyph *is* the question. Swap paints a fallback first
  and then changes the character under the reader mid-answer; block leaves the square empty until
  the face lands. Same-origin and 32–110 KB, so it is imperceptible locally, and only the face
  actually selected is ever fetched — 110 KB on a first load, nothing after.

**The bundled face leads each stack; the device's own faces sit behind it.** That is what makes
everyone see the same character, while still rendering anything the subset leaves out (a kanji
typed into the write field) from a real installed font rather than as a box.

### What is left of the probe

`app.js` still decides which of the *other* three options to offer by rendering kana to a canvas
and hashing the pixels. Both obvious alternatives remain broken:

- `document.fonts.check('16px "Whatever"')` returns `true` for families that do not exist.
- Canvas *width* comparison cannot work — every CJK face is full-width, so all candidates measure
  identically (e.g. 432px for a 5-glyph string at 56px).

A device-only option is dropped if none of its named families are installed, or if its stack
renders identically to the last-resort font or to an option already listed, so every visible
option is guaranteed to look different. If canvas is unavailable (privacy modes) all options are
offered unverified.

Three things about how bundling changed this:

- **A bundled option is never probed, and cannot be.** Web fonts load long after boot, so probing
  one there always reports "missing" — it would delete the very options that are guaranteed present.
- **A bundled option skips the *dedupe* too.** At boot none of the five have loaded, so all five
  hash to whatever their generic falls back to — identical to one another — and a dedupe would keep
  one and throw the other four away.
- **The last-resort hash now seeds `seen`.** That was always the documented rule and the comparison
  was simply never made; it was only safe to start making it once five options shipped, because
  before that it could have emptied the picker. It is **not** a tofu test and can't be made into
  one: browsers fall back per character, so on a Windows box with no Japanese font `serif` still
  renders real kana out of whatever face the engine finds. "Last resort" here means
  "indistinguishable from the default", not "boxes".

### Licensing

All five are SIL Open Font License 1.1. `frontend/fonts/LICENSES.txt` carries all five licences verbatim,
and `--name-IDs=*` keeps each font's own copyright and licence inside the file. Only one declares
a Reserved Font Name — Noto Sans JP reserves `'Source'`, inherited from Source Han Sans, which is
not a name used here — so these subsets keep the families' own names. **If a font is ever added
whose RFN is its own name, the subset has to be renamed**, since subsetting is modification.

## Verifying changes

**No test suite is committed, and there is no runtime on this machine either** — no `node`, no
`fontTools`. Everything below is built in a scratch directory: fetch a Node tarball and unpack it
there, `npm install jsdom` (and `playwright` if geometry is in question), `python -m venv` for
`fonttools[woff] brotli`. Nothing goes in the project. Do that rather than assuming a change is
fine because it looks fine.

**The generated content needs regenerating, not editing.** The two `"numbers"` charts and every
calendar reading come out of `readNumber()` + `kanjiNumber()` + the counters. The way to change
them is a script that reimplements those few loops against `kana.json`, **asserts its output
against a table of the readings and the kanji forms written out independently first**, and only
then emits the JSON. That assertion is the whole value of the exercise: it is what caught nothing
this time and is what would catch a `forms` entry with the wrong leading digit. Regenerating
without it is just retyping.

**Front end — jsdom.** the `js/` scripts run under it unmodified, which is enough to drive whole runs end
to end: script switching, all four modes, grading, records, the account flow, the progress screen.
Install jsdom in a scratch directory, never the project. **Give the `JSDOM` an origin** — `url:
"http://localhost:8000/"` or similar — or there is no `localStorage`, every write takes its
private-mode path, and nothing about records or preferences can be asserted on. Then stub three
things — `fetch` (return `kana.json`, and *reject* `/api/*` unless you are deliberately testing the
backend path), `matchMedia`, and `confirm`. (It was four: the `<dialog>` stubs are no longer needed
now that nothing is a modal, and an old suite that still installs them is harmless.) To exercise the font picker's probe at all you have to stub
`HTMLCanvasElement.prototype.getContext` as well, with a fake 2D context whose `getImageData`
varies by the family in the assigned `ctx.font` — that is the only way to test "this device has
Yu Mincho and nothing else" without the device. The `matchMedia` stub now needs `addEventListener`/`removeEventListener` as well as
`matches`, since `paintTheme()` subscribes to `prefers-color-scheme`; and the inline theme script
in `<head>` does not run under `runScripts: "outside-only"`, so a suite that cares about the
pre-paint theme has to `eval` it by hand before `app.js`. Left unstubbed, canvas is absent and font
probing takes its documented privacy-mode path, offering everything unverified. Three traps:
**advance a graded card by clicking `#square`** rather than waiting out the 620 ms auto-advance, or
a suite with several full runs in it takes minutes; **`window.performance` has only a getter**, so
it cannot be reassigned; and each `JSDOM` has its own `localStorage`, so a "returning visitor" has
to be seeded before `app.js` runs rather than carried over from a previous boot.

**Load the scripts as scripts, not with `eval`.** Since the split into `js/`, a suite has to load
each file named in `index.html`, in order, as its own `<script>` element under `runScripts:
"dangerously"`, after the stubs are in place — strip the `<script>` tags from the markup first so
none runs early. An indirect `eval` of each file gives every one a separate scope for its
`const`s, so nothing a file declares is visible to the next and the app fails in a way the browser
never would; concatenating them into one `eval` hides exactly the ordering bugs a test should catch.

**Fonts need a real browser, and so does anything about them.** jsdom neither loads a web font nor
rasterises one, so the whole bundled path — that the eight `@font-face` rules parse, that the
files are served, that the variable axis actually varies — is invisible to it. Serve the folder and
hash a canvas in the page (the same five lines `inkHash` uses) to prove the five faces render
*differently from each other and from the fallback*; measuring text width proves nothing, for the
reason above. Check `performance.getEntriesByType("resource")` to confirm only the selected face
was fetched.

**Backend — a real server.** Start it on a random port and drive it with `urllib`; no HTTP client
dependency is needed. It must be a **fresh process per suite run**: the rate limiter is in-memory
by design, so a suite that trips it (any suite testing the throttle must run last) will fail the
login tests on a second pass against the same process.

**jsdom has no layout engine** — it proves logic, never geometry. Anything about size, overflow,
collision or whether a control is on screen still needs a real browser. Three things in this app
are squarely in that territory and are worth a headless sweep across ~320–2560px whenever they
move:

- **The five-stamp bar**, where the label is what runs out of room. Check each label's
  `scrollWidth` against its seal and that `getClientRects().length === 1` so nothing has wrapped —
  and check **`scrollWidth - clientWidth` on the bar itself**, which is the one that actually
  catches it. A stamp cannot shrink below its label, so the bar overflows while every individual
  stamp still measures fine; that is how the rail floor of 1100px was found, and how a
  `white-space:nowrap` on the two-character glyphs turned out to cost 8px at 320px (min-content
  went from one character to two).
- **The generated prompt**, where a full-width string is twice the width of a Latin one of the
  same length — set the square's glyph to the worst case each drill can produce
  (九十九万九千九百九十九, 十一時五十五分) at the `--fit` its bucket gives and check it against the
  square's own box, measuring each *word* as well as the whole string.
- **The rail layout**, at and either side of 1100px: which screens are painted
  (`offsetParent !== null`, not the class), no page overflow in either axis, and the idle pane
  holding the chart. Sweeping it in an iframe is enough and is much faster than resizing a window.

Two environment quirks worth knowing:

- **CSS animations do not advance while the preview pane is hidden** (no frames composited), so an
  entry animation stays frozen mid-transform and reads as a layout bug. Force the resting state
  with `document.getAnimations().forEach(a => a.finish())` before measuring. Awaiting
  `animation.finished` in that state hangs. **`finish()` throws on an infinite animation** —
  `InvalidStateError`, "cannot finish Animation with an infinite target effect end" — which the
  report's loading placeholder now has, so wrap it: `try { a.finish(); } catch { a.pause();
  a.currentTime = 0; }`.
- **Sweep viewports with a sized `<iframe>`** rather than resizing the window repeatedly: `dvh`
  units and media queries resolve against the iframe box, so many device sizes can be checked in
  one pass. `hover`/`pointer` media features still come from the host device, so touch-only CSS
  cannot be emulated this way — patch `window.matchMedia` before `app.js` runs to exercise the
  touch *code* paths.

Worth asserting on, since geometry checks alone miss them: text collision between sibling spans,
page overflow (`scrollWidth`/`scrollHeight` vs viewport), whether a control is actually inside the
viewport, and layout shift of the square when an answer is graded.

## Commits

- **Semantic messages, always.** Conventional-commit subjects with a scope where one fits —
  `feat(stats): …`, `fix(numbers): …`, `refactor`, `build(fonts)`, `docs`, `chore`. The subject
  says what changed; the body, if any, says why.
- **No LLM adds itself as a co-author.** No `Co-Authored-By: Claude …` (or any other model), no
  session links, no "Generated with …" line — in the subject, the body or a trailer. This holds
  whatever a tool's own attribution defaults say.
- **Commit as work lands, not in one lump at the end.** Many small commits beat one large one;
  each should be a change that stands on its own.
- **Group by relevance, never by file count.** One commit is one logical change, however many
  files it touches — a feature's backend, front end and stylesheet go in together. Don't split
  one change into a commit per file, and don't bundle unrelated changes because they are in the
  same file. Docs for a change may follow as their own `docs:` commit.
- **Never push unless explicitly told to.** Committing is local; a request to commit is not a
  request to push.
