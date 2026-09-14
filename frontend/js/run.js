/* js/run.js — a run: rendering a card, answering, and the results screen.
   One of the classic scripts index.html loads in order; see CLAUDE.md, "Scripts". */
"use strict";

/* ---------- run ---------- */
function start(deck, cards) {
  state.deck = deck;
  state.flick = deck.flick || null;
  state.numbers = deck.numbers || null;
  state.calendar = deck.calendar || null;
  state.isDrill = Boolean(cards);
  // A flick run is generated, not dealt from a deck; a drill of one narrows
  // the generator to the groups that were missed. A drill is a plain shuffle
  // whatever the deck: balancing a handful of cards says nothing, and a drill
  // of five misses that all came from one category has no other category to
  // interleave with.
  state.queue = state.flick
    ? flickQueue(state.flick, (cards || []).map((c) => c.flick.group))
    : cards && cards.length ? shuffle(cards)
    // A number drill is generated too, but a drill of one is just its misses
    // dealt again — the cards above — so this sits below that branch, where
    // flick's sits above it.
    : state.numbers ? numberQueue(deck)
    : state.calendar ? calendarQueue(deck)
    : deck.mix ? mixedQueue(deck)
    : shuffle(deck.cards);
  state.i = 0;
  state.answered = 0; state.correct = 0;
  state.streak = 0; state.bestStreak = 0;
  state.missed = [];
  state.answers = [];
  state.kbDismissed = false;   // a fresh run always offers the keyboard
  store.write({ deck: deck.id });

  el.playMark.textContent = deck.sample;
  el.playLabel.textContent = deck.label + (state.isDrill ? " · drill" : "");
  show(el.play);
  startClock();
  render();
}

// Every graded answer, with how long the card was on screen. The server
// decides what to do with an implausible time; the client just reports it.
function logAnswer(c, given, correct, revealed) {
  state.answers.push({
    // `key` is what a card is *about* where that isn't its prompt: a number
    // asked both ways is one thing you either know or don't, and the report
    // should say "you are slow on 8", not rank "8" against "hachi".
    q: String(c.key || c.q).slice(0, 16),
    a: String(c.a).slice(0, 64),
    given: given == null ? null : String(given).slice(0, 64),
    correct: Boolean(correct),
    revealed: Boolean(revealed),
    ms: Math.round(Math.max(0, performance.now() - state.cardAt))
  });
}

function render() {
  const c = card();
  state.graded = false;
  clearTimeout(state.timer);
  state.cardAt = performance.now();

  // A number or a calendar run is one of the three modes like a deck is;
  // only the flick drills sit outside them.
  const numbering = state.numbers !== null;
  const calendaring = state.calendar !== null;
  const flicking = state.flick !== null;
  const writing = !flicking && state.mode === "write";
  const choosing = !flicking && state.mode === "choose";
  // The generated drills ask in whichever script the Prompt setting says —
  // 二十日 or "hatsuka", 六 or "roku". Writing is untouched by it: that
  // direction asks with the identity and answers in kana.
  const reading = state.prompt === "reading";
  const text =
    // a weekday keeps its kanji on the Reading prompt: the reading is its answer
    calendaring ? (writing ? c.cal.ask : reading && c.cal.kind !== "week" ? c.cal.reading : calFace(c)) :
    numbering ? (writing ? c.num.ask : reading ? c.num.reading : c.num.kanji) :
    flicking ? c.q : writing ? c.a : c.q;
  // Latin prompt in every case but reading Japanese. Both generated subjects
  // read the same way round: Typing and Choosing show the kanji — 六, 二十日,
  // 月曜日 — and answer with what it stands for, and Writing shows that and
  // answers in kana. So only Writing is Latin here, and for a weekday, whose
  // identity is a word rather than a number, only Writing's prompt is.
  const latinPrompt = calendaring
    ? (writing ? c.cal.askLang === "en" : reading && c.cal.kind !== "week")
    : numbering ? (writing || reading)
    : flicking || writing;

  el.square.classList.remove("is-correct", "is-wrong", "is-graded");
  el.glyph.textContent = text;
  el.glyph.lang = latinPrompt ? "en" : "ja";
  // Two kana in the square — きゃ — and not two of anything else: a generated
  // prompt is long by nature and sizes itself through --fit just below.
  el.glyph.classList.toggle("is-pair",
    !latinPrompt && !numbering && !calendaring && text.length > 1);
  el.glyph.classList.toggle("is-romaji", latinPrompt);
  // Nothing else in the app has a prompt that runs from one character to
  // forty-five, so a generated prompt is the one that picks its own size —
  // measured off what is actually on screen, which differs by mode.
  el.glyph.classList.toggle("is-number", numbering || calendaring);
  el.glyph.style.setProperty("--fit",
    numbering || calendaring ? numFit(text) : "");
  el.feedback.textContent =
    calendaring ? calAsk()[answersReading()
      ? (choosing ? "sayChoose" : "sayType") : state.mode] :
    numbering ? numAsk()[state.mode] :
    flicking ? (state.flick === "vowel"
                  ? "Any character that ends in this vowel."
                  : "Any character from this key.") :
    state.mode === "type"   ? "Type the sound this character makes." :
    state.mode === "choose" ? "Pick the sound this character makes."
                            : writeAsk();

  el.mProgress.innerHTML = (state.i + 1) + "<small>/" + state.queue.length + "</small>";
  updateStats();

  // Typing a number answers in digits, and so does typing a month or a date,
  // so all three take the numeric field where a deck takes the romaji one — a
  // weekday answers with its English name and takes the romaji field like a
  // deck. Writing is kana in every case, and Choosing has no field at all.
  const typing = !flicking && !writing && !choosing;
  const keypad = numericAnswer();
  el.typeMode.classList.toggle("hidden", !typing || keypad);
  el.numberMode.classList.toggle("hidden", !typing || !keypad);
  el.writeMode.classList.toggle("hidden", !kanaAnswer());
  el.chooseMode.classList.toggle("hidden", !choosing);
  // reveal and the hint row belong to the two typing modes only
  el.typedTools.classList.toggle("hidden", choosing);
  el.revealBar.classList.toggle("hidden", choosing);

  if (choosing) {
    const stale = el.chooseTools.querySelector(".btn");
    if (stale) stale.remove();
    el.chooseHint.classList.remove("hidden");
    buildChoices(c);
  } else {
    // the IME reminder has to survive on touch, where the keyboard hint is
    // deliberately suppressed — hence the different class
    // The IME reminder has to survive on touch, where the keyboard hint is
    // deliberately suppressed — hence the different class. A generated drill
    // takes romaji as well, and says so: without that line the mode looks
    // broken on a machine with no Japanese input installed.
    const ime = kanaAnswer();
    const either = ime && (numbering || calendaring);
    el.typedHint.textContent = !ime ? "Enter ↵ to check"
      : either ? "Kana or romaji" : "Japanese keyboard";
    el.typedHint.className = ime ? "hint hint--ime" : "hint hint--keys";

    const f = typedField();
    f.input.value = "";
    // The keypad is shared by three subjects that want different shapes of
    // number, and the clock is the one whose answer has two parts — say so
    // here rather than in the instruction line, which would be naming the
    // format of the answer right above the question.
    if (keypad) {
      const clock = state.calendar === "time";
      el.numInput.placeholder = clock ? (state.deck.meridiem ? "hh:mm, 24-hour…" : "h:mm…")
        : "digits…";
      el.numInput.setAttribute("aria-label",
        clock ? "Type the time in digits" : "Type the number in digits");
    }
    f.submit.textContent = "Check";
    // Never disable or blur the field: on a phone that dismisses the
    // keyboard between every card. state.graded gates input instead.
    // Focus every card unconditionally — only refocusing when focus happened
    // to still be in the box meant tapping the box again for every single
    // character on a phone.
    focusField(f.input);
  }
}

// Writing asks with the sound alone, and across scripts a sound is not enough
// to identify a character: か and カ are both "ka". A deck that spans both
// therefore names the one it wants rather than leaving it to be guessed, and
// writeAccepts() holds the answer to the same scope. A deck inside one script
// — including Mixed hiragana — has nothing to disambiguate and says nothing.
function writeAsk() {
  if (state.numbers) return numAsk().write;
  if (state.calendar) return calAsk().write;
  const g = cardGroup(card());
  return state.deck.spansScripts && g.script
    ? "Write the " + g.script + " for this sound."
    : "Write the character for this sound.";
}

// preventScroll: the stage is height-capped, so a focus that scrolls the page
// drags the dock out from under the keyboard
function focusField(input) {
  if (TOUCH && state.kbDismissed) return;      // they closed it on purpose
  if (document.activeElement === input) return; // already there — don't churn
  try { input.focus({ preventScroll: true }); }
  catch (e) { input.focus(); }
}

/* The on-screen keyboard follows focus, so anything that takes focus off the
   answer field closes it — and the refocus on the next card opens it again,
   which reads as the keyboard flickering between every card. Tapping the
   square to continue, Check, and Reveal all did exactly that.

   preventDefault on the press stops the control taking focus in the first
   place, so focus never leaves the field and the keyboard simply never moves.
   The click still fires; this only suppresses the focus side effect.

   Both pointerdown and mousedown are guarded: whichever one a browser treats
   as the focus trigger has to be the one prevented, and preventing the other
   as well is harmless. Neither suppresses the click. */
function keepKeyboard(node) {
  const hold = (e) => {
    if (state.mode === "choose") return;   // nothing is focused to protect
    e.preventDefault();
  };
  node.addEventListener("pointerdown", hold);
  node.addEventListener("mousedown", hold);
}

// A blur that survives the guards above was the user's own doing — the
// keyboard's hide key, or a tap somewhere we don't own. Respect it and stop
// forcing the keyboard back up until they put the caret in a field again.
function noteBlur() {
  if (!TOUCH) return;
  // Leaving the play screen moves focus by itself — that is the app's doing
  // and not a decision to put the keyboard away, so it must not be recorded
  // as one. (It was `a sheet is open` while these were dialogs.)
  if (el.play.classList.contains("hidden")) return;
  state.kbDismissed = true;
}

function buildChoices(c) {
  // Numbers have no deck of cards to draw distractors from, so they are
  // generated: the same value with one digit changed or two swapped. Drawing
  // any four numbers would make the option obvious from its length alone —
  // "roku" beside 6, 400 and 12,000 is not a question about the reading.
  // The calendar generates its distractors too: the dates either side of this
  // one, or the rest of the week. Four dates drawn at random would be
  // answerable from the length of the reading alone.
  if (state.calendar) {
    // `kind`, never `n`: a weekday and a clock time both carry null there,
    // one because it is not counted and the other because it is counted twice
    const near = c.cal.kind === "week"
      ? shuffle((CAL.weekdays || []).filter((w) => w.en !== c.cal.ident))
          .map((w) => w.en)
      : c.cal.mer
      // the other half of the day stays first, so slice(0, 3) always keeps it
      ? ((n) => n.slice(0, 1).concat(shuffle(n.slice(1, 6))))(meridiemNeighbours(state.deck, c))
      : c.cal.kind === "time"
      ? shuffle(timeNeighbours(state.deck, c.cal.h, c.cal.m).slice(0, 6))
      : shuffle(calNeighbours(c.cal.n, calPool(state.deck)).slice(0, 6))
          .map(String);
    // Under 9月 the options are how the same neighbours are said, built as
    // cards of their own so the readings come from the same composition.
    const reads = answersReading();
    const said = (ident) => c.cal.kind === "week"
      ? CAL.weekdays.find((x) => x.en === ident).r     // a weekday's reading is its entry's own
      : calendarCard(state.deck,
          c.cal.kind === "time" ? timeEntry(state.deck, ident) : { n: Number(ident) }).cal.reading;
    buildChoiceButtons(shuffle(near.slice(0, 3)
      .map((a) => ({ a: reads ? said(a) : a }))
      .concat({ a: choiceAnswer(c) })), c);
    return;
  }

  if (state.numbers) {
    const taken = new Set([c.a]);
    const pool = [];
    shuffle(numNeighbours(c.num.n)).forEach((v) => {
      const label = fmtDigits(v);
      if (pool.length >= 3 || taken.has(label)) return;
      taken.add(label); pool.push({ a: label });
    });
    buildChoiceButtons(shuffle(pool.concat({ a: c.a })), c);
    return;
  }

  // Distractors come from the same deck so the options stay plausible, and are
  // deduped by reading — じ and ぢ are both "ji", so picking cards blindly
  // would render two identical buttons. (The dedupe is also why the mixed
  // deck needs nothing special for the other half of that collision: カ is
  // dropped as a duplicate reading when the prompt is か.)
  //
  // "The same deck" is 214 cards across both scripts and every category once
  // the mixed deck is running, and a one-mora prompt beside three yōon
  // readings answers itself. So the draw starts inside the prompt's own
  // category and widens to the rest of the deck only if that can't spare
  // three distinct readings. Everywhere else the category is the deck, and
  // nothing about this changes.
  const taken = new Set([c.a]);
  const pool = [];
  const take = (from) => shuffle(from).forEach((x) => {
    if (pool.length >= 3 || taken.has(x.a)) return;
    taken.add(x.a); pool.push(x);
  });
  take(cardGroup(c).cards);
  if (pool.length < 3) take(state.deck.cards);
  buildChoiceButtons(shuffle(pool.concat(c)), c);
}

// Shared by both draws above: an option is anything with an `a`, and `a` is
// what pick() grades against, so a generated number option needs nothing else.
function buildChoiceButtons(opts, c) {
  el.choices.innerHTML = "";
  opts.forEach((o, idx) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "choice" + (numericAnswer() ? " choice--num" : "");
    b.dataset.a = o.a;
    b.innerHTML = '<span class="choice__key">' + (idx + 1) + "</span>" + o.a;
    b.addEventListener("click", () => pick(b, o, c));
    el.choices.appendChild(b);
  });
}

function updateStats() {
  el.mStreak.textContent = state.streak;

  // live accuracy, with your best for this deck alongside it as the target
  const pct = state.answered
    ? Math.round(state.correct / state.answered * 100) + "%"
    : "—";
  const best = state.deck && !state.isDrill ? store.best(state.deck.id, activeMode()) : 0;
  el.mAcc.innerHTML = pct +
    (best ? '<span class="metric__best">' + best + "%</span>" : "");

  el.barFill.style.width = (state.i / state.queue.length * 100) + "%";
}

/* ---------- answering ---------- */
function submitTyped() {
  if (state.graded) { next(); return; }
  const c = card();

  // Numbers, in whichever of the two typed modes. Writing takes the kana and
  // accepts every reading the value has — 4 is よん or し — while Typing takes
  // the digits and drops anything that is not one, so 1,000,000 and 1000000
  // are the same answer.
  // The calendar, in whichever of the two typed modes. Writing takes the kana
  // and accepts every reading the value has — 17日 is juushichinichi or
  // juunananichi — while Typing takes the identity, which is the number for a
  // month or a date and the English name for a weekday.
  if (state.calendar) {
    const field = typedField().input;
    let value, right;
    if (state.mode === "write") {
      value = normKana(field.value);
      if (!value) return;
      // kana if there is an IME, romaji if there isn't — the prompt is 20日,
      // so はつか and "hatsuka" are both answers to it rather than echoes
      right = numKanaAccepts(c.cal.parts, value) ||
              numRomajiAccepts(c.cal.parts, normRomaji(field.value));
    } else if (answersReading()) {
      // 9月 on the square: the value is showing, so the answer is how it is
      // said — romaji from a plain keyboard, or kana if an IME is to hand
      value = field.value.trim();
      if (!value) return;
      right = numRomajiAccepts(c.cal.parts, normRomaji(value)) ||
              numKanaAccepts(c.cal.parts, normKana(value));
    } else if (c.cal.kind === "time") {
      // the digits either way — "3:45" and "345" are one answer, because a
      // numeric keypad cannot type the colon the identity is written with
      value = normDigits(field.value);
      if (!value) return;
      const t = readClock(value);
      right = Boolean(t) && t.h === c.cal.h24 && t.m === c.cal.m;
    } else {
      value = normDigits(field.value);
      if (!value) return;
      right = Number(value) === c.cal.n;
    }
    logAnswer(c, value.slice(0, 64), right, false);
    if (right) markCorrect(); else markWrong(c, false);
    return;
  }

  if (state.numbers) {
    const field = typedField().input;
    if (state.mode === "write") {
      const value = normKana(field.value);
      if (!value) return;
      const right = numKanaAccepts(c.num.parts, value) ||
                    numRomajiAccepts(c.num.parts, normRomaji(field.value));
      logAnswer(c, value.slice(0, 64), right, false);
      if (right) markCorrect(); else markWrong(c, false);
    } else {
      const value = normDigits(field.value);
      if (!value) return;
      const right = Number(value) === c.num.n;
      logAnswer(c, value, right, false);
      if (right) markCorrect(); else markWrong(c, false);
    }
    return;
  }

  if (state.flick) {
    const value = normKana(el.kanaInput.value);
    if (!value) return;
    const right = flickAccepts(c, value);
    logAnswer(c, value, right, false);
    if (right) markCorrect(value);
    else markWrong(c, false, value);
    return;
  }

  if (state.mode === "write") {
    const value = normKana(el.kanaInput.value);
    if (!value) return;
    const right = writeAccepts(c, value);
    logAnswer(c, value, right, false);
    if (right) markCorrect(value);
    else markWrong(c, false);
    return;
  }

  const value = norm(el.input.value);
  if (!value) return;
  const right = accepts(c, value);
  logAnswer(c, value, right, false);
  if (right) markCorrect();
  else markWrong(c, false);
}

function pick(btn, opt, c) {
  if (state.graded) return;
  Array.from(el.choices.children).forEach((b) => { b.disabled = true; });
  const want = state.calendar ? choiceAnswer(c) : c.a;
  logAnswer(c, opt.a, opt.a === want, false);
  if (opt.a === want) {
    btn.classList.add("is-picked-ok");
    markCorrect();
  } else {
    btn.classList.add("is-picked-no");
    const right = Array.from(el.choices.children).find((b) => b.dataset.a === want);
    if (right) right.classList.add("is-answer");
    markWrong(c, false);
  }
}

function reveal() {
  if (state.graded) return;
  logAnswer(card(), null, false, true);
  markWrong(card(), true);
}

function markCorrect(typed) {
  const c = card();
  state.answered++; state.correct++;
  state.streak++;
  state.bestStreak = Math.max(state.bestStreak, state.streak);
  state.graded = true;

  // credit the character actually written when it is the deck's other reading
  // of the same sound, so the confirmation isn't about a kana they didn't type
  const shown = typed && typed !== normKana(c.q) ? typed : c.q;

  el.square.classList.add("is-correct", "is-graded");
  // A number is always confirmed the same way round — digits, then kana, then
  // reading — whichever direction it was asked in. The pair is the fact worth
  // repeating; which half was on the card is not.
  el.feedback.innerHTML = state.calendar
    ? '<span class="ok">Correct — ' + calSays(c) + '<b lang="ja">' +
      c.cal.kana + '</b> “' + c.cal.reading + '”.</span>'
    : state.numbers
    ? '<span class="ok">Correct — ' + numSays(c) + '<b lang="ja">' +
      c.num.kana + '</b> “' + c.num.reading + '”.</span>'
    : state.flick
    ? '<span class="ok">Correct — <b lang="ja">' + shown + "</b> " +
      (state.flick === "vowel" ? "ends in " : "is on ") + c.q + ".</span>"
    : '<span class="ok">Correct — <b lang="ja">' + shown +
      '</b> is “' + c.a + '”.</span>';
  updateStats();
  state.timer = setTimeout(next, revealDelay());
}

function markWrong(c, viaReveal, typed) {
  state.answered++;
  state.streak = 0;
  state.graded = true;
  if (!state.missed.includes(c)) state.missed.push(c);

  el.square.classList.remove("is-correct");
  el.square.classList.add("is-wrong", "is-graded");

  const tail = TOUCH ? "Tap to continue."
    : !choosingNow() ? "Press Enter to continue." : "";

  if (state.calendar) {
    el.feedback.innerHTML =
      (viaReveal ? "" : '<span class="no">Not quite. </span>') +
      calSays(c) + '<b lang="ja">' + c.cal.kana + '</b> “<span class="no">' +
      c.cal.reading + '</span>”. ' + tail;
  } else if (state.numbers) {
    el.feedback.innerHTML =
      (viaReveal ? "" : '<span class="no">Not quite. </span>') +
      numSays(c) + '<b lang="ja">' + c.num.kana + '</b> “<span class="no">' +
      c.num.reading + '</span>”. ' + tail;
  } else if (state.flick) {
    // name what they actually typed, so a wrong answer teaches where that
    // character really sits rather than only restating the prompt
    const info = typed ? kanaInfo(typed) : null;
    const got = !typed ? ""
      : !info ? '<b lang="ja">' + typed + "</b> isn’t a character this keyboard makes. "
      : '<b lang="ja">' + typed + '</b> is <span class="no">' +
        (state.flick === "vowel"
          ? (info.vowel || "?").toUpperCase()
          : keyLabel(info.key)) + "</span>, not " + c.q + ". ";
    el.feedback.innerHTML =
      (viaReveal ? "" : '<span class="no">Not quite. </span>') + got +
      "Try " + '<b lang="ja">' + c.a + "</b>. " + tail;
  } else {
    const readings = [c.a].concat(c.alt || []).join(" / ");
    el.feedback.innerHTML =
      (viaReveal ? "" : '<span class="no">Not quite. </span>') +
      '<b lang="ja">' + c.q + '</b> is “<span class="no">' + readings + '</span>”. ' + tail;
  }

  updateStats();

  if (!choosingNow()) {
    const f = typedField();
    // show the answer in the field the user was answering in: a worked example
    // for flick, the kana when writing, the romaji when typing
    f.input.value = state.flick ? c.a.split(" ")[0]
      : state.numbers ? (state.mode === "write" ? c.num.kana : c.num.digits)
      : state.calendar ? (state.mode === "write" ? c.cal.kana
                            : answersReading() ? c.cal.reading : c.cal.ident)
      : state.mode === "write" ? c.q : c.a;
    focusField(f.input);
    // selecting shows drag handles on a phone, which reads as an invitation
    // to edit an answer that is already graded
    if (!TOUCH) f.input.select();
    f.submit.textContent = "Next →";
  } else {
    el.chooseHint.classList.add("hidden");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn--primary";
    b.textContent = "Continue →";
    b.addEventListener("click", next);
    el.chooseTools.appendChild(b);
    b.focus();
  }
}

function next() {
  clearTimeout(state.timer);
  state.graded = false;
  state.i++;
  if (state.i >= state.queue.length) { finish(); return; }
  render();
}

/* ---------- end ---------- */
function finish() {
  stopClock(true);
  reportRun();
  const took = elapsed();
  const pct = state.answered ? Math.round(state.correct / state.answered * 100) : 0;
  const mode = activeMode();
  const isRecord = !state.isDrill && store.setBest(state.deck.id, mode, pct);
  const best = store.best(state.deck.id, mode);
  // A clean sweep is what earns a time; reveals count as misses, so this
  // can't be gamed by rushing.
  //
  // Fast runs count, and there is one records pool. They are quicker by about
  // the stamp delay per card — half a minute over a 50-card deck — so in
  // practice the record ends up being a Fast one. That is a deliberate
  // choice and not an oversight: splitting the pool would mean two "fastest"
  // figures per deck per mode on a screen that already carries two, and
  // refusing the time outright is worse still — it throws away a run you
  // actually did and sat through. If the two ever need comparing, the fix is
  // to stop counting the app's own pause towards the clock, not to start
  // rejecting runs.
  const flawless = !state.isDrill && pct === 100;
  const isFastest = flawless && store.setBestTime(state.deck.id, mode, took);
  const bestMs = state.isDrill ? 0 : store.bestTime(state.deck.id, mode);

  el.endMark.textContent = state.deck.sample;
  el.endLabel.textContent = state.deck.label + " complete";
  el.endScore.textContent = pct + "%";
  el.endSub.textContent =
    state.correct + " of " + state.answered + " right · " + fmtRun(took) +
    " · longest streak " + state.bestStreak;

  // Beside the score: this deck's records *in this mode*, named so the figure
  // can't be mistaken for a different mode's. The accuracy is dropped when it
  // equals this run (first attempt, new record, exact tie) — repeating the same
  // number twice says nothing. Drills are a handful of cards, so no records.
  const parts = [];
  if (!state.isDrill && best > 0 && best !== pct) parts.push("<b>" + best + "%</b>");
  // written the way the run's own time above is, rounded or exact
  if (bestMs && !isFastest) parts.push("<b>" + fmtRun(bestMs) + "</b>");
  el.endBestChip.classList.toggle("hidden", !parts.length);
  if (parts.length) {
    el.endBestChip.innerHTML = modeLabel(mode).toLowerCase() + " best " + parts.join(" · ");
  }

  const news = [];
  if (isRecord) news.push("New " + modeLabel(mode) + " best for this " +
    (state.flick ? "drill." : "deck."));
  if (isFastest) news.push(isRecord ? "Fastest clean run too." : "Fastest clean run yet.");
  el.endBest.classList.toggle("hidden", !news.length);
  el.endBest.textContent = news.join(" ");

  // Unique misses, back in chart order. A flick run has no deck to order by,
  // and the same prompt recurs through the run as separate cards, so its
  // misses are collapsed by group instead.
  // Unique misses, back in the order the material has. A flick run has no
  // deck to order by and the same prompt recurs as separate cards, so its
  // misses collapse by group; a number run has no cards either, but every
  // value appears once and counting order is the order that means something.
  const missed = state.flick
    ? state.missed.filter((c, i) =>
        state.missed.findIndex((x) => x.flick.group === c.flick.group) === i)
    : state.numbers
    ? state.missed.slice().sort((a, b) => a.num.ord - b.num.ord)
    // a calendar run has no cards either, and its order is the week's or the
    // month's — `ord` is that, the number for a date and the weekday's place
    // in kana.json for a day of the week
    : state.calendar
    ? state.missed.slice().sort((a, b) => a.cal.ord - b.cal.ord)
    : state.deck.cards.filter((c) => state.missed.includes(c));

  if (missed.length) {
    el.missedBlock.classList.remove("hidden");
    el.missedGrid.innerHTML = "";
    missed.forEach((c) => {
      const d = document.createElement("div");
      // A missed number is reviewed the one useful way round — the value,
      // then how it is said — never as whichever half happened to be asked.
      d.className = "miss" + (state.numbers || state.calendar ? " miss--num" : "");
      // reviewed as the material, not as whichever direction it was asked
      // in: how it is written, then how it is said
      d.innerHTML = state.calendar
        ? '<span class="miss__k" lang="ja">' + calFace(c) + '</span>' +
          '<span class="miss__r" lang="ja">' + c.cal.kana + "</span>"
        : state.numbers
        ? '<span class="miss__k" lang="ja">' + c.num.kanji + '</span>' +
          '<span class="miss__r" lang="ja">' + c.num.kana + "</span>"
        : '<span class="miss__k" lang="ja">' + c.q + '</span>' +
          '<span class="miss__r">' + c.a + "</span>";
      el.missedGrid.appendChild(d);
    });
    el.drillBtn.classList.remove("hidden");
    el.drillBtn.textContent = "Drill " + missed.length +
      (missed.length === 1 ? " miss" : " misses");
    el.drillBtn.onclick = () => start(state.deck, missed);
  } else {
    el.missedBlock.classList.add("hidden");
    el.drillBtn.classList.add("hidden");
  }

  el.againBtn.textContent = state.flick
    ? "Practice " + FLICK_LEN + " more"     // a fresh random run, not the same one
    // "again" only where it is the same material a second time: the random
    // drill deals twenty it has never asked before.
    : state.numbers === "random" || state.numbers === "math"
      ? "Practice " + state.deck.len + " more"
    // `max` where there is one: a drill of ten asked both ways is "all 10
    // again", not all 20 — the prompts are twenty, the material is ten.
    : state.numbers ? "Practice all " + (state.deck.max || state.deck.len) + " again"
    // the clock deals twenty of 144 faces, so a second run is twenty it has
    // mostly not asked — "again" belongs to the drills that are a fixed set
    : state.calendar === "time" ? "Practice " + state.deck.len + " more"
    : state.calendar ? "Practice all " + state.deck.len + " again"
    : "Practice all " + state.deck.cards.length + " again";
  el.againBtn.onclick = () => start(state.deck);
  show(el.end);
}
