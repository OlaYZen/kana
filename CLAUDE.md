# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

> The front end is four static files plus a folder of fonts, and works on its own — no build step,
> no bundler, nothing to install, and nothing fetched from anyone else's server. The backend in
> `backend/` is **optional**: it adds accounts, server-side saves and the progress report, and if
> nothing answers `/api/health` the app hides all of that and runs exactly as it did before it
> existed. Don't make it a hard dependency.

`kana` — a Japanese kana (hiragana/katakana) recognition drill.

| File | Role |
|---|---|
| `index.html` | markup only — six screens (`#menu`, `#auth`, `#stats`, `#play`, `#end`, `#fatal`) plus three `<dialog>` sheets (`#moreSheet`, `#fontSheet`, `#chartSheet`); `#play` holds one answer block per mode (`#typeMode`, `#writeMode`, `#chooseMode`) |
| `styles.css` | the entire stylesheet, mobile-first |
| `kana.json` | **all content** — `fonts[]`, `charts[]`, `decks[]`, `mixed`. No kana or font names live in JS or CSS |
| `app.js` | all front-end logic, one IIFE, sectioned by `/* ---------- name ---------- */` banners |
| `icon.svg` | the app icon, and the source the `.ico` is generated from — see **The icon** |
| `favicon.ico` | six sizes rasterised from `icon.svg`; what `<link rel="icon">` points at |
| `fonts/` | the five bundled Japanese faces, subset to kana, plus `LICENSES.txt` and the `subset.py` that regenerates them — see **Bundled fonts** |
| `start.sh` | install / update / run, executable in git (mode `100755`) |
| `backend/` | the optional FastAPI server |

That plus `README.md` and this file is the whole repository. Three superseded standalone pages —
`hiragana-game.html`, `katakana-game.html` and `kana-chart.html`, near-identical predecessors of
the drill and the chart — were deleted; they are in git history at `3ece9c6` if one is ever
needed. Don't reintroduce a second copy of the game: they drifted out of sync with the real app
the moment they stopped being loaded.

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
python -m http.server 8000   # front end only, no accounts
```

`start.sh` is idempotent: it only pulls when the tree is clean, only reinstalls when
`requirements.txt`'s hash changed, and FastAPI serves the static files itself, so there is one
origin and no CORS.

It binds **0.0.0.0** by default and prints the LAN address, because the flick drills only exist on
a touch device — testing them means opening the app on a phone, and a loopback-only bind makes
that impossible. The cost is that the whole network can reach it over plain HTTP; `--host
127.0.0.1` is the way back.

Kana glyphs no longer need a CJK-capable font on the host: five faces ship in `fonts/`. The
device's own faces are still used where it has them, and are still what renders anything outside
the subset — see **Bundled fonts**.

## Architecture

**`kana.json` is the single source of content and `app.js` is script-agnostic** — it renders
whatever deck it is handed. Adding or changing decks, cards, accepted romanisations, chart layout
or font options is a JSON edit, never a code edit. Keys prefixed `//` (`"//fonts"`, `"//charts"`,
`"//mixed"`) are prose comments for the section that follows; JSON has no comment syntax and
`app.js` ignores them. Keep them current when the shape they describe changes.

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
- mixed: `{id, label, sample, subtitle, note}` — the everything-deck's identity only. It has **no
  `cards` and no `script`**, both deliberately; see **The mixed deck** below.

**Colour** is washi paper throughout — cream ground, ink text, vermilion seal accent — defined
once in `:root` (`--paper*`, `--c-ink*`, `--shu`, `--brass`, `--matcha`). The accents are
deliberately darker than a dark theme's would be: the same red/gold/green at "glowing on indigo"
lightness fails contrast on cream. Nothing re-themes wholesale — the chart sheet and the menu only
re-point `--accent`, flipping shu-red/indigo-blue via `[data-script]`.

**The dark theme is one more block of custom properties**, `:root[data-theme="dark"]`, and nothing
else. It re-declares the palette rather than inverting it — the same paper at night, sumi ground
and warm off-white ink, with every accent opened up in lightness because the sentence above cuts
both ways. Three rules follow from that and are what keep it to one block:

- **No literal colour may appear below the two `:root` blocks.** A literal can only be right in one
  theme. That includes the translucent ones, which is what `--press`, `--backdrop`, `--on-fill`,
  `--paper-lift`, `--square-bg` and the three `--shadow-*` values exist for. Shu-derived washes use
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

**The mixed deck is a seventh deck built from those six**, not a seventh list of cards.
`kana.json`'s `mixed` block carries its identity and nothing else; `buildMixedDeck()` fills in the
cards at boot from every deck in the file, and holds **the same card objects**, not copies. That
identity is load-bearing twice — `state.missed.includes(c)` and the chart-order review on the
results screen are both `===` comparisons — and its cost is the rule that nothing walking every
card in the app may ever be handed this deck, or each character is counted twice. `state.decks`
therefore stays the six decks `kana.json` lists, `state.mixed` is kept beside it, and `allDecks()`
is what the three places that mean "every deck the menu can start" use. Building it *after*
`buildFlickIndex()` in boot is part of the same rule.

Four things follow from it having no `script`:

- **It is listed under both seal stamps** — `buildMenu()` and the progress screen's `forScript()`
  both read a missing script as "belongs to neither, so show it under either", which is the rule
  the flick drills were already using. It sorts last because it is appended last.
- **It records once.** The deck id is `mixed` under either stamp, so `recordKey()` gives one
  `mixed|type`, one report, one history. Listing it twice while recording once is the whole point;
  a script-flavoured id would silently split the figures in half.
- **Runs post with `script: null`.** The backend column is already nullable and nothing needs to
  change there — see the analytics note below for why this isn't a hole in "every deck is its own
  dataset".
- **Writing has to name the script in the prompt.** か and カ are both "ka", so a romaji prompt is
  ambiguous in a way it never is inside one script. `writeAsk()` says which, and `writeAccepts()`
  is scoped to match — see the invariants.

**The deal is balanced, not shuffled**, and that is why the deck can't be replaced by concatenating
the six and calling `shuffle()`. Each source deck is a *category*; each is shuffled on its own, and
`mixedQueue()` then deals from them under one rule — never more than `MIX_RUN` (2) consecutive
cards from the same category. Every character still appears exactly once per run; this decides
order alone, and nothing is sampled or dropped. Three parts of it are easy to get wrong:

- **Which category to take from is drawn at random, weighted by what it has left** — not
  round-robin, which turns the run into a visible rotation, and not "largest pile first", which is
  the same rotation with extra steps.
- **`mixFits()` is checked before every take, not repaired afterwards.** Weighted choice empties
  the piles at roughly the same rate but not exactly, so whichever pile is left over at the end has
  nothing to alternate with and the last dozen cards all come from it. The arithmetic: *m* cards of
  one category need the other *r* as separators, which open *r+1* gaps of at most `MIX_RUN` each,
  so *m* ≤ `MIX_RUN` × (*r*+1), less whatever a run already under way has eaten from the first gap.
- **The no-candidates fallback deals the biggest pile anyway.** It is unreachable for the deck
  sizes that ship (46 needs 168 others; it has them) and exists for a `kana.json` grown so lopsided
  that no ordering can space it out. Bunching up is the right failure there — dropping cards would
  break "every character exactly once", which is the invariant that actually matters.

Drills of the mixed deck take the plain shuffle instead. Balancing a handful of cards says nothing,
and five misses that all came from one category have nothing to interleave with.

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
chart sheet and reused by `.scriptbar`) filter `#decks` to that script's three decks — plus the
mixed deck, which has no script and so survives either filter — and flip `--accent`
vermilion/indigo via `[data-script]` on `.menu`, mirroring the chart sheet. The chart opens on
whatever the menu is showing.

The same `.scriptbar` markup appears a third time on the progress screen, filtering the deck picker
rather than the deck list. Two things survive both filters: the flick drills, which belong to
neither script, and the mixed deck, which belongs to both.

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
the stamp would give the *wrong* name — `Dakuten hiragana`, `Flick directions` and `Mixed kana`
all sit under the あ stamp. Don't simplify this to "never show the heading"; that case loses the
deck's identity entirely.

**Persistence** is localStorage key `kana.v1` (`STORE` in `app.js`), holding
`{rev, mode, script, deck, font, best, bestTime}`. All writes go through the `store` helper, which
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
list (which scrolls, and holds the flick drills), and one Options button. Answer mode, theme, font,
chart, progress and account all live in `#moreSheet` behind that button — stacked on the menu they took
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
  unrelated material. **The mixed deck is not the exception it looks like**: `mixed` is a deck id
  like any other, and its figures come only from runs of it. What is forbidden is *deriving* a
  cross-deck figure from runs of separate decks; sitting down and practising all 214 in one go is
  a thing you did, and its accuracy and times describe it. Nothing about it feeds the other six
  reports, or is fed by them, and it needs its own three runs.
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
- **"Any card whose `a` matches" means within the card's own category, not the whole deck.** In
  the mixed deck the collision also runs across scripts — か and カ are both `ka` — and every card
  in it has a twin. Scoped to the deck, write mode there would accept hiragana for all 214 and
  stop being a test of katakana at all; scoped to `card().q`, じ/ぢ break again. `cardGroup()` is
  the single knob: it returns the source deck for a mixed card and `state.deck` for everything
  else, so the other six decks grade exactly as they always did. The prompt has to say which
  script it wants (`writeAsk()`) or the scoping is just an unwinnable guess — the two ship
  together.
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
- **Never select `.seg__btn` document-wide.** Three switches share the class now — answer mode,
  theme, and the progress screen's device switch. A global query wires `setMode(undefined)` onto
  the others and blanks their `aria-checked` on every mode change. Each has an id of its own for
  exactly this reason: go through `el.modeSwitch` / `el.themeSwitch` / `el.deviceSwitch`. The
  shared *layout* is `.modebar--stack`, which is a layout modifier and not a handle on the mode.
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
- **Choose-mode distractors are drawn from the prompt's category first.** Over the mixed deck's
  214 cards a plain draw puts three yōon readings beside a one-mora prompt, and the option answers
  itself; the score stops measuring anything. The widen-to-the-whole-deck fallback is only reached
  when a category can't spare three distinct readings, which no shipping deck hits.
- **The mixed deck's cards are the other decks' card objects, not copies.** Put it in
  `state.decks` and `chartReadings()`, `buildFlickIndex()` and every other full sweep sees all 214
  twice. `allDecks()` is for the menu, `deckLabel()` and `forScript()`; `state.decks` is for
  anything counting characters.
- **`kana.json` is fetched with `cache: "no-cache"`.** Without it the HTTP cache silently serves a
  stale deck file and edits appear to do nothing.

## Bundled fonts

Five of the eight font options ship with the app, in `fonts/`, declared by the `@font-face` block
at the top of `styles.css` and marked `"bundled"` in `kana.json`:

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

**They are subsets, and `fonts/subset.py` is how they are regenerated.** The upstream faces are
3.6–13 MB each because they carry thousands of kanji; cut to what this app renders they are
32–110 KB, 424 KB for all eight files. Three decisions there are load-bearing:

- **The cut is defined by Unicode *ranges*, not by the current contents of `kana.json`.** Every
  kana block is kept whole, so adding a card can never produce tofu — which would otherwise make
  "adding a deck is a JSON edit" quietly false. The one enumerated part is the eighteen kanji of
  interface chrome (設定 記録 五十音 …); `subset.py`'s `check()` re-derives them from the sources
  and fails if the list has drifted, so that can't rot silently.
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

All five are SIL Open Font License 1.1. `fonts/LICENSES.txt` carries all five licences verbatim,
and `--name-IDs=*` keeps each font's own copyright and licence inside the file. Only one declares
a Reserved Font Name — Noto Sans JP reserves `'Source'`, inherited from Source Han Sans, which is
not a name used here — so these subsets keep the families' own names. **If a font is ever added
whose RFN is its own name, the subset has to be renamed**, since subsetting is modification.

## Verifying changes

**No test suite is committed.** Nothing in the repo runs tests, and there is no test runner to
invoke. What follows is how to build one in a scratch directory — do that rather than assuming a
change is fine because it looks fine.

**Front end — jsdom.** `app.js` runs under it unmodified, which is enough to drive whole runs end
to end: script switching, all four modes, grading, records, the account flow, the progress screen.
Install jsdom in a scratch directory, never the project. **Give the `JSDOM` an origin** — `url:
"http://localhost:8000/"` or similar — or there is no `localStorage`, every write takes its
private-mode path, and nothing about records or preferences can be asserted on. Then stub four
things — `fetch` (return `kana.json`, and *reject* `/api/*` unless you are deliberately testing the
backend path),
`HTMLDialogElement.prototype.showModal`/`close` (jsdom implements neither), `matchMedia`, and
`confirm`. To exercise the font picker's probe at all you have to stub
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
