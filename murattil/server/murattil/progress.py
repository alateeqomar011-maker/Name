"""Practice history, streaks, attempt-to-attempt comparison and the personalised daily plan.

Everything here is computed from the user's own measured results (Tajweed Coach reports and
technique comparisons); nothing is estimated or invented when there is no data yet.
"""
from __future__ import annotations

import datetime as dt
from collections import Counter

from . import db, quran, reciters

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
    trend = []
    for r in rows[-60:]:
        d = db.jload(r.get("details"), {}) or {}
        fl = d.get("fluency") or {}
        trend.append({"t": r["created_at"], "surah": r["surah"], "from": r["ayah_from"], "to": r["ayah_to"],
                      "wordAccuracy": r["word_accuracy"], "errors": r["errors"], "warnings": r["warnings"],
                      "confidence": r["confidence"], "mode": r["mode"], "meanConfidence": d.get("meanConfidence"),
                      "unitsPerSecond": fl.get("unitsPerSecond"), "pausesOffWaqfMarks": fl.get("pausesOffWaqfMarks"),
                      "repeats": fl.get("repeats")})
    # per-rule results: earlier half of the attempts against the later half
    names = _rule_names()
    with_rules = [db.jload(r.get("details"), {}).get("rules", {}) for r in rows if r.get("details")]
    half = len(with_rules) // 2
    rule_progress = []
    for h in sorted({h for x in with_rules for h in x}):
        def rate(xs):
            c = sum(x.get(h, {}).get("checked", 0) for x in xs)
            f = sum(x.get(h, {}).get("flagged", 0) for x in xs)
            return (round(f / c, 2) if c else None), c
        all_rate, n = rate(with_rules)
        early, _ = rate(with_rules[:half]) if half else (None, 0)
        late, _ = rate(with_rules[half:]) if half else (None, 0)
        rule_progress.append({"hukm": h, "en": names.get(h, {}).get("en", h), "ar": names.get(h, {}).get("ar", h),
                              "checks": n, "flagRate": all_rate, "earlier": early, "later": late})
    rule_progress.sort(key=lambda x: -(x["flagRate"] or 0))
    technique = []
    for t in db.all_("SELECT * FROM technique WHERE user_id = ? ORDER BY created_at DESC LIMIT 60", user_id)[::-1]:
        technique.append({"t": t["created_at"], "reciterId": t["reciter_id"], "surah": t["surah"], "from": t["ayah_from"],
                          "to": t["ayah_to"], "overall": t["overall"], "scores": db.jload(t["scores"], {}),
                          "paceRatio": t["pace_ratio"]})
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
        "rules": rule_progress, "technique": technique,
        "daily": daily(user_id),
    }


# ------------------------------------------------------------------ per attempt

def attempt_metrics(report: dict) -> dict:
    """The measurements of one Tajweed Coach attempt that are tracked over time."""
    words = [w for w in report.get("words", []) if w["ayah"] > 0]
    return {
        "words": [[w["ayah"], w["word"], w["status"], w["text"]] for w in words],
        "wordAccuracy": report.get("scores", {}).get("wordAccuracy"),
        "meanConfidence": round(sum(w["confidence"] for w in words) / len(words), 3) if words else None,
        "fluency": report.get("fluency") or {},
        "rules": report.get("ruleStats") or {},
        "findings": dict(Counter(f["kind"] for f in report.get("findings", []))),
    }


def _flagged(details: dict) -> dict[tuple[int, int], str]:
    return {(a, w): t for a, w, st, t in details.get("words", []) if st != "ok"}


def compare_attempts(prev: dict, cur: dict, prev_at: float) -> dict:
    """What changed since the previous attempt at the same passage."""
    p, c = _flagged(prev), _flagged(cur)

    def items(keys):
        return [{"ayah": a, "word": w, "text": (c.get((a, w)) or p.get((a, w)))} for a, w in sorted(keys)]

    def delta(get):
        a, b = get(prev), get(cur)
        return None if a is None or b is None else round(b - a, 3)
    rules = {}
    for h in set(prev.get("rules", {})) | set(cur.get("rules", {})):
        a, b = prev.get("rules", {}).get(h), cur.get("rules", {}).get(h)
        if a and b and a["checked"] and b["checked"]:
            rules[h] = {"before": round(a["flagged"] / a["checked"], 2), "after": round(b["flagged"] / b["checked"], 2)}
    return {
        "previousAt": prev_at,
        "fixed": items(p.keys() - c.keys()),
        "still": items(p.keys() & c.keys()),
        "new": items(c.keys() - p.keys()),
        "deltas": {
            "wordAccuracy": delta(lambda d: d.get("wordAccuracy")),
            "meanConfidence": delta(lambda d: d.get("meanConfidence")),
            "unitsPerSecond": delta(lambda d: d.get("fluency", {}).get("unitsPerSecond")),
            "pausesOffWaqfMarks": delta(lambda d: d.get("fluency", {}).get("pausesOffWaqfMarks")),
            "repeats": delta(lambda d: d.get("fluency", {}).get("repeats")),
        },
        "rules": rules,
    }


def previous_attempt(user_id: str, surah: int, a_from: int, a_to: int) -> dict | None:
    r = db.one("SELECT details, created_at FROM practice WHERE user_id = ? AND surah = ? AND ayah_from = ? AND ayah_to = ?"
               " AND details IS NOT NULL ORDER BY created_at DESC LIMIT 1", user_id, surah, a_from, a_to)
    if r is None:
        return None
    return {"details": db.jload(r["details"], {}), "at": r["created_at"]}


# ------------------------------------------------------------------ the plan

def _passage_name(s: int, a0: int, a1: int) -> dict:
    sm = quran.surah_meta(s)
    rng = f"{a0}" if a0 == a1 else f"{a0}–{a1}"
    return {"en": f"{sm['en']} {rng}", "ar": f"{sm['ar']} {rng}"}


def _rule_names() -> dict:
    from .tajweed.coach import _rules_index
    return {r["id"]: r for r in _rules_index()}


def _passage_for_rule(hukm: str) -> tuple[int, int, int] | None:
    from .tajweed.coach import passage_with_rules
    best = None
    for s, a0, a1 in DAILY_PASSAGES:
        n = sum(1 for w in passage_with_rules(s, a0, a1) if hukm in w["rules"])
        if n and (best is None or n > best[0]):
            best = (n, (s, a0, a1))
    return best[1] if best else None


TECHNIQUE_FOCUS = {
    "pace": {"en": "pace — match the reciter's speed ayah by ayah", "ar": "السرعة: جارِ القارئ آيةً آية"},
    "breath": {"en": "breath — pause where the reciter pauses and carry each phrase on one breath",
               "ar": "النفَس: قف حيث يقف القارئ وأكمل الجملة بنفَس واحد"},
    "melody": {"en": "melody — copy where the voice rises and falls, word by word",
               "ar": "اللحن: قلّد مواضع الصعود والهبوط كلمةً كلمة"},
    "madd": {"en": "madd lengths — hold each long vowel as long as the reciter", "ar": "المدود: أطل كل مد بمقدار مد القارئ"},
    "tone": {"en": "tone — recite from the chest with a relaxed, open throat", "ar": "النبرة: اقرأ من الصدر بحلق مسترخٍ ومفتوح"},
}


def plan(user_id: str) -> dict:
    """Today's practice, built from the user's own latest results."""
    today = dt.datetime.now(dt.timezone.utc).date()
    start = dt.datetime.combine(today, dt.time(), dt.timezone.utc).timestamp()
    rows = [dict(r) for r in db.all_("SELECT * FROM practice WHERE user_id = ? ORDER BY created_at DESC LIMIT 60", user_id)]
    tech = [dict(r) for r in db.all_("SELECT * FROM technique WHERE user_id = ? ORDER BY created_at DESC LIMIT 20", user_id)]
    favs = [r["reciter_id"] for r in db.all_("SELECT reciter_id FROM favorites WHERE user_id = ? ORDER BY created_at", user_id)]
    items: list[dict] = []

    def done_since(s, a0, a1, t) -> bool:
        return any(r["surah"] == s and r["ayah_from"] == a0 and r["ayah_to"] == a1 and r["created_at"] > t for r in rows)

    # 1. fix what the last attempt found
    latest = next((r for r in rows if r.get("details")), None)
    if latest:
        d = db.jload(latest["details"], {})
        flagged = [{"ayah": a, "word": w, "text": t} for a, w, st, t in d.get("words", []) if st != "ok"]
        if flagged:
            s, a0, a1 = latest["surah"], latest["ayah_from"], latest["ayah_to"]
            n = len(flagged)
            items.append({
                "id": "fix", "type": "fix", "surah": s, "from": a0, "to": a1, "words": flagged[:8],
                "titleEn": f"Fix {n} word{'s' if n != 1 else ''} in {_passage_name(s, a0, a1)['en']}",
                "titleAr": f"صحّح {n} {'كلمة' if n == 1 else 'كلمات'} في {_passage_name(s, a0, a1)['ar']}",
                "detailEn": "Play each word against the reference, follow the correction steps, then re-record the passage.",
                "detailAr": "شغّل كل كلمة مع القارئ، واتبع خطوات التصحيح، ثم أعد تسجيل المقطع.",
                "done": done_since(s, a0, a1, latest["created_at"]),
            })

    # 2. drill the rule that is flagged most often (needs enough checks to mean anything)
    agg: dict[str, list[int]] = {}
    for r in rows[:20]:
        for h, st in (db.jload(r.get("details"), {}) or {}).get("rules", {}).items():
            a = agg.setdefault(h, [0, 0])
            a[0] += st["checked"]
            a[1] += st["flagged"]
    weak = sorted(((f / c, h, c) for h, (c, f) in agg.items() if c >= 3 and f / c >= 0.3), reverse=True)
    if weak:
        rate, h, c = weak[0]
        names = _rule_names()
        target = _passage_for_rule(h)
        if target:
            s, a0, a1 = target
            nm = names.get(h, {})
            items.append({
                "id": "rule", "type": "rule", "hukm": h, "surah": s, "from": a0, "to": a1, "rate": round(rate, 2), "checks": c,
                "titleEn": f"Drill: {nm.get('en', h)}", "titleAr": f"تدريب: {nm.get('ar', h)}",
                "detailEn": f"Flagged in {round(rate * 100)}% of {c} checks in your recent attempts. {_passage_name(s, a0, a1)['en']} has several examples.",
                "detailAr": f"رُصد في {round(rate * 100)}٪ من {c} فحصًا في محاولاتك الأخيرة. في {_passage_name(s, a0, a1)['ar']} أمثلة عديدة عليه.",
                "done": done_since(s, a0, a1, start),
            })

    # 3. listen and imitate the favourite reciter, focusing on the weakest technique score
    rid = favs[0] if favs else (tech[0]["reciter_id"] if tech else None)
    if rid and reciters.get(rid):
        rname = reciters.get(rid)["name"]
        mine = [t for t in tech if t["reciter_id"] == rid]
        if mine:
            t = mine[0]
            sc = {k: v for k, v in (db.jload(t["scores"], {}) or {}).items() if v is not None}
            focus = min(sc, key=sc.get) if sc else "melody"
            s, a0, a1 = t["surah"], t["ayah_from"], t["ayah_to"]
            items.append({
                "id": "imitate", "type": "imitate", "reciterId": rid, "surah": s, "from": a0, "to": a1, "focus": focus,
                "score": sc.get(focus),
                "titleEn": f"Imitate {rname['en']}: {focus}", "titleAr": f"قلّد {rname['ar']}: {TECHNIQUE_FOCUS[focus]['ar'].split(':')[0]}",
                "detailEn": f"Your {focus} was {sc.get(focus)}/100 close to {rname['en']} on {_passage_name(s, a0, a1)['en']}. Listen once, then record focusing on {TECHNIQUE_FOCUS[focus]['en']}.",
                "detailAr": f"كان قربك من {rname['ar']} في هذا الجانب {sc.get(focus)}/100 في {_passage_name(s, a0, a1)['ar']}. استمع مرة ثم سجّل مع التركيز على {TECHNIQUE_FOCUS[focus]['ar']}.",
                "done": any(x["created_at"] > start and x["reciter_id"] == rid for x in tech),
            })
        else:
            s, a0, a1 = (rows[0]["surah"], rows[0]["ayah_from"], rows[0]["ayah_to"]) if rows else DAILY_PASSAGES[0]
            items.append({
                "id": "imitate", "type": "imitate", "reciterId": rid, "surah": s, "from": a0, "to": a1, "focus": None,
                "titleEn": f"Compare your technique with {rname['en']}", "titleAr": f"قارن أسلوبك بأسلوب {rname['ar']}",
                "detailEn": "Record the passage and measure pace, breath, melody and madd lengths against the reciter.",
                "detailAr": "سجّل المقطع وقِس السرعة والنفَس واللحن والمدود مقارنةً بالقارئ.",
                "done": False,
            })

    # 4. spaced review of something recited well a while ago, else continue where you stopped
    old = [r for r in rows if (today - _day(r["created_at"])).days >= 3 and (r["word_accuracy"] or 0) >= 0.9]
    recent_keys = {(r["surah"], r["ayah_from"], r["ayah_to"]) for r in rows if (today - _day(r["created_at"])).days < 3}
    review = next((r for r in old if (r["surah"], r["ayah_from"], r["ayah_to"]) not in recent_keys), None)
    if review:
        s, a0, a1 = review["surah"], review["ayah_from"], review["ayah_to"]
        days = (today - _day(review["created_at"])).days
        items.append({"id": "review", "type": "review", "surah": s, "from": a0, "to": a1,
                      "titleEn": f"Review {_passage_name(s, a0, a1)['en']}", "titleAr": f"راجع {_passage_name(s, a0, a1)['ar']}",
                      "detailEn": f"You recited it well {days} days ago. Recite it once from memory to keep it fresh.",
                      "detailAr": f"أتقنته قبل {days} أيام. اقرأه مرة من حفظك ليبقى راسخًا.",
                      "done": done_since(s, a0, a1, start)})
    elif rows:
        r = rows[0]
        n_ayahs = quran.surah_meta(r["surah"])["ayahs"]
        length = r["ayah_to"] - r["ayah_from"] + 1
        if r["ayah_to"] < n_ayahs:
            s, a0, a1 = r["surah"], r["ayah_to"] + 1, min(n_ayahs, r["ayah_to"] + length)
        else:
            s, a0, a1 = DAILY_PASSAGES[today.toordinal() % len(DAILY_PASSAGES)]
        items.append({"id": "continue", "type": "continue", "surah": s, "from": a0, "to": a1,
                      "titleEn": f"Continue: {_passage_name(s, a0, a1)['en']}", "titleAr": f"تابع: {_passage_name(s, a0, a1)['ar']}",
                      "detailEn": "The next passage after your last practice.", "detailAr": "المقطع التالي بعد آخر تدريب لك.",
                      "done": done_since(s, a0, a1, start)})
    if not items:
        d = daily(user_id)
        items.append({"id": "start", "type": "start", "surah": d["surah"], "from": d["from"], "to": d["to"],
                      "titleEn": f"Start with {_passage_name(d['surah'], d['from'], d['to'])['en']}",
                      "titleAr": f"ابدأ بـ{_passage_name(d['surah'], d['from'], d['to'])['ar']}",
                      "detailEn": "Record it in the Tajweed Coach. Your plan is built from your results, so it starts after your first attempt.",
                      "detailAr": "سجّله في مدرب التجويد. تُبنى خطتك من نتائجك، فتبدأ بعد أول محاولة.",
                      "done": d["completed"]})
    return {"date": today.isoformat(), "items": items, "basedOn": {"attempts": len(rows), "techniqueComparisons": len(tech)}}
