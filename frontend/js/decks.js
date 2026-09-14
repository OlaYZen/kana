/* js/decks.js — derived decks.
   One of the classic scripts index.html loads in order; see CLAUDE.md, "Scripts". */
"use strict";

/* ==========================================================================
   Derived decks

   Decks with no cards of their own, built here from the source decks they
   name in kana.json. Two shapes of them ship: a per-script mix (all three
   hiragana decks, all three katakana decks) and the whole `kana` stamp —
   base, dakuten and yōon each across both scripts, plus everything at once.

   They hold the source decks' *own card objects*, not copies. Identity is
   what `state.missed.includes(c)` and the chart-order review on the results
   screen both rely on. The other side of that is that nothing which walks
   every card in the app — chart readings, the flick index — may ever be
   handed one of these, or it counts characters two and three times over;
   `state.decks` therefore stays the decks kana.json actually lists, and the
   derived ones are kept beside it in `state.derived`.

   Ordering a run is the part that isn't a plain shuffle. Shuffle a source
   deck's worth of cards together and it deals visible clumps — eight yōon,
   then a stretch of katakana base — and a clump is the source deck arriving
   again, which is the one thing these decks exist not to do. So each source
   is a category, each is shuffled on its own, and they are dealt out under a
   single rule: never more than MIX_RUN in a row from the same category.
   Nothing is sampled and nothing is dropped — this decides order alone.
   ========================================================================== */
const MIX_RUN = 2;   // consecutive cards allowed from one category

function buildDerivedDecks(defs) {
  return (defs || []).map((def) => {
    const mix = (def.sources || [])
      .map((id) => state.decks.find((d) => d.id === id))
      .filter(Boolean);
    // One category is not a mix; it would also make mixFits() meaningless.
    // A deck whose sources have gone from kana.json is dropped rather than
    // offered as an empty run.
    if (mix.length < 2) return null;

    const groupOf = new Map();
    const cards = [];
    mix.forEach((d) => d.cards.forEach((c) => { groupOf.set(c, d); cards.push(c); }));

    return {
      id: def.id,
      label: def.label || def.id,
      sample: def.sample || "",
      subtitle: def.subtitle || "",
      note: def.note || "",
      // Placed under a stamp by the same field a real deck uses. "kana" is
      // the third stamp — material that is both scripts at once — and is a
      // script like the other two as far as everything downstream is
      // concerned, which is what keeps the filters single-clause.
      script: def.script || null,
      mix: mix,               // one category per source deck, in listed order
      groupOf: groupOf,
      cards: cards,
      // Whether a romaji prompt is ambiguous here, worked out rather than
      // declared: か and カ are both "ka", so a deck spanning both scripts has
      // to say which it wants. See writeAsk().
      spansScripts: new Set(mix.map((d) => d.script)).size > 1
    };
  }).filter(Boolean);
}

// Every deck the menu can start, real and derived.
// Every deck the menu can start, and the one list the stamp filters run over.
// The number and calendar drills join it because they carry a `script` like
// anything else; they are safe here for the reason the rule below is about —
// they have no `cards` at all, and nothing that counts characters uses this.
const allDecks = () =>
  state.decks.concat(state.derived, NUMBER_DECKS, CALENDAR_DECKS);

/* Can what is left in hand still be laid out under the run limit at all? m
   cards of one category need the others as separators: r of them open r+1
   gaps, each holding at most MIX_RUN, so m has to fit inside MIX_RUN × (r+1).
   A run already under way has eaten into the first of those gaps.

   Checked before every card is taken rather than repaired afterwards, and
   that is what keeps the end of a run honest. Weighted choice empties the
   piles at roughly the same rate but not exactly, and whichever pile is left
   over at the end has nothing to alternate with — so without this the last
   dozen cards of a run would all come from it. */
function mixFits(left, last, run) {
  let total = 0;
  left.forEach((n) => { total += n; });
  return left.every((m, i) =>
    !m || m <= MIX_RUN * (total - m + 1) - (i === last ? run : 0));
}

// Weighted by what each category has left, so the order stays unpredictable
// and the piles run down together instead of one of them outlasting the rest.
function mixPick(open, left) {
  let total = 0;
  open.forEach((i) => { total += left[i]; });
  let r = Math.random() * total;
  for (let k = 0; k < open.length; k++) {
    r -= left[open[k]];
    if (r < 0) return open[k];
  }
  return open[open.length - 1];
}

function mixedQueue(deck) {
  const piles = deck.mix.map((g) => shuffle(g.cards));
  const left = piles.map((p) => p.length);
  const out = [];
  let last = -1, run = 0;

  while (out.length < deck.cards.length) {
    const open = [];
    left.forEach((n, i) => {
      if (!n) return;
      if (i === last && run >= MIX_RUN) return;   // would be three in a row
      left[i]--;
      if (mixFits(left, i, i === last ? run + 1 : 1)) open.push(i);
      left[i]++;
    });
    // mixFits holds at every step and holds for the full deck, so there is
    // nothing open only if kana.json grows a deck so much larger than the
    // rest that no ordering can space it out. Deal the biggest pile rather
    // than dropping cards: the run is still every character exactly once, it
    // just bunches up.
    const pick = open.length
      ? mixPick(open, left)
      : left.reduce((best, n, i) => (n > left[best] ? i : best), 0);
    run = pick === last ? run + 1 : 1;
    last = pick;
    left[pick]--;
    out.push(piles[pick].pop());
  }
  return out;
}
