/* js/grade.js — grading a drawn kana against its reference strokes.
   One of the classic scripts index.html loads in order; see CLAUDE.md, "Scripts".
   Pure functions only: no DOM, no state, so it can be tested on its own. */
"use strict";

/* A drawing is a list of strokes, each a list of {x, y} in any units. A
   reference is the same, from strokes/kana-strokes.json (KanjiVG, CC BY-SA 3.0).
   Both are resampled to GRADE_POINTS points a stroke and normalised by their own
   bounding box — centred, longer side scaled to 1 — so where on the square and
   how big a character was drawn stop mattering, and its proportions do not.

   The question is only "is this the character?" — never "was it written the
   textbook way". Stroke order and stroke direction are not graded:

   1. Same number of strokes as written: every assignment of drawn strokes to
      reference strokes, each either way round, is tried (six strokes at most,
      so 720) and the best one is the shape.

   2. Fewer strokes than written: strokes joined in one movement, which is how
      people write — コ in one stroke. A drawn stroke may stand for several
      written ones in a row when they meet end to end and it is about as long as
      the path they make. The other way, several drawn strokes may stand for one
      written one: a stroke the pen skipped on. What cannot be explained as a
      join is the wrong number of strokes — a dakuten left out has no stroke long
      enough to stand for two.

   3. Shape: mean distance between matched points, as 0–100, and no one stroke
      too far off.

   4. Neighbours: the drawing is measured the same way against every other kana
      of the same script, and one clearly closer wins: "looks more like る".
      Where two kana are the same lines and differ only in which way a stroke
      runs — ソ and ン, シ and ツ — the shape cannot separate them, so there,
      and only there, the direction the strokes were drawn in breaks the tie. */

const GRADE_POINTS = 32;           // per stroke, matching strokes/build.py
const GRADE_PERFECT = 0.06;        // mean distance at or under this scores 100
const GRADE_ZERO = 0.32;           // …at or over this scores 0
const GRADE_PASS = 60;             // score needed to pass
const GRADE_STROKE_LIMIT = 0.36;   // any one stroke further off than this fails
// Another kana this much closer wins. Tuned on synthetic handwriting; see
// CLAUDE.md, "Drawing", for the bench and its figures.
const GRADE_NEIGHBOUR = 0.93;
// Within this of each other, two kana are a tie on shape and direction decides.
const GRADE_TIE = 0.97;
// Written strokes can be joined into one drawn stroke only where one ends
// within this of an end of the next…
const GRADE_JOIN_GAP = 0.2;
// …and only by a drawn stroke this close in length to the path they make.
const GRADE_JOIN_LENGTH = [0.7, 1.45];

// A flat [x, y, x, y, …] reference stroke as points.
const pointsOf = (flat) => {
  const out = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push({ x: flat[i], y: flat[i + 1] });
  return out;
};

const strokeLength = (s) => {
  let len = 0;
  for (let i = 1; i < s.length; i++) len += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
  return len;
};

const reversed = (s) => s.slice().reverse();

// n points evenly spaced along a stroke, ends included.
function resampleStroke(s, n) {
  if (s.length === 0) return [];
  const total = strokeLength(s);
  if (total === 0) return Array.from({ length: n }, () => ({ x: s[0].x, y: s[0].y }));
  const out = [{ x: s[0].x, y: s[0].y }];
  let k = 0, walked = 0;
  for (let m = 1; m < n - 1; m++) {
    const target = total * m / (n - 1);
    let seg = Math.hypot(s[k + 1].x - s[k].x, s[k + 1].y - s[k].y);
    while (walked + seg < target && k < s.length - 2) {
      walked += seg; k++;
      seg = Math.hypot(s[k + 1].x - s[k].x, s[k + 1].y - s[k].y);
    }
    const t = seg ? Math.min(1, (target - walked) / seg) : 0;
    out.push({ x: s[k].x + t * (s[k + 1].x - s[k].x), y: s[k].y + t * (s[k + 1].y - s[k].y) });
  }
  out.push({ x: s[s.length - 1].x, y: s[s.length - 1].y });
  return out;
}

// Centre on the bounding box and scale its longer side to 1.
function normaliseStrokes(strokes) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  strokes.forEach((s) => s.forEach((p) => {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }));
  const size = Math.max(maxX - minX, maxY - minY) || 1;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return strokes.map((s) => s.map((p) => ({ x: (p.x - cx) / size, y: (p.y - cy) / size })));
}

// Mean distance between corresponding points of two strokes of equal length.
function pairDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
  return sum / a.length;
}

// All orderings of 0..n-1, kept once made. n is at most six for any kana.
const permutationCache = [];
function permutations(n) {
  if (permutationCache[n]) return permutationCache[n];
  let out;
  if (n <= 1) out = [Array.from({ length: n }, (_, i) => i)];
  else {
    out = [];
    permutations(n - 1).forEach((p) => {
      for (let i = 0; i <= p.length; i++) out.push(p.slice(0, i).concat(n - 1, p.slice(i)));
    });
  }
  return (permutationCache[n] = out);
}

// Every way to cut n items, in order, into m non-empty runs: [2, 1] is "the
// first two together, then the third".
function compositions(n, m) {
  if (m === 1) return n >= 1 ? [[n]] : [];
  const out = [];
  for (let first = 1; first <= n - m + 1; first++) {
    compositions(n - first, m - 1).forEach((rest) => out.push([first].concat(rest)));
  }
  return out;
}

// Drawn strokes shorter than this share of the drawing's size are stray taps,
// not strokes — except that nothing is dropped if it would leave no stroke.
const TAP = 0.02;

// The strokes worth grading, as drawn: every point kept, since a joined stroke
// is measured against a path several strokes long and needs its corners.
function prepareDrawing(strokes) {
  const raw = strokes.filter((s) => s.length > 0);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  raw.forEach((s) => s.forEach((p) => {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }));
  const size = Math.max(maxX - minX, maxY - minY) || 1;
  const kept = raw.filter((s) => s.length > 1 && strokeLength(s) > TAP * size);
  return (kept.length ? kept : raw).map((s) => (s.length > 1 ? s : [s[0], s[0]]));
}

// References are prepared once each: every check measures against a whole script.
const referenceCache = new WeakMap();
function prepareReference(flatStrokes) {
  if (!referenceCache.has(flatStrokes)) {
    referenceCache.set(flatStrokes, normaliseStrokes(flatStrokes.map((f) => resampleStroke(pointsOf(f), GRADE_POINTS))));
  }
  return referenceCache.get(flatStrokes);
}

/* Equal counts: the best way to lay the drawing over the reference — which
   drawn stroke plays which reference stroke — in any order. `directed` keeps
   every stroke the way it was drawn, which is only ever asked to break a tie. */
function bestMatch(drawn, ref, directed) {
  const n = ref.length;
  const cost = drawn.map((d) => ref.map((r) =>
    directed ? pairDistance(d, r) : Math.min(pairDistance(d, r), pairDistance(reversed(d), r))));
  let best = null;
  permutations(n).forEach((perm) => {
    // perm[j] = which drawn stroke is laid over reference stroke j
    let total = 0, worst = 0;
    for (let j = 0; j < n; j++) {
      const c = cost[perm[j]][j];
      total += c;
      if (c > worst) worst = c;
    }
    if (!best || total < best.total) best = { total, worst };
  });
  return { mean: best.total / n, worst: best.worst };
}

/* How well one stroke stands for several joined into one path: each piece may
   run either way round (never, when `directed`), and each must start within
   GRADE_JOIN_GAP of where the path so far ends. Null when these cannot be one
   movement: a gap too wide to cross without lifting the pen, or a length that
   does not match. */
function joinFit(single, run, directed) {
  if (run.length === 1) {
    const a = resampleStroke(single, GRADE_POINTS), b = resampleStroke(run[0], GRADE_POINTS);
    const d = pairDistance(a, b);
    return directed ? d : Math.min(d, pairDistance(reversed(a), b));
  }
  const k = run.length, n = GRADE_POINTS * k;
  const lenSingle = strokeLength(single);
  const target = resampleStroke(single, n), targetBack = reversed(target);
  let best = null;
  for (let mask = 0; mask < (directed ? 1 : 1 << k); mask++) {
    const path = [];
    let joinable = true;
    for (let i = 0; i < k && joinable; i++) {
      const piece = (mask >> i) & 1 ? reversed(run[i]) : run[i];
      if (path.length) {
        const last = path[path.length - 1];
        if (Math.hypot(piece[0].x - last.x, piece[0].y - last.y) > GRADE_JOIN_GAP) joinable = false;
      }
      path.push(...piece);
    }
    if (!joinable) continue;
    const ratio = lenSingle / (strokeLength(path) || 1);
    if (ratio < GRADE_JOIN_LENGTH[0] || ratio > GRADE_JOIN_LENGTH[1]) continue;
    const along = resampleStroke(path, n);
    const dist = directed ? pairDistance(target, along) : Math.min(pairDistance(target, along), pairDistance(targetBack, along));
    if (best === null || dist < best) best = dist;
  }
  return best;
}

/* Unequal counts: the best way to explain the difference as joins (fewer drawn
   strokes) or as strokes drawn in pieces (more), in any order. The strokes that
   join are ones that follow each other in the writing — コ's two, not its first
   and a dakuten — and so are the pieces, which follow each other in the drawing.
   `denseN` is the drawing with every point it was drawn with, normalised.
   Returns { mean, worst }, or null if no joining explains it. */
function joinedFit(denseN, refN, directed) {
  const joining = denseN.length < refN.length;
  const few = joining ? denseN : refN;          // the side whose strokes stand for runs
  const many = joining ? refN : denseN;         // …and the side cut into runs, in its own order
  const memo = new Map();
  const fit = (i, at, size) => {
    const key = i + ":" + at + ":" + size;
    if (!memo.has(key)) memo.set(key, joinFit(few[i], many.slice(at, at + size), directed));
    return memo.get(key);
  };
  let best = null;
  const cuts = compositions(many.length, few.length);
  permutations(few.length).forEach((perm) => {
    cuts.forEach((sizes) => {
      let at = 0, total = 0, worst = 0;
      for (let j = 0; j < sizes.length; j++) {
        const f = fit(perm[j], at, sizes[j]);
        at += sizes[j];
        if (f === null) return;
        total += f;
        if (f > worst) worst = f;
      }
      const mean = total / sizes.length;
      if (!best || mean < best.mean) best = { mean, worst };
    });
  });
  return best;
}

// How close a drawing is to a reference of any stroke count; null if the counts
// cannot be reconciled. A drawing is { dense, sampled }, both normalised.
function fitOf(drawing, refN, directed) {
  return drawing.sampled.length === refN.length
    ? bestMatch(drawing.sampled, refN, directed)
    : joinedFit(drawing.dense, refN, directed);
}

const scoreOf = (mean) =>
  Math.round(100 * Math.max(0, Math.min(1, 1 - (mean - GRADE_PERFECT) / (GRADE_ZERO - GRADE_PERFECT))));

// Another same-script kana the drawing is clearly more like, or null.
function nearestNeighbour(target, drawnN, refN, targetMean, references, sameScript) {
  // drawnN is { dense, sampled }; see fitOf
  let targetDirected = null;
  let nearest = null;
  (sameScript || []).forEach((other) => {
    if (other === target || !references[other]) return;
    const otherN = prepareReference(references[other]);
    const f = fitOf(drawnN, otherN, false);
    if (!f) return;
    let beats = f.mean < targetMean * GRADE_NEIGHBOUR;
    if (!beats && f.mean < targetMean / GRADE_TIE) {
      // the same lines either way: which way they were drawn is all that differs
      if (targetDirected === null) targetDirected = (fitOf(drawnN, refN, true) || { mean: Infinity }).mean;
      const od = fitOf(drawnN, otherN, true);
      beats = Boolean(od) && od.mean < targetDirected * GRADE_NEIGHBOUR;
    }
    if (beats && (!nearest || f.mean < nearest.d)) nearest = { kana: other, d: f.mean };
  });
  return nearest ? nearest.kana : null;
}

/* gradeDrawing(target, drawing, references, sameScript)
     target      the kana asked for, e.g. "か"
     drawing     [[{x, y}, …], …] strokes in the order they were drawn
     references  { kana: [flat stroke, …] } from kana-strokes.json
     sameScript  the kana to measure the drawing against as neighbours
   → { pass, score, expected, drawnCount, joined, issues: [{ kind, like? }] }
   `kind` is "count", "shape" or "neighbour"; `like` is the neighbour it
   resembles. `joined` is true when the stroke count differed and was explained
   by joined or broken strokes. */
function gradeDrawing(target, drawing, references, sameScript) {
  const refFlat = references[target];
  const expected = refFlat ? refFlat.length : 0;
  const issues = [];
  const strokes = prepareDrawing(drawing);
  const result = { pass: false, score: 0, expected, drawnCount: strokes.length, joined: false, issues };
  if (!refFlat || !strokes.length) {
    issues.push({ kind: "count" });
    return result;
  }
  const dense = normaliseStrokes(strokes);
  const drawnN = { dense, sampled: dense.map((s) => resampleStroke(s, GRADE_POINTS)) };
  const refN = prepareReference(refFlat);

  const fit = fitOf(drawnN, refN, false);
  if (!fit) {
    // no joining explains it: the wrong number of strokes
    issues.push({ kind: "count" });
    return result;
  }
  result.joined = strokes.length !== expected;
  result.score = scoreOf(fit.mean);
  if (fit.worst > GRADE_STROKE_LIMIT) issues.push({ kind: "shape" });
  const like = nearestNeighbour(target, drawnN, refN, fit.mean, references, sameScript);
  if (like) issues.push({ kind: "neighbour", like });
  result.pass = result.score >= GRADE_PASS && issues.length === 0;
  return result;
}
