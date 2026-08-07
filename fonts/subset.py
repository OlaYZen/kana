#!/usr/bin/env python3
"""Regenerate the bundled font subsets. Not a build step — the .woff2 files
beside this are committed, and nothing runs this to serve the app.

Run it when the app gains a character the subsets don't carry, or to move to a
newer upstream release:

    pip install "fonttools[woff]" brotli
    python fonts/subset.py

The upstream faces are 3.6-13 MB each because they carry thousands of kanji.
This app renders kana, eighteen kanji of interface chrome, and Latin — 244
characters — so each face is cut to that and lands at 32-110 KB.

The cut is defined by *ranges*, never by the current contents of kana.json:
every kana block is kept whole, so adding a card can never produce tofu. The
kanji list is the one thing here that is enumerated, because it is interface
text rather than content; `check()` below re-derives it from the source files
and fails if it has drifted.
"""
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
    "U+00B7",         # ·  the separator in deck subtitles
    "U+2192",         # →  the progress report's "mistaken for" arrow
    "U+3000-303F",    # CJK punctuation
    "U+3040-309F",    # hiragana, incl. ゛ ゜ ゝ ゞ
    "U+30A0-30FF",    # katakana, incl. ヴ ・ ー ヽ ヾ
    "U+31F0-31FF",    # katakana phonetic extensions
    "U+FF61-FF9F",    # halfwidth katakana — what NFKC folds from
]

# Every kanji the interface itself renders: 設定 記録 五十音 名 字, the font
# picker's 明朝 教科書体 丸 等幅. Verified against the sources by check().
KANJI = "丸五体十名字定幅教明書朝科等記設録音"

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


def check() -> None:
    """Re-derive the interface kanji from the sources; fail if KANJI has drifted."""
    found = set()
    for name in ("index.html", "app.js", "styles.css", "kana.json"):
        found |= set(re.findall(r"[一-鿿]",
                                (ROOT / name).read_text(encoding="utf-8")))
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
