#!/usr/bin/env python3
"""Build the stroke data Drawing mode grades against. Not a build step — the
JSON beside this is committed, and nothing runs this to serve the app.

    python frontend/strokes/build.py            # fetches from GitHub
    python frontend/strokes/build.py --cache DIR # reuses SVGs already in DIR

Standard library only. For every card in the decks kana.json marks
"draw": true it takes the character's KanjiVG file, reads its
stroke paths in stroke order, and resamples each stroke to POINTS points evenly
spaced along its length, in KanjiVG's own 109x109 box. The app never parses
SVG: it gets points, in order, which is all a stroke comparison needs.

KanjiVG is CC BY-SA 3.0 (see KanjiVG-LICENSE.txt, fetched with the data), so
kana-strokes.json is an adaptation under the same licence: it carries the
attribution and says what was changed. The app's code is not affected.
"""
import argparse
import json
import math
import re
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
KANA = HERE.parent / "kana.json"
OUT = HERE / "kana-strokes.json"
LICENSE = HERE / "KanjiVG-LICENSE.txt"
RAW = "https://raw.githubusercontent.com/KanjiVG/kanjivg/master/"
POINTS = 32          # per stroke; the grader resamples a drawing to the same
DENSE = 64           # samples per curve segment before resampling by length


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "curl/8"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8")


NUM = r"-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?"
TOKEN = re.compile(r"[MmLlHhVvCcSsQqTtZz]|" + NUM)


def path_points(d: str) -> list[tuple[float, float]]:
    """An SVG path's outline as a dense polyline. KanjiVG uses M, C, c, S, s
    and the odd L; the rest are handled so a new file cannot silently break."""
    toks = TOKEN.findall(d)
    pts: list[tuple[float, float]] = []
    x = y = sx = sy = 0.0
    last_ctrl = None                      # previous cubic's second control point
    i, cmd = 0, None

    def num():
        nonlocal i
        v = float(toks[i]); i += 1
        return v

    def cubic(p0, p1, p2, p3):
        for k in range(1, DENSE + 1):
            t = k / DENSE; u = 1 - t
            pts.append((u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
                        u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]))

    while i < len(toks):
        if re.fullmatch(r"[A-Za-z]", toks[i]):
            cmd = toks[i]; i += 1
            if cmd in "Zz":
                x, y = sx, sy; pts.append((x, y)); last_ctrl = None
                continue
        rel = cmd.islower()
        c = cmd.upper()
        if c == "M":
            nx, ny = num(), num()
            x, y = (x + nx, y + ny) if rel else (nx, ny)
            sx, sy = x, y
            pts.append((x, y)); last_ctrl = None
            cmd = "l" if rel else "L"     # further pairs after M are line-tos
        elif c == "L":
            nx, ny = num(), num()
            x, y = (x + nx, y + ny) if rel else (nx, ny)
            pts.append((x, y)); last_ctrl = None
        elif c == "H":
            nx = num(); x = x + nx if rel else nx; pts.append((x, y)); last_ctrl = None
        elif c == "V":
            ny = num(); y = y + ny if rel else ny; pts.append((x, y)); last_ctrl = None
        elif c == "C":
            v = [num() for _ in range(6)]
            if rel: v = [v[0]+x, v[1]+y, v[2]+x, v[3]+y, v[4]+x, v[5]+y]
            cubic((x, y), (v[0], v[1]), (v[2], v[3]), (v[4], v[5]))
            last_ctrl = (v[2], v[3]); x, y = v[4], v[5]
        elif c == "S":
            v = [num() for _ in range(4)]
            if rel: v = [v[0]+x, v[1]+y, v[2]+x, v[3]+y]
            c1 = (2*x - last_ctrl[0], 2*y - last_ctrl[1]) if last_ctrl else (x, y)
            cubic((x, y), c1, (v[0], v[1]), (v[2], v[3]))
            last_ctrl = (v[0], v[1]); x, y = v[2], v[3]
        elif c == "Q":
            v = [num() for _ in range(4)]
            if rel: v = [v[0]+x, v[1]+y, v[2]+x, v[3]+y]
            q = (v[0], v[1]); end = (v[2], v[3])
            cubic((x, y), (x + 2/3*(q[0]-x), y + 2/3*(q[1]-y)),
                  (end[0] + 2/3*(q[0]-end[0]), end[1] + 2/3*(q[1]-end[1])), end)
            last_ctrl = None; x, y = end
        else:
            sys.exit(f"unsupported path command {cmd!r} in {d[:40]}…")
    return pts


def resample(pts: list[tuple[float, float]], n: int) -> list[tuple[float, float]]:
    """n points evenly spaced along the polyline's length, ends included."""
    seg = [math.dist(pts[k], pts[k + 1]) for k in range(len(pts) - 1)]
    total = sum(seg)
    if total == 0:
        return [pts[0]] * n
    out, k, walked = [pts[0]], 0, 0.0
    for m in range(1, n - 1):
        target = total * m / (n - 1)
        while walked + seg[k] < target:
            walked += seg[k]; k += 1
        t = (target - walked) / seg[k] if seg[k] else 0
        out.append((pts[k][0] + t * (pts[k+1][0] - pts[k][0]), pts[k][1] + t * (pts[k+1][1] - pts[k][1])))
    out.append(pts[-1])
    return out


def strokes_of(svg: str, code: str) -> list[str]:
    """The stroke paths, in stroke order, from the kvg:XXXXX-sN ids."""
    found = re.findall(r'<path[^>]*\bid="kvg:' + code + r'-s(\d+)"[^>]*\bd="([^"]+)"', svg)
    found += [(n, d) for d, n in re.findall(r'<path[^>]*\bd="([^"]+)"[^>]*\bid="kvg:' + code + r'-s(\d+)"', svg)]
    by_n = {int(n): d for n, d in found}
    if not by_n or sorted(by_n) != list(range(1, len(by_n) + 1)):
        sys.exit(f"{code}: stroke numbers are not 1..n: {sorted(by_n)}")
    return [by_n[k] for k in sorted(by_n)]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, help="directory of KanjiVG .svg files to read instead of fetching")
    args = ap.parse_args()

    data = json.loads(KANA.read_text(encoding="utf-8"))
    # which decks can be drawn is content: the ones kana.json marks "draw"
    chars = [c["q"] for d in data["decks"] if d.get("draw") for c in d["cards"]]
    bad = [c for c in chars if len(c) != 1]
    if bad:
        sys.exit(f"drawing covers single characters only, got {bad}")

    kana = {}
    for ch in chars:
        code = f"{ord(ch):05x}"
        cached = args.cache / f"{code}.svg" if args.cache else None
        svg = cached.read_text(encoding="utf-8") if cached and cached.exists() else fetch(f"{RAW}kanji/{code}.svg")
        if cached and not cached.exists():
            cached.write_text(svg, encoding="utf-8")
        strokes = []
        for d in strokes_of(svg, code):
            pts = resample(path_points(d), POINTS)
            strokes.append([round(v, 1) for p in pts for v in p])
        kana[ch] = strokes
        print(f"  {ch} {code}  {len(strokes)} stroke{'s' if len(strokes) != 1 else ''}")

    out = {
        "//": "Stroke data for Drawing mode. Adapted from KanjiVG (https://kanjivg.tagaini.net/), "
              "copyright (C) Ulrich Apel, licensed under CC BY-SA 3.0 — see KanjiVG-LICENSE.txt. "
              "Changes: each stroke's SVG path was resampled to evenly spaced points; everything else "
              "in the original files was dropped. This file is under the same licence. Regenerate it "
              "with build.py rather than editing it.",
        "source": "KanjiVG", "license": "CC BY-SA 3.0",
        "box": 109, "points": POINTS,
        "kana": kana,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    LICENSE.write_text(fetch(RAW + "COPYING"), encoding="utf-8")
    print(f"\n  {len(kana)} characters, {sum(len(s) for s in kana.values())} strokes -> {OUT.name} "
          f"({OUT.stat().st_size / 1024:.1f} KB), {LICENSE.name}")


if __name__ == "__main__":
    main()
