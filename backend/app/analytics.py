"""Turning answer logs into "where are you actually slow".

Three rules shape everything here, and all three exist because raw timings from
a practice app are mostly noise:

* **A single run proves nothing.** A distracted run and a sharp run look the
  same in aggregate, so nothing is reported until MIN_RUNS complete runs exist
  for that device.
* **A card nobody was looking at is not a slow card.** Anything over
  MAX_CARD_MS is treated as "they went and did something else" and its time is
  discarded. The answer still counts towards accuracy — they did eventually
  answer it — but it never contributes to a speed figure.
* **Phones and desktops are not comparable.** Typing romaji on a keyboard and
  flicking on glass are different physical acts, so the two are never pooled;
  every figure belongs to one device or the other.
* **Drills are excluded entirely.** A drill re-tests the cards you just missed,
  seconds after the results screen showed you their answers — the speed is
  fresh recall rather than knowledge, and the card mix is deliberately the hard
  ones. Neither its timings nor its accuracy describe how you are actually
  doing, so drill answers are left out of every figure here, not just out of
  the run count.

Medians are used rather than means throughout: with a hard cap at one end and
genuine hesitation at the other, one slow card should not move the number.
"""
import json
import sqlite3
from functools import lru_cache
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[2]

MIN_RUNS = 3           # complete, non-drill runs on a device before reporting
MAX_CARD_MS = 10_000   # over this, the timing is discarded as "distracted"
MIN_ATTEMPTS = 3       # per-character minimum before it can be called slow/weak
TOP_N = 8

DEVICES = ("mobile", "desktop")


@lru_cache(maxsize=1)
def kana_index() -> dict:
    """reading -> [kana], and kana -> reading, straight from kana.json.

    Lets a wrong answer be reported as the character the user actually reached
    for ("answered た") instead of a bare romaji string.
    """
    by_reading: dict[str, list[str]] = {}
    by_kana: dict[str, str] = {}
    try:
        data = json.loads((ROOT / "kana.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"by_reading": {}, "by_kana": {}}
    for deck in data.get("decks", []):
        for card in deck.get("cards", []):
            q, a = card.get("q"), card.get("a")
            if not q or not a:
                continue
            by_kana.setdefault(q, a)
            for reading in [a] + list(card.get("alt") or []):
                by_reading.setdefault(reading, [])
                if q not in by_reading[reading]:
                    by_reading[reading].append(q)
    return {"by_reading": by_reading, "by_kana": by_kana}


def _mistaken_for(given: str, mode: str) -> str | None:
    """What character the given answer corresponds to, if any."""
    if not given:
        return None
    idx = kana_index()
    if given in idx["by_kana"]:          # they typed a character directly
        return given
    hits = idx["by_reading"].get(given.strip().lower())
    return hits[0] if hits else None


def _summarise(rows: list[sqlite3.Row]) -> dict:
    timed = [r["ms"] for r in rows if r["timed"]]
    return {
        "attempts": len(rows),
        "correct": sum(1 for r in rows if r["correct"]),
        "accuracy": round(100 * sum(1 for r in rows if r["correct"]) / len(rows)) if rows else 0,
        "median_ms": round(median(timed)) if timed else None,
        "timed": len(timed),
    }


def report(conn: sqlite3.Connection, user_id: int, device: str) -> dict:
    if device not in DEVICES:
        raise ValueError("unknown device")

    runs = conn.execute(
        """SELECT COUNT(*) AS n FROM runs
            WHERE user_id = ? AND device = ? AND is_drill = 0""",
        (user_id, device),
    ).fetchone()["n"]

    out: dict = {
        "device": device,
        "runs": runs,
        "runs_needed": max(0, MIN_RUNS - runs),
        "ready": runs >= MIN_RUNS,
        "min_runs": MIN_RUNS,
        "max_card_ms": MAX_CARD_MS,
    }
    if not out["ready"]:
        # Deliberately no partial figures — a number shown here would be read
        # as a finding, and the whole point is that it isn't one yet.
        return out

    rows = conn.execute(
        """SELECT a.* FROM answers a JOIN runs r ON r.id = a.run_id
            WHERE a.user_id = ? AND a.device = ? AND r.is_drill = 0""",
        (user_id, device),
    ).fetchall()
    if not rows:
        out["ready"] = False
        return out

    out["overall"] = _summarise(rows)
    out["excluded"] = sum(1 for r in rows if not r["timed"])
    out["excluded_slow"] = sum(
        1 for r in rows if not r["timed"] and not r["revealed"] and r["ms"] > MAX_CARD_MS
    )

    # ---- per character ----
    by_card: dict[tuple[str, str], list[sqlite3.Row]] = {}
    for r in rows:
        by_card.setdefault((r["q"], r["a"]), []).append(r)

    cards = []
    for (q, a), group in by_card.items():
        s = _summarise(group)
        if s["attempts"] < MIN_ATTEMPTS:
            continue
        cards.append({"q": q, "a": a, **s})

    out["cards_tracked"] = len(cards)
    out["min_attempts"] = MIN_ATTEMPTS

    timed_cards = [c for c in cards if c["median_ms"] is not None and c["timed"] >= MIN_ATTEMPTS]
    out["slowest"] = sorted(timed_cards, key=lambda c: -c["median_ms"])[:TOP_N]
    out["fastest"] = sorted(timed_cards, key=lambda c: c["median_ms"])[:TOP_N]
    out["weakest"] = sorted(
        [c for c in cards if c["accuracy"] < 100], key=lambda c: (c["accuracy"], -c["attempts"])
    )[:TOP_N]

    # ---- what they answer instead ----
    pairs: dict[tuple[str, str, str], int] = {}
    for r in rows:
        if r["correct"] or not r["given"] or r["revealed"]:
            continue
        got = _mistaken_for(r["given"], r["mode"])
        key = (r["q"], r["a"], got or r["given"])
        pairs[key] = pairs.get(key, 0) + 1
    confusions = [
        {"q": q, "a": a, "mistaken_for": got, "count": n}
        for (q, a, got), n in pairs.items()
        if n >= 2                       # once is a slip, twice is a pattern
    ]
    out["confusions"] = sorted(confusions, key=lambda c: -c["count"])[:TOP_N]

    # ---- breakdowns ----
    def group_by(field: str) -> list[dict]:
        buckets: dict[str, list[sqlite3.Row]] = {}
        for r in rows:
            buckets.setdefault(r[field], []).append(r)
        return sorted(
            ({field: k, **_summarise(v)} for k, v in buckets.items()),
            key=lambda d: -d["attempts"],
        )

    out["by_mode"] = group_by("mode")
    out["by_deck"] = group_by("deck_id")

    recent = conn.execute(
        """SELECT deck_id, mode, total, correct, duration_ms, created_at, is_drill
             FROM runs WHERE user_id = ? AND device = ?
            ORDER BY id DESC LIMIT 10""",
        (user_id, device),
    ).fetchall()
    out["recent_runs"] = [dict(r) for r in recent]
    return out


def overview(conn: sqlite3.Connection, user_id: int) -> dict:
    """Both device buckets at once, so the UI can say which one has data."""
    return {d: report(conn, user_id, d) for d in DEVICES}
