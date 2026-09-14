/* js/fonts.js — the font options: bundled faces and the canvas probe.
   One of the classic scripts index.html loads in order; see CLAUDE.md, "Scripts". */
"use strict";

/* ==========================================================================
   Fonts

   Five of the styles are **bundled** — the face ships under fonts/, subset to
   kana, and the @font-face rules at the top of the stylesheet load it. Those
   are always offered: whether the device has them is not a question, and the
   probe below could not answer it anyway, because web fonts load long after
   this runs and probing one at boot always reports "missing". Before they
   were bundled, a stock Windows install saw barely half the picker — Windows
   ships no Japanese serif or textbook face unless an optional feature is
   installed.

   The probe is still here for the rest. For a device-only style the only
   usable faces are the ones already installed, and neither obvious test works
   for kana: document.fonts.check() answers true for names that don't exist,
   and every CJK face is full-width so canvas text widths are identical across
   all of them. So each candidate is rendered to a canvas and its pixels
   hashed — which also settles the question that actually matters, "does this
   option look any different?". Anything that renders like the last-resort
   font, or like an option already on the list, is dropped instead of being
   offered as a choice that does nothing.

   A bundled option skips the dedupe as well as the presence check, and has
   to: at boot none of the five have loaded, so all five hash to whatever
   their generic falls back to — identical to one another — and a dedupe would
   keep one and throw the other four away.
   ========================================================================== */
const GENERIC = /^(serif|sans-serif|monospace|system-ui|cursive|fantasy)$/;
const quoted = (f) => (GENERIC.test(f) ? f : '"' + f + '"');

const inkHash = (function () {
  let ctx = null;
  try {
    const cv = document.createElement("canvas");
    cv.width = 420; cv.height = 80;
    ctx = cv.getContext("2d", { willReadFrequently: true });
  } catch (e) { return null; }
  if (!ctx) return null;
  return function (stack) {
    try {
      ctx.clearRect(0, 0, 420, 80);
      ctx.fillStyle = "#000";
      ctx.textBaseline = "top";
      ctx.font = '56px ' + stack;
      ctx.fillText("あきカヂョ", 0, 6);
      const d = ctx.getImageData(0, 0, 420, 80).data;
      let h = 5381, ink = 0;
      for (let i = 3; i < d.length; i += 4) {
        if (d[i] > 8) { ink++; h = ((h * 33) ^ (i * 31 + d[i])) >>> 0; }
      }
      return h + ":" + ink;
    } catch (e) { return null; }   // canvas blocked (privacy mode)
  };
})();

// The bundled face leads, so everyone sees the same one; the installed names
// sit behind it and only ever render what the subset deliberately leaves out
// — a kanji typed into the write field, mostly. The generic is last as always.
const stackFor = (def, families) =>
  (def.bundled ? ['"' + def.bundled + '"'] : [])
    .concat(families.map(quoted))
    .concat(def.generic || "serif")
    .join(", ");

const option = (def, stack) => ({
  id: def.id, label: def.label, ja: def.ja || "",
  note: def.note || "", bundled: Boolean(def.bundled), stack: stack
});

function resolveFonts(defs) {
  const all = (defs || []).map((d) => option(d, stackFor(d, d.families || [])));

  const probe = inkHash && inkHash('"__kana_probe_missing__", monospace') ? inkHash : null;
  if (!probe) return { list: all, missing: [] };   // can't verify — offer everything

  const lastResort = probe('"__kana_probe_missing__", monospace');
  // Seeded with the last-resort shape, so a style that renders identically to
  // it is dropped by the same rule that drops a duplicate. That was always
  // the intent — it is the one thing an option can be and still be worth
  // nothing, since it is what you would get without the option existing —
  // but the comparison was never actually made.
  //
  // Note this is *not* a tofu test and can't be one. A browser falls back
  // per character, so on a Windows box with no Japanese font "serif" still
  // renders real kana out of whatever face the engine finds; last-resort here
  // means "indistinguishable from the default", not "boxes". Seeding it was
  // only safe once five styles shipped with the app — before that, dropping
  // an option that matched the default could have emptied the picker.
  const seen = new Set([lastResort]);
  const list = [], missing = [];

  (defs || []).forEach((def) => {
    const named = (def.families || []).filter(
      (f) => probe(quoted(f) + ", monospace") !== lastResort
    );

    // A bundled style ships with the app: it is always offered, and it is
    // never hashed. At this point its @font-face has not loaded, so the hash
    // would be its generic's — the same for all five — and the dedupe below
    // would throw four of them away.
    if (def.bundled) { list.push(option(def, stackFor(def, named))); return; }

    // A device-only style with families listed but none installed would
    // silently render as its generic twin, so it is not offered at all.
    if ((def.families || []).length && !named.length) { missing.push(def.label); return; }

    const stack = stackFor(def, named);
    const h = probe(stack);
    if (h && seen.has(h)) { missing.push(def.label); return; }
    if (h) seen.add(h);
    list.push(option(def, stack));
  });

  return list.length ? { list: list, missing: missing } : { list: all, missing: [] };
}
