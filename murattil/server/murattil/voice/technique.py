"""Technique comparison: how does the user's recitation of a passage differ from a reciter's
recitation of the same passage?

Both recordings are aligned to the text word by word with the Quran recogniser, so every measure
is compared at the same words regardless of tempo:

  pacing          speech rate (vowel units per second of speech) and duration of every ayah
  breath          where each pauses (between which words), whether a pause falls on a waqf sign,
                  and the longest stretch recited on one breath
  pitch movement  each word's pitch relative to the speaker's own median, compared as a melody
                  (correlation), plus melodic range and the cadence at the end of each ayah
  madd            held-vowel lengths of madd words, in counts of each reciter's own tempo
  tone            resonance (vocal-tract length), warmth and brightness

Every number is a measurement on the two recordings. Scores are closeness to the reference
reciter (100 = same), not judgements of correctness.
"""
from __future__ import annotations

import math

import numpy as np

from ..audio import analysis, world
from ..audio.vad import pauses, trim
from ..tajweed import asr, checks
from ..tajweed.coach import WAQF_SIGNS, CoachError, align_words, passage_with_rules

SR = 16000
POINTS = 8          # pitch samples per word in the contour data
MIN_CONF = 0.35     # words aligned less confidently than this in either recording are left out
MIN_PAUSE = 0.3     # seconds of silence that count as a pause (a stop or a breath)
MADD_RULES = {"madd-muttasil": (4, 5), "madd-munfasil": (4, 5), "madd-lazim-kalimi-muthaqqal": (6, 6),
              "madd-lazim-kalimi-mukhaffaf": (6, 6), "madd-tabee-kalimi": (2, 2)}


class TechniqueUnavailable(RuntimeError):
    pass


def _side(model, y: np.ndarray, surah: int, a_from: int, a_to: int) -> dict:
    y, off = trim(y, SR)
    al = align_words(model, y, surah, a_from, a_to, passage_with_rules(surah, a_from, a_to))
    words = [w for w in al["words"] if w["ayah"] > 0]
    f0, _ = world.f0_only(y.astype(np.float64), SR, accurate=True)
    st, voiced = analysis.clean_f0_st(f0)
    med = float(np.median(st[voiced])) if voiced.any() else 0.0
    feats = checks.frame_features(y)
    unit, basis = checks.harakah_unit(feats, [w for w in words if w.get("seg_local") and w["confidence"] >= 0.5])
    return {"y": y, "off": off, "dur": y.size / SR, "words": words, "st": st, "voiced": voiced, "median": med,
            "gaps": pauses(y, SR, MIN_PAUSE), "feats": feats, "unit": unit, "unitBasis": basis}


def _onset(w: dict) -> float | None:
    return w["core_local"][0] if w.get("core_local") else None


def _sound_end(side: dict, t: float) -> float:
    """End of the sound that is going on at time t (start of the next pause, or the end of the audio)."""
    return next((g0 for g0, g1 in side["gaps"] if g1 > t and g0 >= t), side["dur"])


def _word_pitch(side: dict, w: dict) -> list[float | None]:
    """POINTS pitch samples (semitones relative to the speaker's median) across a word."""
    if not w.get("core_local"):
        return [None] * POINTS
    a = w["core_local"][0]
    b = max(w["seg_local"][1] if w.get("seg_local") else w["core_local"][1], a + 0.05)
    out = []
    for k in range(POINTS):
        t0 = a + (b - a) * k / POINTS
        t1 = a + (b - a) * (k + 1) / POINTS
        i0, i1 = int(t0 / 0.005), max(int(t1 / 0.005), int(t0 / 0.005) + 1)
        v = side["voiced"][i0:i1]
        if v.sum() >= max(1, (i1 - i0) // 3):
            out.append(round(float(np.median(side["st"][i0:i1][v]) - side["median"]), 2))
        else:
            out.append(None)
    return out


def _pauses_after(side: dict) -> dict[int, float]:
    """{word index: pause seconds} for pauses between the start of a word and the start of the next."""
    words = side["words"]
    out: dict[int, float] = {}
    for g0, g1 in side["gaps"]:
        for i in range(len(words) - 1):
            a, b = _onset(words[i]), _onset(words[i + 1])
            if a is None or b is None:
                continue
            if a <= g0 and g1 <= b + 0.25:
                out[i] = round(out.get(i, 0) + (min(g1, b) - g0), 2)
                break
    return out


def _phrases(side: dict) -> list[float]:
    """Lengths of the stretches recited without a pause, from the first word to the end of the last."""
    t0 = next((_onset(w) for w in side["words"] if _onset(w) is not None), None)
    if t0 is None:
        return []
    last = next((_onset(w) for w in reversed(side["words"]) if _onset(w) is not None))
    t1 = _sound_end(side, last)
    out, t = [], t0
    for g0, g1 in side["gaps"]:
        if g0 >= t and g1 <= t1:
            out.append(g0 - t)
            t = g1
    out.append(t1 - t)
    return [x for x in out if x > 0]


def _seg(side: dict, w: dict) -> list[float] | None:
    """Word extent in seconds of the original (untrimmed) recording, for playback."""
    if not w.get("seg_local"):
        return None
    return [round(side["off"] + w["seg_local"][0], 3), round(side["off"] + w["seg_local"][1], 3)]


def _madd_seconds(side: dict, w: dict) -> float | None:
    if not w.get("seg_local"):
        return None
    a, b = int(w["seg_local"][0] / checks.HOP), int(w["seg_local"][1] / checks.HOP)
    d = checks.sustained_vowel(side["feats"], a, b)
    return d if d > 0.05 else None


def _corr(a: list[float], b: list[float]) -> float | None:
    if len(a) < 4:
        return None
    x, y = np.asarray(a), np.asarray(b)
    if x.std() < 1e-6 or y.std() < 1e-6:
        return None
    return float(np.corrcoef(x, y)[0, 1])


def _closeness(ratio: float, k: float = 2.5) -> int:
    return int(round(100 * math.exp(-abs(math.log(max(ratio, 1e-3))) * k)))


def compare(user16: np.ndarray, ref16: np.ndarray, surah: int, a_from: int, a_to: int, reciter_name: dict,
            progress=None) -> dict:
    prog = progress or (lambda s, p: None)
    try:
        model = asr.load()
    except asr.AsrUnavailable as e:
        raise TechniqueUnavailable("Technique comparison needs the Quran speech-recognition model, which is not installed on this server.") from e
    prog("your recitation", 40)
    u = _side(model, user16, surah, a_from, a_to)
    prog("reference recitation", 60)
    r = _side(model, ref16, surah, a_from, a_to)
    prog("comparison", 80)
    name_en, name_ar = reciter_name["en"], reciter_name["ar"]
    words = []
    pu, pr = _pauses_after(u), _pauses_after(r)
    for i, (wu, wr) in enumerate(zip(u["words"], r["words"])):
        usable = wu["confidence"] >= MIN_CONF and wr["confidence"] >= MIN_CONF and wu.get("core_local") and wr.get("core_local")
        madd = next((h for h in MADD_RULES if h in wu["rules"]), None)
        entry = {
            "i": i, "ayah": wu["ayah"], "word": wu["word"], "text": wu["text"], "usable": bool(usable),
            "user": _word_pitch(u, wu) if usable else [None] * POINTS,
            "ref": _word_pitch(r, wr) if usable else [None] * POINTS,
            "userSeg": _seg(u, wu), "refSeg": _seg(r, wr),
            "userPauseAfter": pu.get(i), "refPauseAfter": pr.get(i),
            "waqfAfter": any(c in WAQF_SIGNS for c in wu["text"]),
            "ayahEnd": i == len(u["words"]) - 1 or u["words"][i + 1]["ayah"] != wu["ayah"],
        }
        if usable and madd:
            us, rs = _madd_seconds(u, wu), _madd_seconds(r, wr)
            if us and rs:
                entry["madd"] = {"rule": madd, "userSeconds": round(us, 2), "refSeconds": round(rs, 2),
                                 "userCounts": round(us / u["unit"], 1) if u["unit"] else None,
                                 "refCounts": round(rs / r["unit"], 1) if r["unit"] else None}
        words.append(entry)
    usable = [w for w in words if w["usable"]]
    if len(usable) < min(len(words), max(2, math.ceil(0.5 * len(words)))):
        raise CoachError("Your recording and the reference could not be matched word by word. Recite the same passage clearly and try again.")

    # ---- pacing: articulation rate between the first and last word both recordings share, pauses excluded
    common = [i for i in range(len(words)) if _onset(u["words"][i]) is not None and _onset(r["words"][i]) is not None]
    rate_u = rate_r = None
    if len(common) >= 2:
        i0, i1 = common[0], common[-1]
        moras = sum(checks.moras(words[i]["text"]) for i in range(i0, i1))

        def articulation(side, pauses):
            t = _onset(side["words"][i1]) - _onset(side["words"][i0])
            return max(0.05, t - sum(v for k, v in pauses.items() if i0 <= k < i1))
        rate_u, rate_r = moras / articulation(u, pu), moras / articulation(r, pr)
    ayahs = []
    for a in range(a_from, a_to + 1):
        iu = [w for w in u["words"] if w["ayah"] == a and w.get("core_local")]
        ir = [w for w in r["words"] if w["ayah"] == a and w.get("core_local")]
        if iu and ir:
            du = _sound_end(u, _onset(iu[-1])) - _onset(iu[0])
            dr = _sound_end(r, _onset(ir[-1])) - _onset(ir[0])
            ayahs.append({"ayah": a, "userSeconds": round(du, 2), "refSeconds": round(dr, 2)})
    pace_ratio = rate_u / rate_r if rate_u and rate_r else None

    # ---- breath
    def longest(side):
        return max(_phrases(side), default=0.0)
    mid_u = {i for i in pu if not words[i]["ayahEnd"]}
    mid_r = {i for i in pr if not words[i]["ayahEnd"]}
    ends = [w["i"] for w in words if w["ayahEnd"] and w["i"] < len(words) - 1]
    ends_u = sum(1 for i in ends if i in pu)
    ends_r = sum(1 for i in ends if i in pr)
    shared = mid_u & mid_r
    breath_score = None
    if mid_u or mid_r or ends:
        tp = len(shared) + min(ends_u, ends_r)
        denom = (len(mid_u) + ends_u + len(mid_r) + ends_r) / 2
        breath_score = int(round(100 * tp / denom)) if denom else 100

    # ---- pitch movement
    fu, fr, wu_m, wr_m = [], [], [], []
    for w in usable:
        pairs = [(a, b) for a, b in zip(w["user"], w["ref"]) if a is not None and b is not None]
        fu += [a for a, _ in pairs]
        fr += [b for _, b in pairs]
        if pairs:
            wu_m.append(float(np.mean([a for a, _ in pairs])))
            wr_m.append(float(np.mean([b for _, b in pairs])))
    melody_fine = _corr(fu, fr)
    melody_words = _corr(wu_m, wr_m)

    def rng(side):
        v = side["st"][side["voiced"]]
        return float(np.percentile(v, 90) - np.percentile(v, 10)) if v.size > 10 else 0.0
    range_u, range_r = rng(u), rng(r)
    cadences = []
    for a in range(a_from, a_to + 1):
        aw = [w for w in usable if w["ayah"] == a]
        if len(aw) >= 2:
            def cad(key):
                last = [x for x in aw[-1][key] if x is not None]
                rest = [x for w in aw[:-1] for x in w[key] if x is not None]
                return (float(np.mean(last[-3:])) - float(np.mean(rest))) if last and rest else None
            cu, cr = cad("user"), cad("ref")
            if cu is not None and cr is not None:
                cadences.append({"ayah": a, "user": round(cu, 1), "ref": round(cr, 1)})

    # ---- madd
    madds = [w["madd"] for w in usable if w.get("madd") and w["madd"]["rule"] != "madd-tabee-kalimi"]
    madd_score = None
    if madds:
        madd_score = int(round(np.mean([_closeness(m["userSeconds"] / m["refSeconds"], 1.5) for m in madds])))

    # ---- tone
    try:
        pu_prof = analysis.profile(u["y"], SR, params=world.analyze(u["y"], SR, accurate=False))
        pr_prof = analysis.profile(r["y"], SR, params=world.analyze(r["y"], SR, accurate=False))
        du, dr = analysis.descriptors(pu_prof), analysis.descriptors(pr_prof)
        diffs = [abs((du[k] or 0) - (dr[k] or 0)) for k in ("warmth", "brightness", "resonance") if du.get(k) is not None and dr.get(k) is not None]
        tone_score = int(round(100 - np.mean(diffs))) if diffs else None
        tone_notes = [c for c in analysis.compare(pu_prof, pr_prof) if c["key"] in ("resonance", "warmth")]
    except ValueError:
        du = dr = None
        tone_score, tone_notes = None, []

    scores = {
        "pace": None if pace_ratio is None else _closeness(pace_ratio),
        "breath": breath_score,
        "melody": None if melody_fine is None else int(round(100 * max(0.0, melody_fine))),
        "madd": madd_score,
        "tone": tone_score,
    }
    tips = _tips(pace_ratio, mid_u - mid_r, mid_r - mid_u, words, longest(u), longest(r), melody_fine, range_u, range_r,
                 madds, cadences, tone_notes, name_en, name_ar)
    present = [v for v in scores.values() if v is not None]
    return {
        "scores": scores,
        "overall": int(round(np.mean(present))) if present else None,
        "pacing": {"userRate": None if rate_u is None else round(rate_u, 2), "refRate": None if rate_r is None else round(rate_r, 2),
                   "ratio": None if pace_ratio is None else round(pace_ratio, 2), "ayahs": ayahs},
        "breath": {"userLongestPhrase": round(longest(u), 1), "refLongestPhrase": round(longest(r), 1),
                   "userMidAyahPauses": len(mid_u), "refMidAyahPauses": len(mid_r), "sharedPauses": len(shared),
                   "userAyahEndPauses": ends_u, "refAyahEndPauses": ends_r, "ayahBoundaries": len(ends)},
        "melody": {"correlation": None if melody_fine is None else round(melody_fine, 2),
                   "wordCorrelation": None if melody_words is None else round(melody_words, 2),
                   "userRangeSt": round(range_u, 1), "refRangeSt": round(range_r, 1), "cadences": cadences},
        "madd": madds,
        "tone": {"user": du, "reference": dr, "notes": tone_notes},
        "harakah": {"userSeconds": None if u["unit"] is None else round(u["unit"], 3),
                    "refSeconds": None if r["unit"] is None else round(r["unit"], 3)},
        "words": words,
        "tips": tips,
        "wordsCompared": len(usable),
        "wordsTotal": len(words),
    }


def _fmt_word(w: dict) -> str:
    return f"«{w['text']}»"


def _tips(pace_ratio, user_only, ref_only, words, long_u, long_r, melody, range_u, range_r, madds, cadences,
          tone_notes, name_en, name_ar) -> list[dict]:
    tips: list[tuple[float, dict]] = []
    if pace_ratio is not None and pace_ratio > 1.12:
        tips.append((abs(math.log(pace_ratio)), {
            "key": "pace", "en": f"You recite about {pace_ratio:.1f}× faster than {name_en}. Slow down so every letter and madd gets its full length — try matching the reference ayah by ayah.",
            "ar": f"تلاوتك أسرع من {name_ar} بنحو {pace_ratio:.1f} مرة. تمهّل حتى يأخذ كل حرف ومدّ حقه، وحاول مجاراة القارئ آيةً آية."}))
    elif pace_ratio is not None and pace_ratio < 0.88:
        tips.append((abs(math.log(pace_ratio)), {
            "key": "pace", "en": f"You recite about {1 / pace_ratio:.1f}× slower than {name_en}. Keep the flow steady between words.",
            "ar": f"تلاوتك أبطأ من {name_ar} بنحو {1 / pace_ratio:.1f} مرة. حافظ على انسيابية ثابتة بين الكلمات."}))
    if user_only:
        ws = ", ".join(_fmt_word(words[i]) for i in sorted(user_only)[:3])
        tips.append((0.5 + 0.1 * len(user_only), {
            "key": "breath", "en": f"You took a breath after {ws}, where {name_en} continues. Take a fuller breath at the ayah start so you can carry the phrase.",
            "ar": f"توقفت للتنفس بعد {ws} بينما يواصل {name_ar}. خذ نفَسًا أعمق في بداية الآية لتُكمل الجملة."}))
    if ref_only:
        ws = ", ".join(_fmt_word(words[i]) for i in sorted(ref_only)[:3])
        tips.append((0.3 + 0.05 * len(ref_only), {
            "key": "breath", "en": f"{name_en} pauses after {ws}; you recite straight through. Notice where the reciter stops (often at waqf signs).",
            "ar": f"يقف {name_ar} بعد {ws} بينما تصل أنت. لاحظ مواضع وقوف القارئ (وغالبًا تكون عند علامات الوقف)."}))
    if long_r > 0 and long_u < 0.6 * long_r:
        tips.append((0.4, {
            "key": "breath", "en": f"{name_en} recites up to {long_r:.0f} s on one breath; your longest phrase was {long_u:.0f} s. Practise breathing from the diaphragm and releasing air slowly.",
            "ar": f"يتلو {name_ar} حتى {long_r:.0f} ثانية بنفَس واحد، وأطول مقطع لك {long_u:.0f} ثانية. تدرّب على التنفس من الحجاب الحاجز وإخراج الهواء ببطء."}))
    if melody is not None and melody < 0.4:
        tips.append((0.6 - melody, {
            "key": "melody", "en": f"Your melody moves differently from {name_en}'s (similarity {max(0, melody) * 100:.0f}%). Listen to one ayah, then copy where the voice rises and falls, word by word.",
            "ar": f"لحنك يتحرك بشكل مختلف عن {name_ar} (تشابه {max(0, melody) * 100:.0f}%). استمع إلى آية ثم قلّد مواضع الصعود والهبوط كلمةً كلمة."}))
    if range_r > 0 and range_u < 0.65 * range_r:
        tips.append((0.35, {
            "key": "melody", "en": f"{name_en} uses a wider pitch range ({range_r:.0f} vs your {range_u:.0f} semitones). Let your voice rise more on the emphasised words.",
            "ar": f"يستخدم {name_ar} مدى صوتيًا أوسع ({range_r:.0f} مقابل {range_u:.0f} نصف درجة). اسمح لصوتك بالارتفاع أكثر في الكلمات المؤكدة."}))
    short = [m for m in madds if m["userSeconds"] < 0.7 * m["refSeconds"]]
    if short:
        m = min(short, key=lambda m: m["userSeconds"] / m["refSeconds"])
        w = next(x for x in words if x.get("madd") is m)
        tips.append((0.7, {
            "key": "madd", "en": f"Hold the madd in {_fmt_word(w)} longer: {name_en} holds it {m['refSeconds']:.1f} s, you held it {m['userSeconds']:.1f} s.",
            "ar": f"أطل المد في {_fmt_word(w)}: يمده {name_ar} {m['refSeconds']:.1f} ث، ومددته {m['userSeconds']:.1f} ث."}))
    falls = [c for c in cadences if c["ref"] < -1 and c["user"] > 0]
    if falls:
        tips.append((0.3, {
            "key": "melody", "en": f"{name_en} lets the voice fall at the end of the ayah; yours rises. Settle the final word.",
            "ar": f"ينزل {name_ar} بصوته في نهاية الآية بينما يرتفع صوتك. أنزل نبرة الكلمة الأخيرة."}))
    tone = next((n for n in tone_notes if n["key"] == "warmth" and abs(n["delta"]) > 2), None)
    if tone and tone["delta"] > 0:
        tips.append((0.25, {
            "key": "tone", "en": f"{name_en}'s tone is warmer and darker. Recite from the chest with a relaxed, open throat (as at the start of a yawn) instead of from the front of the mouth.",
            "ar": f"نبرة {name_ar} أدفأ وأعمق. اقرأ من الصدر مع حلق مسترخٍ ومفتوح (كبداية التثاؤب) بدل إخراج الصوت من مقدمة الفم."}))
    elif tone:
        tips.append((0.25, {
            "key": "tone", "en": f"{name_en}'s tone is brighter and more forward. Lift the soft palate and let the sound ring at the front of the face.",
            "ar": f"نبرة {name_ar} أكثر إشراقًا وبروزًا. ارفع سقف الحلق اللين ودع الصوت يرنّ في مقدمة الوجه."}))
    res = next((n for n in tone_notes if n["key"] == "resonance" and abs(n["delta"]) > 0.7), None)
    if res and not tone:
        tips.append((0.1, {
            "key": "tone", "en": f"{name_en}'s voice resonates {'deeper' if res['delta'] > 0 else 'higher'} than yours. This is largely anatomy; a relaxed throat helps a little, and the Voice Studio lets you hear your recitation with the reciter's resonance.",
            "ar": f"رنين صوت {name_ar} {'أعمق' if res['delta'] > 0 else 'أعلى'} من صوتك. هذا يعود في الغالب إلى طبيعة الحنجرة؛ الحلق المسترخي يساعد قليلًا، ويمكنك في استوديو الصوت سماع تلاوتك برنين القارئ."}))
    tips.sort(key=lambda x: -x[0])
    return [t for _, t in tips[:5]]
