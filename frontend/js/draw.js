/* js/draw.js — Drawing mode: the pad on the square, the stroke data, and a grade as words.
   One of the classic scripts index.html loads in order; see CLAUDE.md, "Scripts". */
"use strict";

/* Drawing is the fourth answer mode: the square asks nothing, the line under it
   says "Draw ka", and the kana is drawn from memory on the square itself. The
   strokes are kept as fractions of the pad, so a resize mid-drawing loses
   nothing, and graded by grade.js against KanjiVG's strokes for that kana.

   Which kana can be drawn is content — the decks kana.json marks "draw" — and
   the stroke data is fetched only once Drawing is chosen or a drawing run
   starts: 133 KB no one else needs. */

const DRAW_URL = "strokes/kana-strokes.json";
let drawRefs = null;              // kana → flat strokes, once loaded
let drawLoading = null;           // the fetch in flight, shared by every caller
const drawScripts = new Map();    // kana → the same-script kana it is measured against
const drawStrokes = [];           // the drawing on screen: [{x, y}] per stroke, 0–1 of the pad
let drawActive = null;            // the stroke under the pointer

const canDraw = (c) => Boolean(c && drawScripts.has(c.q));
const drawableCards = (deck) => (deck && deck.cards ? deck.cards.filter(canDraw) : []);
const drawingNow = () => !state.flick && isDrawMode(state.mode);
const tracingNow = () => !state.flick && state.mode === "trace";

function loadStrokes() {
  if (drawRefs) return Promise.resolve(drawRefs);
  if (!drawLoading) {
    drawLoading = fetch(DRAW_URL, { cache: "no-cache" })
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then((d) => (drawRefs = d.kana))
      .catch((e) => { drawLoading = null; throw e; });
  }
  return drawLoading;
}

/* ---------- the pad ---------- */
function fitPad() {
  const c = el.drawPad, r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
}

// Ink in the theme's own colour, redrawn whole on every change: a kana is a
// handful of strokes, so there is nothing to gain from painting incrementally.
function paintPad() {
  const c = el.drawPad;
  const ctx = c.getContext ? c.getContext("2d") : null;
  if (!ctx) return;            // no canvas: strokes are still recorded and graded
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, c.width * 0.034);
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--c-ink").trim() || "#000";
  drawStrokes.forEach((s) => {
    ctx.beginPath();
    s.forEach((p, i) => {
      const x = p.x * c.width, y = p.y * c.height;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    if (s.length === 1) ctx.lineTo(s[0].x * c.width + 0.5, s[0].y * c.height);
    ctx.stroke();
  });
}

function resetPad() {
  drawStrokes.length = 0;
  drawActive = null;
  state.lastGrade = null;
  drawNote("");
  fitPad();
  paintPad();
}

function padPoint(e) {
  const r = el.drawPad.getBoundingClientRect();
  return { x: (e.clientX - r.left) / (r.width || 1), y: (e.clientY - r.top) / (r.height || 1) };
}

function padDown(e) {
  // once graded, a press on the square is "continue", which the square handles
  if (!drawingNow() || state.graded || (e.button !== undefined && e.button > 0)) return;
  e.preventDefault();
  try { el.drawPad.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
  drawNote("");
  drawActive = [padPoint(e)];
  drawStrokes.push(drawActive);
  fitPad();
  paintPad();
}

function padMove(e) {
  if (!drawActive) return;
  e.preventDefault();
  const p = padPoint(e), last = drawActive[drawActive.length - 1];
  if (Math.hypot(p.x - last.x, p.y - last.y) < 0.004) return;
  drawActive.push(p);
  paintPad();
}

function padUp() { drawActive = null; }

function undoStroke() {
  if (state.graded) return;
  drawStrokes.pop();
  drawActive = null;
  paintPad();
}

function clearDrawing() {
  if (state.graded) return;
  drawStrokes.length = 0;
  drawActive = null;
  paintPad();
}

// A note beside the controls, for a check that could not grade anything —
// never a disabled Check button (see ux-rules.md).
function drawNote(text) {
  el.drawNote.textContent = text;
  el.drawNote.classList.toggle("hidden", !text);
}

/* ---------- asking, checking, telling ---------- */
function drawAsk() {
  const c = card(), g = cardGroup(c);
  const which = state.deck.spansScripts && g.script ? "the " + g.script + " for " : "";
  if (tracingNow()) return "Trace " + which + '<b class="drawask">' + c.a + "</b> over the faint character.";
  return "Draw " + which + '<b class="drawask">' + c.a + "</b> from memory.";
}

function checkDrawing() {
  if (state.graded) { next(); return; }
  const c = card();
  if (!drawStrokes.length) { drawNote("Draw the character first, then check it."); return; }
  loadStrokes().then((refs) => {
    if (state.graded || card() !== c) return;      // moved on while loading
    const g = gradeDrawing(c.q, drawStrokes, refs, drawScripts.get(c.q));
    state.lastGrade = g;
    logAnswer(c, "drawn " + g.score, g.pass, false);
    if (g.pass) markCorrect(); else markWrong(c, false);
  }).catch(() => drawNote("The stroke data couldn't load, so this can't be graded yet. Check the connection and try again."));
}

// The one most useful thing to say about a failed drawing: the kana it looks
// like, a stroke count no joining explains, or how far off the shape is. Never
// stroke order or direction — those are not graded.
function drawVerdict(c, g) {
  if (!g) return "";
  const has = (kind) => g.issues.some((i) => i.kind === kind);
  const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");
  const like = g.issues.find((i) => i.kind === "neighbour");
  if (like) return 'That looks more like <b lang="ja">' + like.like + "</b>.";
  if (has("count")) {
    return (g.drawnCount < g.expected ? "Something's missing" : "There's something extra") +
      ' — <b lang="ja">' + c.q + "</b> is " + plural(g.expected, "stroke") + ", or fewer joined up.";
  }
  if (has("shape")) return "Close, but one stroke is too far from its shape.";
  return "Not close enough yet — " + g.score + "/100.";
}

// The answer, faint behind the ink: once the card is graded, or from the start
// when tracing.
function showGhost(c) {
  el.glyph.textContent = c.q;
  el.glyph.lang = "ja";
  el.glyph.classList.remove("is-romaji", "is-number", "is-pair");
  el.glyph.classList.add("is-ghost");
}

// Called from boot with kana.json's decks.
function initDraw(decks) {
  const byScript = {};
  decks.filter((d) => d.draw).forEach((d) => {
    (byScript[d.script] = byScript[d.script] || []).push(...d.cards.map((c) => c.q));
  });
  Object.values(byScript).forEach((list) => list.forEach((q) => drawScripts.set(q, list)));

  el.drawPad.addEventListener("pointerdown", padDown);
  el.drawPad.addEventListener("pointermove", padMove);
  el.drawPad.addEventListener("pointerup", padUp);
  el.drawPad.addEventListener("pointercancel", padUp);
  el.drawUndo.addEventListener("click", undoStroke);
  el.drawClear.addEventListener("click", clearDrawing);
  el.drawCheck.addEventListener("click", checkDrawing);
  window.addEventListener("resize", () => { if (drawingNow()) { fitPad(); paintPad(); } });
  if (isDrawMode(state.mode)) loadStrokes().catch(() => {});
}
