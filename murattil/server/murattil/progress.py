"""Practice history, streaks and the daily practice passage."""
from __future__ import annotations

import datetime as dt
from collections import Counter

from . import db, quran

# Short, commonly memorised passages rotated as the daily practice.
DAILY_PASSAGES = [
    (1, 1, 7), (112, 1, 4), (113, 1, 5), (114, 1, 6), (103, 1, 3), (108, 1, 3), (2, 255, 255),
    (2, 285, 286), (67, 1, 5), (36, 1, 12), (55, 1, 13), (18, 1, 5), (97, 1, 5), (94, 1, 8), (93, 1, 11),
    (99, 1, 8), (100, 1, 11), (101, 1, 11), (102, 1, 8), (104, 1, 9), (105, 1, 5), (106, 1, 4), (107, 1, 7),
    (109, 1, 6), (110, 1, 3), (111, 1, 5), (3, 190, 194), (59, 22, 24), (25, 63, 67), (23, 1, 11),
]


def _day(ts: float) -> dt.date:
    return dt.datetime.fromtimestamp(ts, dt.timezone.utc).date()


def daily(user_id: str) -> dict:
    today = dt.datetime.now(dt.timezone.utc).date()
    s, a0, a1 = DAILY_PASSAGES[today.toordinal() % len(DAILY_PASSAGES)]
    start = dt.datetime.combine(today, dt.time(), dt.timezone.utc).timestamp()
    done = db.one("SELECT COUNT(*) AS n FROM practice WHERE user_id = ? AND surah = ? AND ayah_from = ? AND ayah_to = ?"
                  " AND created_at >= ?", user_id, s, a0, a1, start)["n"]
    sm = quran.surah_meta(s)
    return {"date": today.isoformat(), "surah": s, "from": a0, "to": a1, "surahName": {"ar": sm["ar"], "en": sm["en"]},
            "completed": done > 0, "attemptsToday": done}


def summary(user_id: str) -> dict:
    rows = [dict(r) for r in db.all_("SELECT * FROM practice WHERE user_id = ? ORDER BY created_at", user_id)]
    recs = [dict(r) for r in db.all_("SELECT kind, duration_s, created_at FROM recordings WHERE user_id = ?", user_id)]
    days = sorted({_day(r["created_at"]) for r in rows} | {_day(r["created_at"]) for r in recs if r["kind"] == "practice"})
    today = dt.datetime.now(dt.timezone.utc).date()
    streak = 0
    d = today if today in days else today - dt.timedelta(days=1)
    dayset = set(days)
    while d in dayset:
        streak += 1
        d -= dt.timedelta(days=1)
    last30 = Counter(_day(r["created_at"]).isoformat() for r in rows if (today - _day(r["created_at"])).days < 30)
    trend = [{"t": r["created_at"], "surah": r["surah"], "from": r["ayah_from"], "to": r["ayah_to"],
              "wordAccuracy": r["word_accuracy"], "errors": r["errors"], "warnings": r["warnings"],
              "confidence": r["confidence"], "mode": r["mode"]} for r in rows[-60:]]
    passages: dict[tuple, list] = {}
    for r in rows:
        passages.setdefault((r["surah"], r["ayah_from"], r["ayah_to"]), []).append(r)
    improvements = []
    for (s, a0, a1), rs in passages.items():
        scored = [x for x in rs if x["word_accuracy"] is not None]
        sm = quran.surah_meta(s)
        improvements.append({
            "surah": s, "from": a0, "to": a1, "surahName": {"ar": sm["ar"], "en": sm["en"]}, "attempts": len(rs),
            "first": scored[0]["word_accuracy"] if scored else None, "latest": scored[-1]["word_accuracy"] if scored else None,
            "best": max((x["word_accuracy"] for x in scored), default=None), "lastAt": rs[-1]["created_at"],
            "firstErrors": rs[0]["errors"], "latestErrors": rs[-1]["errors"],
        })
    improvements.sort(key=lambda x: -x["lastAt"])
    kinds: Counter = Counter()
    for j in db.all_("SELECT result FROM jobs WHERE user_id = ? AND kind = 'tajweed' AND status = 'done'"
                     " ORDER BY created_at DESC LIMIT 50", user_id):
        res = db.jload(j["result"], {}) or {}
        for f in res.get("findings", []):
            kinds[f.get("hukm") or f["kind"]] += 1
    return {
        "sessions": len(rows), "practiceDays": len(days), "streak": streak,
        "minutesRecorded": round(sum((r["duration_s"] or 0) for r in recs) / 60, 1),
        "transforms": sum(1 for r in recs if r["kind"] == "transform"),
        "last30": [{"date": k, "count": v} for k, v in sorted(last30.items())],
        "trend": trend, "passages": improvements[:30],
        "commonFindings": [{"key": k, "count": v} for k, v in kinds.most_common(8)],
        "daily": daily(user_id),
    }
