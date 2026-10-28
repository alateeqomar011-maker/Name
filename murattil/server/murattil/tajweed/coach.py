"""Tajweed Coach: one analysis of a recitation of a known passage.

Pipeline: decode → audio quality → Quran CTC recognition → forced alignment of the expected text →
word-level comparison (missed / extra / substituted / unclear words, per-word confidence) →
acoustic tajweed checks inside aligned words (madd, ghunnah, qalqalah) → bilingual report.

Rules for the report, enforced here:
  * nothing is reported as certain; every finding has a confidence and a label
  * the summary never says a recitation is perfect, and always carries the teacher note
  * when the recogniser is not installed, word-level and tajweed checks are reported as
    unavailable rather than guessed
"""
from __future__ import annotations

import math
import time
from typing import Callable

import numpy as np

from .. import quran
from ..audio.io import AudioError, decode, loudness_lufs
from ..audio.vad import pauses, speech_segments, trim
from . import asr, checks, content
from .ctc import char_similarity, edit_ops, forced_align, forced_frame_logps, greedy, segment_gop

SR = 16000
RULES_BY_INDEX = None


class CoachError(RuntimeError):
    """A failure whose message is safe to show to the user."""


def _rules_index() -> list[dict]:
    global RULES_BY_INDEX
    if RULES_BY_INDEX is None:
        RULES_BY_INDEX = quran.rules()
    return RULES_BY_INDEX


def passage_with_rules(s: int, a_from: int, a_to: int) -> list[dict]:
    """Words of the passage, each with the set of tajweed hukms whose spans touch it."""
    rules = _rules_index()
    words = []
    for a in range(a_from, a_to + 1):
        ay = quran.ayah(s, a)
        toks = [t for t in ay["tokens"] if not t.get("d")]
        for i, t in enumerate(toks):
            w0, w1 = t["s"], t["s"] + len(t["t"])
            hukms = set()
            spans = []
            for st, en, ri in ay["tj"]:
                if st < w1 and en > w0:
                    hukms.add(rules[ri]["id"])
                    spans.append([max(st, w0) - w0, min(en, w1) - w0, rules[ri]["id"], en > w1])
            words.append({"surah": s, "ayah": a, "word": t["w"], "text": t["t"], "norm": quran.normalize(t["t"]),
                          "rules": hukms, "spans": spans, "lastInAyah": i == len(toks) - 1})
    return words


def _loose(w: str) -> str:
    """Spelling-insensitive key: Uthmani and standard spellings differ mainly in alifs and hamza
    seats (العلمين / العالمين), so those are dropped when deciding whether two words are the same."""
    return w.replace("ا", "").replace("ء", "")


def word_cost(expected: str, heard: str) -> float:
    """0 = same word, 1 = unrelated (used for aligning expected and recognised word sequences)."""
    if expected == heard:
        return 0.0
    if _loose(expected) == _loose(heard):
        return 0.05
    return 1.0 - char_similarity(expected, heard)


def _dedup(w: str) -> str:
    """Collapse an immediately repeated piece (عليكمكم → عليكم). On a long held vowel the recogniser
    often writes the same syllable twice; measured on professional recitations this is the most
    common way a correctly recited word gets transcribed differently."""
    for n in (4, 3, 2, 1):
        i = 0
        while i + 2 * n <= len(w):
            if w[i:i + n] == w[i + n:i + 2 * n]:
                w = w[:i + n] + w[i + 2 * n:]
            else:
                i += 1
    return w


def match_cost(expected: str, heard: str) -> float:
    """word_cost that forgives the recogniser's repeated syllables."""
    c = word_cost(expected, heard)
    if c <= 0.05:
        return c
    return min(c, word_cost(expected, _dedup(heard)), word_cost(_dedup(expected), _dedup(heard)))


def refine_ops(ops: list[tuple], expected: list[str], hyp: list[str]) -> list[tuple]:
    """Edit operations as (op, ref_index, hyp_indices, cost), with a word the recogniser split in
    two (العظيم → الع ظيم) or two words it wrote as one merged back where that matches better."""
    out = [(op, ri, () if hi is None else (hi,), match_cost(expected[ri], hyp[hi]) if ri is not None and hi is not None else None)
           for op, ri, hi in ops]
    changed = True
    while changed:
        changed = False
        for k, (op, ri, his, cost) in enumerate(out):
            if ri is None or not his:
                continue
            for j in (k + 1, k - 1):
                if not (0 <= j < len(out)):
                    continue
                op2, ri2, his2, _ = out[j]
                if op2 == "ins" and his2:
                    hs = tuple(sorted(his + his2))
                    c = match_cost(expected[ri], "".join(hyp[h] for h in hs))
                    if c < cost and c <= 0.25:
                        out[k] = ("match", ri, hs, c)
                        del out[j]
                        changed = True
                        break
                if op2 == "del" and ri2 is not None:
                    pair = (ri2, ri) if j < k else (ri, ri2)
                    c = match_cost(expected[pair[0]] + expected[pair[1]], "".join(hyp[h] for h in his))
                    if c < cost and c <= 0.25:
                        out[k] = ("match", ri, his, c)
                        out[j] = ("match", ri2, his, c)
                        changed = True
                        break
            if changed:
                break
    return out


def _hyp_words(model, toks: list[tuple[int, int, int]]) -> list[dict]:
    """Group greedy tokens into words at the word-start marker, keeping each word's token ids."""
    out: list[dict] = []
    for tid, a, b in toks:
        piece = model.vocab.get(tid, "")
        if piece in ("<unk>", "<blank>"):
            continue
        if piece.startswith(asr.WORD) or not out:
            out.append({"ids": [], "raw": ""})
        out[-1]["ids"].append(tid)
        out[-1]["raw"] += piece
    for h in out:
        h["text"] = quran.normalize(h["raw"].replace(asr.WORD, " "))
    return [h for h in out if h["text"]]


def basmalah_words(surah: int) -> list[dict]:
    toks = [t for t in quran.ayah(1, 1)["tokens"] if not t.get("d")]
    return [{"surah": surah, "ayah": 0, "word": i + 1, "text": t["t"], "norm": quran.normalize(t["t"]),
             "rules": set(), "spans": [], "lastInAyah": i == len(toks) - 1, "basmalah": True}
            for i, t in enumerate(toks)]


def audio_quality(y: np.ndarray, sr: int) -> dict:
    segs = speech_segments(y, sr)
    speech = np.zeros(y.size, dtype=bool)
    for a, b in segs:
        speech[int(a * sr):int(b * sr)] = True
    clip = float(np.mean(np.abs(y) > 0.985))
    def db(x):
        return 10 * math.log10(float(np.mean(x ** 2)) + 1e-12)
    snr = None
    if speech.any() and (~speech).sum() > sr * 0.2:
        snr = db(y[speech]) - db(y[~speech])
    lufs = loudness_lufs(y, sr)
    issues = []
    if lufs < -40:
        issues.append({"key": "quiet", "en": "The recording is very quiet. Move closer to the microphone.",
                       "ar": "التسجيل منخفض الصوت جدًا. اقترب من الميكروفون."})
    if clip > 0.002:
        issues.append({"key": "clipping", "en": "The recording is distorted (too loud). Move a little further from the microphone.",
                       "ar": "التسجيل مشوّه لارتفاع الصوت. ابتعد قليلًا عن الميكروفون."})
    if snr is not None and snr < 12:
        issues.append({"key": "noisy", "en": "There is a lot of background noise, which lowers accuracy.",
                       "ar": "يوجد ضجيج كبير في الخلفية، مما يقلل دقة التحليل."})
    return {"durationS": round(y.size / sr, 2), "speechS": round(float(speech.sum() / sr), 2),
            "snrDb": None if snr is None else round(snr, 1), "clippingPct": round(clip * 100, 3),
            "loudnessLufs": round(lufs, 1), "issues": issues, "segments": segs}


def _label(c: float) -> str:
    return "high" if c >= 0.75 else "medium" if c >= 0.5 else "low"


def _finding(kind: str, w: dict | None, confidence: float, severity: str, measured: dict | None = None,
             hukm: str | None = None, extra: dict | None = None) -> dict:
    base = content.RULES[kind]
    f = {
        "kind": kind, "severity": severity, "confidence": round(confidence, 2), "confidenceLabel": _label(confidence),
        "en": base["en"], "ar": base["ar"], "tipEn": base["tip_en"], "tipAr": base["tip_ar"],
        "stepsEn": content.STEPS[kind]["en"], "stepsAr": content.STEPS[kind]["ar"],
        "measured": measured or {},
    }
    if w is not None:
        f.update({"surah": w["surah"], "ayah": w["ayah"], "word": w["word"], "text": w["text"],
                  "seg": w.get("seg")})
    if hukm:
        info = content.HUKM.get(hukm)
        f["hukm"] = hukm
        if info:
            f["ruleEn"], f["ruleAr"] = info["en"], info["ar"]
    if extra:
        f.update(extra)
    return f


# Word verdict thresholds. Calibrated on real recordings with scripts/evaluate_coach.py: correctly
# recited words of professional reciters (false alarms) against controlled real mistakes (words
# deleted, replaced or repeated in those recordings). See README, "Measured accuracy".
OK_COST, NEAR_COST = 0.1, 0.25          # text distance between expected and recognised word
OK_CONF, NEAR_CONF = 0.35, 0.6          # alignment confidence needed at each text distance
SUBST_CONF = 0.8                        # below this a different recognised word counts as a substitution
MISSED_CONF, MISSED_DUR = 0.3, 0.15

WAQF_SIGNS = set("ۖۗۘۙۚۛۜ")

# Acoustic tajweed checks that are reported. A check stays off when, measured on professional
# recitations, it fires too often on correct recitation to be trusted (it is still measured).
# Measured with scripts/evaluate_coach.py on 204 professional and 131 crowd-sourced recordings:
# madd short (below 0.45 of the required counts): 4.8% of correct professional madds flagged;
#   62% of real madds shortened to ~1.5 counts caught — on, as a warning.
# madd long: 39% of professional madds measure "long" (reciters' own tempo varies) — off.
# ghunnah: "short" on 32% of professional ghunnahs — off.
# qalqalah: "missing" on 77% of professional qalqalahs (room reverb fills the closure) — off.
CHECKS = {"madd": True, "madd_long": False, "ghunnah": False, "qalqalah": False, "waqf_midword": True}
MADD_SHORT, MADD_LONG = 0.45, 1.7       # a madd held below/above this share of its required counts


def word_verdict(op: str, cost: float | None, conf: float, dur: float) -> str:
    if op == "del" or cost is None:
        if dur < MISSED_DUR or conf < MISSED_CONF:
            return "missed"
        return "ok" if conf >= NEAR_CONF else "unclear"
    if cost <= OK_COST:
        return "ok" if conf >= OK_CONF else "unclear"
    if cost <= NEAR_COST:
        return "ok" if conf >= NEAR_CONF else "unclear"
    # the model wrote a different word; if the expected word still fits the audio well it is only
    # "unclear", otherwise a likely substitution
    return "unclear" if conf >= SUBST_CONF else "substituted"


def align_words(model, y: np.ndarray, surah: int, a_from: int, a_to: int, words: list[dict] | None = None,
                progress: Callable[[str, int], None] | None = None) -> dict:
    """Recognise `y` (16 kHz, already trimmed) and force-align the expected words of the passage.

    The model can spell a word several ways (with or without diacritics, different word pieces).
    Where its free transcription agrees with an expected word, that word is aligned with the model's
    own spelling; elsewhere with the reference spelling. A word's confidence then measures how well
    the expected word explains the audio, not which spelling the model happened to prefer.

    Returns {words (with seg_local/core_local in seconds of `y`, confidence, gop), ops, hyp, rec}.
    """
    prog = progress or (lambda s, p: None)
    words = words if words is not None else passage_with_rules(surah, a_from, a_to)
    rec = model.recognize_long(y)
    hyp_words = _hyp_words(model, greedy(rec.logp, rec.blank))
    hyp = [h["text"] for h in hyp_words]
    prog("alignment", 45)
    options = [False, True] if (a_from == 1 and surah not in (1, 9)) else [False]
    best = None
    for with_bas in options:
        ws = (basmalah_words(surah) + words) if with_bas else words
        ref_ids, ref_owner = model.passage_tokens(surah, a_from, a_to, ws, include_basmalah=with_bas)
        ref_by_word: list[list[int]] = [[] for _ in ws]
        for tid, wi in zip(ref_ids, ref_owner):
            if 0 <= wi < len(ws):
                ref_by_word[wi].append(tid)
        norms = [w["norm"] for w in ws]
        ops = refine_ops(edit_ops(norms, hyp, sub_cost=word_cost), norms, hyp)
        targets, owner = [], []
        shared = {}
        for op, ri, his, cost in ops:
            if len(his) == 1:
                shared.setdefault(his[0], []).append(ri)
        for op, ri, his, cost in ops:
            if ri is None:
                continue
            # the model's own spelling where it agrees (a hyp word shared by two expected words keeps the reference spelling)
            use_hyp = his and cost is not None and cost <= 0.25 and len(shared.get(his[0], [ri])) == 1
            toks = [t for h in his for t in hyp_words[h]["ids"]] if use_hyp else ref_by_word[ri]
            targets += toks
            owner += [ri] * len(toks)
        try:
            sp, lp = forced_align(rec.logp, targets, rec.blank)
        except ValueError:
            continue
        if best is None or lp > best[0]:
            best = (lp, ws, owner, sp, ops)
    if best is None:
        raise CoachError("The recording is too short for the selected ayahs. Did you select the right range?")
    _, words, tok_word, spans, ops = best
    words = [dict(w) for w in words]
    frame_lp = forced_frame_logps(rec.logp, spans, rec.blank)
    for wi, w in enumerate(words):
        mine = [sp for sp, tw in zip(spans, tok_word) if tw == wi and sp.start >= 0]
        if not mine:
            w["seg_local"] = w["core_local"] = None
            w["confidence"] = 0.0
            continue
        a, b = min(sp.start for sp in mine), max(sp.end for sp in mine)
        # extend to the blank frames that follow (CTC peaks are short; the word lasts until the next token)
        nxt = [sp.start for sp, tw in zip(spans, tok_word) if tw > wi and sp.start > b]
        b_ext = (min(nxt) - 1) if nxt else min(rec.logp.shape[0] - 1, b + int(0.4 / rec.frame_s))
        gop = segment_gop(rec.logp, a, b, float(frame_lp[a:b + 1].sum()))
        w["seg_local"] = [a * rec.frame_s, (b_ext + 1) * rec.frame_s]
        w["core_local"] = [a * rec.frame_s, (b + 1) * rec.frame_s]
        w["gop"] = round(gop, 3)
        w["confidence"] = float(min(1.0, math.exp(gop / 1.5)))
    return {"words": words, "ops": ops, "hyp": hyp, "rec": rec}


def analyze(audio: bytes, surah: int, a_from: int, a_to: int, max_seconds: float = 120,
            progress: Callable[[str, int], None] | None = None) -> dict:
    prog = progress or (lambda s, p: None)
    t0 = time.time()
    if not quran.valid_range(surah, a_from, a_to):
        raise CoachError("Invalid surah or ayah range.")
    if a_to - a_from > 30:
        raise CoachError("Choose at most 30 ayahs per analysis.")
    prog("decoding", 5)
    try:
        y = decode(audio, sr=SR, max_seconds=max_seconds)
    except AudioError as e:
        raise CoachError(str(e)) from e
    y, trim_off = trim(y, SR)
    if y.size < SR * 0.8:
        raise CoachError("No recitation was found in the recording.")
    peak = float(np.max(np.abs(y)))
    if peak > 0:
        y = y * min(1.0, 0.9 / peak) if peak > 0.9 else y
    quality = audio_quality(y, SR)
    words = passage_with_rules(surah, a_from, a_to)

    report: dict = {
        "passage": {"surah": surah, "from": a_from, "to": a_to},
        "quality": {k: v for k, v in quality.items() if k != "segments"},
        "teacherNote": content.TEACHER_NOTE,
        "asr": asr.status(),
    }

    try:
        model = asr.load()
    except asr.AsrUnavailable as e:
        report.update(_unavailable_report(words, quality, str(e)))
        report["processingSeconds"] = round(time.time() - t0, 1)
        prog("done", 100)
        return report

    prog("recognition", 25)
    al = align_words(model, y, surah, a_from, a_to, words, progress=prog)
    words, ops, hyp, rec = al["words"], al["ops"], al["hyp"], al["rec"]
    hyp_text = " ".join(hyp)
    for w in words:
        if w.get("seg_local"):
            # times in the user's original recording (used for playback)
            w["seg"] = [round(trim_off + w["seg_local"][0], 3), round(trim_off + w["seg_local"][1], 3)]
            w["core"] = [round(trim_off + w["core_local"][0], 3), round(trim_off + w["core_local"][1], 3)]
        else:
            w["seg"] = w["core"] = None

    # ---- word verdicts: free transcription and alignment confidence together
    findings: list[dict] = []
    for k, (op, ri, his, cost) in enumerate(ops):
        if ri is not None:
            w = words[ri]
            w["heard"] = "".join(hyp[h] for h in his) if his else None
            w["textCost"] = None if cost is None else round(cost, 3)
            dur = (w["seg_local"][1] - w["seg_local"][0]) if w.get("seg_local") else 0.0
            w["status"] = word_verdict(op, cost, w["confidence"], dur)
        else:  # insertion: attach to the closest preceding expected word
            prev = next((o[1] for o in reversed(ops[:k]) if o[1] is not None), None)
            anchor = words[prev] if prev is not None else words[0]
            anchor.setdefault("extraAfter", []).append(" ".join(hyp[h] for h in his))

    # skipped ayahs: every word missed
    for a in range(a_from, a_to + 1):
        aw = [w for w in words if w["ayah"] == a]
        if aw and all(w["status"] == "missed" for w in aw):
            for w in aw:
                w["status"] = "skipped"
            findings.append(_finding("skipped_ayah", aw[0], 0.7, "error", extra={"word": None, "text": None}))
    for w in words:
        st = w.get("status")
        if st == "missed":
            findings.append(_finding("missed_word", w, 0.6 if w["confidence"] < 0.15 else 0.5, "error"))
        elif st == "substituted":
            findings.append(_finding("substituted_word", w, 0.55, "error", measured={"heard": w["heard"]},
                                     extra={"makhraj": content.makhraj_hints(w["text"])}))
        elif st == "unclear":
            findings.append(_finding("unclear_word", w, 0.4, "warning", measured={"confidence": round(w["confidence"], 2)},
                                     extra={"makhraj": content.makhraj_hints(w["text"])}))
        if w.get("extraAfter"):
            findings.append(_finding("extra_word", w, 0.45, "warning", measured={"heard": " ".join(w["extraAfter"])}))

    # ---- acoustic tajweed checks inside well-aligned words
    prog("tajweed", 65)
    feats = checks.frame_features(y)
    unit, unit_basis = checks.harakah_unit(feats, [w for w in words if w.get("status") == "ok"])
    performed = 0
    rule_stats: dict[str, dict] = {}
    measurements: list[dict] = []

    def checked(h: str, flagged: bool) -> None:
        st = rule_stats.setdefault(h, {"checked": 0, "flagged": 0})
        st["checked"] += 1
        st["flagged"] += int(flagged)
    rules_meta = {r["id"]: r for r in _rules_index()}
    if unit is not None:
        for wi, w in enumerate(words):
            if w.get("status") != "ok" or w["confidence"] < 0.45 or not w.get("seg_local"):
                continue
            a, b = int(w["seg_local"][0] / checks.HOP), int(w["seg_local"][1] / checks.HOP)
            coach_rules = [h for h in w["rules"] if rules_meta.get(h, {}).get("coach")]
            for h in coach_rules:
                kind = rules_meta[h]["coach"]
                where = {"surah": w["surah"], "ayah": w["ayah"], "word": w["word"], "hukm": h}
                if kind == "madd":
                    lo, hi = rules_meta[h]["counts"]
                    if lo <= 2:
                        continue  # 2-count madds are the tempo reference, not scored
                    d = checks.sustained_vowel(feats, a, b)
                    counts = d / unit
                    measurements.append({**where, "kind": "madd", "counts": round(counts, 2), "required": [lo, hi]})
                    if not CHECKS["madd"]:
                        continue
                    performed += 1
                    too_long = CHECKS["madd_long"] and counts > MADD_LONG * hi
                    checked(h, counts < MADD_SHORT * lo or too_long)
                    conf = (0.6 if unit_basis == "natural-madd" else 0.45) * min(1.0, w["confidence"] + 0.2)
                    if counts < MADD_SHORT * lo:
                        findings.append(_finding("madd_short", w, conf, "warning", hukm=h,
                                                 measured={"counts": round(counts, 1), "required": [lo, hi], "seconds": round(d, 2)}))
                    elif too_long:
                        findings.append(_finding("madd_long", w, conf * 0.8, "info", hukm=h,
                                                 measured={"counts": round(counts, 1), "required": [lo, hi], "seconds": round(d, 2)}))
                elif kind == "ghunnah":
                    bb = b
                    if any(sp[3] for sp in w["spans"] if sp[2] == h) and wi + 1 < len(words) and words[wi + 1].get("seg_local"):
                        nb = words[wi + 1]["seg_local"]
                        bb = int((nb[0] + 0.4 * (nb[1] - nb[0])) / checks.HOP)
                    d = checks.nasal_murmur(feats, a, bb)
                    counts = d / unit
                    measurements.append({**where, "kind": "ghunnah", "counts": round(counts, 2), "required": [2, 2]})
                    if not CHECKS["ghunnah"]:
                        continue
                    performed += 1
                    checked(h, counts < 0.8)
                    if counts < 0.8:
                        findings.append(_finding("ghunnah_short", w, 0.35 * min(1.0, w["confidence"] + 0.2), "info", hukm=h,
                                                 measured={"counts": round(counts, 1), "required": [2, 2], "seconds": round(d, 2)}))
                elif kind == "qalqalah":
                    if h == "qalqalah-kubra" and not w["lastInAyah"]:
                        continue
                    if h == "qalqalah-kubra":
                        wa, wb = max(a, b - int(0.35 / checks.HOP)), b
                    else:
                        sp = next((s for s in w["spans"] if s[2] == h), None)
                        frac = (sp[0] / max(len(w["text"]), 1)) if sp else 0.5
                        c = int(a + frac * (b - a))
                        wa, wb = max(a, c - 8), min(b, c + 12)
                    burst = checks.release_burst(feats, wa, wb)
                    measurements.append({**where, "kind": "qalqalah", "burst": bool(burst)})
                    if not CHECKS["qalqalah"]:
                        continue
                    performed += 1
                    checked(h, not burst)
                    if not burst:
                        findings.append(_finding("qalqalah_missing", w, 0.3 * min(1.0, w["confidence"] + 0.2), "info", hukm=h))

    # ---- pace and pauses
    speech_s = quality["speechS"] or (y.size / SR)
    n_moras = sum(checks.moras(w["text"]) for w in words)
    rate = n_moras / speech_s if speech_s > 0 else 0
    if rate > 9.0:
        findings.append(_finding("pace_rushed", None, 0.45, "info", measured={"unitsPerSecond": round(rate, 1)}))
    gaps = pauses(y, SR, 0.3)
    for a_s, b_s in gaps:
        for w in words:
            sg = w.get("core_local")
            if sg and sg[0] + 0.08 < a_s and b_s < sg[1] - 0.08 and w.get("status") == "ok":
                measurements.append({"surah": w["surah"], "ayah": w["ayah"], "word": w["word"], "kind": "waqf_midword",
                                     "pauseSeconds": round(b_s - a_s, 2)})
                if CHECKS["waqf_midword"]:
                    findings.append(_finding("waqf_midword", w, 0.35, "info", measured={"pauseSeconds": round(b_s - a_s, 2)}))

    # ---- fluency: articulation rate and where the reciter paused inside ayahs
    seq = [w for w in words if w["ayah"] > 0 and w.get("core_local")]
    inside = off_waqf = 0
    paused_s = 0.0
    for g0, g1 in gaps:
        for i in range(len(seq) - 1):
            if seq[i]["core_local"][0] <= g0 and g1 <= seq[i + 1]["core_local"][0] + 0.25:
                paused_s += min(g1, seq[i + 1]["core_local"][0]) - g0
                if seq[i]["ayah"] == seq[i + 1]["ayah"]:
                    inside += 1
                    off_waqf += int(not any(c in WAQF_SIGNS for c in seq[i]["text"]))
                break
    art = None
    if len(seq) >= 2:
        span = seq[-1]["core_local"][0] - seq[0]["core_local"][0] - paused_s
        if span > 0.3:
            art = sum(checks.moras(w["text"]) for w in seq[:-1]) / span
    report["fluency"] = {"unitsPerSecond": None if art is None else round(art, 2), "pausesInsideAyahs": inside,
                         "pausesOffWaqfMarks": off_waqf,
                         "repeats": sum(1 for f in findings if f["kind"] == "extra_word")}
    report["ruleStats"] = rule_stats

    # ---- summary
    prog("summary", 90)
    report.update(_summary(words, findings, quality, performed, unit, unit_basis))
    report["measurements"] = measurements
    report["recognized"] = hyp_text
    report["processingSeconds"] = round(time.time() - t0, 1)
    prog("done", 100)
    return report


def _public_words(words: list[dict]) -> list[dict]:
    out = []
    for w in words:
        out.append({"surah": w["surah"], "ayah": w["ayah"], "word": w["word"], "text": w["text"],
                    "status": w.get("status", "unchecked"), "confidence": round(w.get("confidence", 0.0), 2),
                    "seg": w.get("seg"), "core": w.get("core"), "heard": w.get("heard"), "textCost": w.get("textCost"),
                    "rules": sorted(w["rules"])})
    return out


def _summary(words, findings, quality, performed, unit, unit_basis) -> dict:
    total = len(words)
    ok = sum(1 for w in words if w.get("status") == "ok")
    errors = [f for f in findings if f["severity"] == "error"]
    warns = [f for f in findings if f["severity"] == "warning"]
    mean_conf = float(np.mean([w.get("confidence", 0) for w in words])) if words else 0
    q_pen = 0.15 * len(quality["issues"])
    overall = max(0.0, min(1.0, mean_conf - q_pen))
    uncertain = overall < 0.6 or any(f["confidenceLabel"] == "low" for f in findings)
    if errors:
        head_en = f"{len(errors)} likely mistake{'s' if len(errors) != 1 else ''} to review."
        head_ar = f"{len(errors)} خطأ محتمل يحتاج إلى مراجعة."
    elif warns:
        head_en = f"No clear word mistakes found; {len(warns)} point{'s' if len(warns) != 1 else ''} worth checking."
        head_ar = f"لم تُرصد أخطاء واضحة في الكلمات، وهناك {len(warns)} ملاحظة تستحق المراجعة."
    else:
        head_en = "No mistakes were detected by the automated checks."
        head_ar = "لم تكشف الفحوص الآلية عن أخطاء."
    return {
        "mode": "full",
        "words": _public_words(words),
        "findings": findings,
        "scores": {
            "wordAccuracy": round(ok / total, 3) if total else None,
            "wordsChecked": total,
            "tajweedChecks": performed,
            "tajweedFlags": sum(1 for f in findings if f.get("hukm")),
            "harakahSeconds": None if unit is None else round(unit, 3),
            "harakahBasis": unit_basis,
        },
        "summary": {
            "en": head_en, "ar": head_ar, "confidence": round(overall, 2), "confidenceLabel": _label(overall),
            "teacherReviewRecommended": True, "uncertain": bool(uncertain),
        },
    }


def _unavailable_report(words, quality, reason) -> dict:
    return {
        "mode": "limited",
        "words": _public_words(words),
        "findings": [],
        "scores": {"wordAccuracy": None, "wordsChecked": 0, "tajweedChecks": 0, "tajweedFlags": 0},
        "summary": {
            "en": "Word-level and tajweed checks are unavailable on this server: the Quran speech-recognition model is not installed. Only recording quality was checked.",
            "ar": "فحص الكلمات وأحكام التجويد غير متاح على هذا الخادم لعدم تثبيت نموذج التعرف على التلاوة. فُحصت جودة التسجيل فقط.",
            "confidence": 0.0, "confidenceLabel": "low", "teacherReviewRecommended": True, "uncertain": True,
            "reason": reason,
        },
    }
