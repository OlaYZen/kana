#!/usr/bin/env python3
"""Regenerate the bundled font subsets. Not a build step — the .woff2 files
beside this are committed, and nothing runs this to serve the app.

Run it when the app gains a character the subsets don't carry, or to move to a
newer upstream release:

    pip install "fonttools[woff]" brotli
    python frontend/fonts/subset.py

The upstream faces are 3.6-13 MB each because they carry thousands of kanji.
This app renders kana, forty-four kanji of interface chrome, and Latin — 477
characters — so each face is cut to that and lands at 32-110 KB.

The cut is defined by *ranges*, never by the current contents of kana.json:
every kana block is kept whole, so adding a card can never produce tofu. The
kanji list is the one thing here that is enumerated, because it is interface
text rather than content; `check()` below re-derives it from the source files
and fails if it has drifted.
"""
import json
import re
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
RAW = "https://raw.githubusercontent.com/google/fonts/main/ofl/"

# Whole blocks, so any kana added to kana.json is already covered.
RANGES = [
    "U+0020-007E",    # Latin: the romaji an IME shows while composing
    "U+014D,U+016B",  # ō ū — the long vowels the readings are spelt with
    "U+00B7",         # ·  the separator in deck subtitles
    "U+2192",         # →  the progress report's "mistaken for" arrow
    "U+00D7,U+00F7,U+2212",  # × ÷ −  the signs the arithmetic drill asks with
    "U+3000-303F",    # CJK punctuation
    "U+3040-309F",    # hiragana, incl. ゛ ゜ ゝ ゞ
    "U+30A0-30FF",    # katakana, incl. ヴ ・ ー ヽ ヾ
    "U+31F0-31FF",    # katakana phonetic extensions
    "U+FF61-FF9F",    # halfwidth katakana — what NFKC folds from
]

# Every kanji the interface itself renders: 設定 記録 五十音 名 字, the font
# picker's 明朝 教科書体 丸 等幅, the numerals 一二三四五六七八九十百千万 that
# both generated subjects write their values in, and the 月火水木金土日曜 時分秒半
# 午前後 the time stamp needs — the seven weekdays, the counters a date, a month,
# an hour, a minute and a second end in, the 半 of half past, and the 午前 and
# 午後 said before a time.
# Verified against the sources by check().
KANJI = "一七万三丸九二五体八六分前十千午半名四土字定幅後教日明時曜書月朝木水火百科秒等記設金録音"

# No vert/vrt2/palt: the app never sets writing-mode or font-feature-settings,
# and dropping them prunes every vertical alternate glyph along with them — 30%
# of the subset. mark/mkmk stay so a decomposed dakuten arriving from an IME is
# positioned rather than stacked on the origin.
FEATURES = "kern,liga,locl,ccmp,mark,mkmk"

# The two Notos are kept variable: one file covers every weight, and it is
# *smaller* than the two static instances the app would otherwise need (the
# chart headings are 600 and the feedback line's <b> is 700). The other three
# have no variable release, so they ship as a regular/bold pair.
FONTS = [
    ("notoserifjp", "NotoSerifJP[wght].ttf", "noto-serif-jp-var.woff2"),
    ("notosansjp", "NotoSansJP[wght].ttf", "noto-sans-jp-var.woff2"),
    ("kleeone", "KleeOne-Regular.ttf", "klee-one-400.woff2"),
    ("kleeone", "KleeOne-SemiBold.ttf", "klee-one-600.woff2"),
    ("zenmarugothic", "ZenMaruGothic-Regular.ttf", "zen-maru-gothic-400.woff2"),
    ("zenmarugothic", "ZenMaruGothic-Bold.ttf", "zen-maru-gothic-700.woff2"),
    ("bizudpgothic", "BIZUDPGothic-Regular.ttf", "biz-udpgothic-400.woff2"),
    ("bizudpgothic", "BIZUDPGothic-Bold.ttf", "biz-udpgothic-700.woff2"),
]


def _outside(text: str, opener: str, closer: str) -> str:
    """Everything not between the two markers — i.e. the file minus its comments."""
    out, i = [], 0
    while True:
        j = text.find(opener, i)
        if j < 0:
            out.append(text[i:])
            return "".join(out)
        out.append(text[i:j])
        k = text.find(closer, j + len(opener))
        if k < 0:
            return "".join(out)
        i = k + len(closer)


def _rendered(node) -> str:
    """kana.json's content, minus the `//` keys, which are prose about it."""
    if isinstance(node, dict):
        return "".join(_rendered(v) for k, v in node.items() if not k.startswith("//"))
    if isinstance(node, list):
        return "".join(_rendered(v) for v in node)
    return node if isinstance(node, str) else ""


def check() -> None:
    """Re-derive the interface kanji from the sources; fail if KANJI has drifted.

    Comments are cut out first, and so are kana.json's `//` keys. Both discuss
    characters the app never draws — 万 and 億 in the prose about how a number is
    read, 納戸 and 栗 beside the colours named after them — and a kanji that is
    only ever *written about* cannot come out as tofu. Counting them would grow
    every one of the eight files by glyphs nothing renders.
    """
    html = _outside((ROOT / "index.html").read_text(encoding="utf-8"), "<!--", "-->")
    js = _outside((ROOT / "app.js").read_text(encoding="utf-8"), "/*", "*/")
    js = re.sub(r"(?m)//.*$", "", js)
    css = _outside((ROOT / "styles.css").read_text(encoding="utf-8"), "/*", "*/")
    data = json.loads((ROOT / "kana.json").read_text(encoding="utf-8"))
    found = set(re.findall(r"[一-鿿]", html + js + css + _rendered(data)))
    missing = found - set(KANJI)
    if missing:
        sys.exit(f"KANJI is out of date — the sources also use {''.join(sorted(missing))}")
    stale = set(KANJI) - found
    if stale:
        print(f"note: KANJI carries {''.join(sorted(stale))}, no longer in the sources")


def fetch(folder: str, name: str, dest: Path) -> None:
    url = RAW + folder + "/" + urllib.parse.quote(name)
    req = urllib.request.Request(url, headers={"User-Agent": "curl/8"})
    with urllib.request.urlopen(req, timeout=180) as r:
        dest.write_bytes(r.read())


def main() -> None:
    check()
    with tempfile.TemporaryDirectory() as tmp:
        cache = Path(tmp)
        total = 0
        for folder, upstream, out in FONTS:
            src = cache / upstream
            if not src.exists():
                print(f"fetching {upstream} …")
                fetch(folder, upstream, src)
            subprocess.run([
                sys.executable, "-m", "fontTools.subset", str(src),
                "--unicodes=" + ",".join(RANGES),
                "--text=" + KANJI,
                "--flavor=woff2",
                "--layout-features=" + FEATURES,
                "--name-IDs=*",       # keep copyright/licence inside the file
                "--notdef-outline",   # a real tofu box beats an invisible gap
                "--output-file=" + str(HERE / out),
            ], check=True)
            kb = (HERE / out).stat().st_size / 1024
            total += kb
            print(f"  {out:26} {src.stat().st_size / 1048576:5.1f} MB -> {kb:6.1f} KB")

        for folder in dict.fromkeys(f for f, _, _ in FONTS):
            fetch(folder, "OFL.txt", cache / f"OFL-{folder}.txt")
        print(f"\n  {'total':26} {total:6.1f} KB")
        print("  LICENSES.txt is assembled by hand from the upstream OFL.txt files;"
              "\n  re-check it if a copyright line changed upstream.")


if __name__ == "__main__":
    main()
