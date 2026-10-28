"""Find ayah boundaries in a long recitation (e.g. a full-surah file from mp3quran.net, which is the
only published source for reciters such as Ahmed Al-Nufais).

Method: transcribe with the Quran recogniser in overlapping chunks, anchor the transcript's words
to the expected text (sequence matching on spelling-insensitive keys), take each ayah's first and
last anchored word as its extent, then move every boundary into the reciter's pause between the two
ayahs when there is one. Each ayah gets a coverage score (share of its words anchored); ayahs whose
words could not be found are reported as unreliable rather than guessed.
"""
from __future__ import annotations

from difflib import SequenceMatcher

import numpy as np

from .. import quran
from ..audio.vad import speech_segments
from . import asr

SR = 16000


def _key(w: str) -> str:
    return w.replace("ا", "").replace("ء", "").replace("ى", "ي")


def expected_words(keys: list[tuple[int, int]]) -> list[tuple[int, str]]:
    """[(index into keys, normalised word)] for a sequence of (surah, ayah) keys."""
    out = []
    for k, (s, a) in enumerate(keys):
        for tok in quran.ayah(s, a)["tokens"]:
            if not tok.get("d"):
                out.append((k, quran.normalize(tok["t"])))
    return out


def _rough(rec: asr.Recognition, model: asr.CtcModel, keys: list[tuple[int, int]], dur: float) -> list[dict]:
    """First pass: anchor transcript words to the text to place every ayah approximately."""
    hyp = model.words_with_times(rec)
    exp = expected_words(keys)
    sm = SequenceMatcher(None, [_key(w) for _, w in exp], [_key(h["text"]) for h in hyp], autojunk=False)
    anchor: dict[int, dict] = {}
    for a, b, size in sm.get_matching_blocks():
        for k in range(size):
            anchor[a + k] = hyp[b + k]
    for op, a0, a1, b0, b1 in sm.get_opcodes():
        if op == "replace" and a1 - a0 == b1 - b0:
            for k in range(a1 - a0):
                anchor.setdefault(a0 + k, hyp[b0 + k])
    by_key: dict[int, list[int]] = {}
    for i, (k, _) in enumerate(exp):
        by_key.setdefault(k, []).append(i)
    out = []
    for k, (s, a) in enumerate(keys):
        idx = by_key.get(k, [])
        hits = [anchor[i] for i in idx if i in anchor]
        out.append({"surah": s, "ayah": a, "start": hits[0]["start"] if hits else None,
                    "end": hits[-1]["end"] if hits else None, "coverage": len(hits) / max(1, len(idx))})
    # monotonic: drop anchors that go backwards, then interpolate the gaps
    last = 0.0
    for seg in out:
        if seg["start"] is not None and seg["start"] < last - 0.5:
            seg["start"] = seg["end"] = None
            seg["coverage"] = 0.0
        if seg["end"] is not None:
            last = seg["end"]
    for i, seg in enumerate(out):
        if seg["start"] is None:
            prev_end = next((o["end"] for o in reversed(out[:i]) if o["end"] is not None), 0.0)
            nxt = next(((j, o["start"]) for j, o in enumerate(out[i + 1:], i + 1) if o["start"] is not None), (len(out), dur))
            # share the unanchored time between the unanchored ayahs in proportion to their length
            span = [o for o in out[i:nxt[0]]]
            lens = [len(quran.ayah(o["surah"], o["ayah"])["text"]) for o in span]
            t = prev_end
            for o, ln in zip(span, lens):
                d = (nxt[1] - prev_end) * ln / max(1, sum(lens))
                o["start"], o["end"] = t, t + d
                t += d
    return out


def _block_tokens(model: asr.CtcModel, keys: list[tuple[int, int]], with_bas: bool) -> tuple[list[int], list[int]]:
    ids, owner = [], []
    if with_bas:
        b = model.basmalah_tokens()
        ids += b
        owner += [-1] * len(b)
    for k, (s, a) in enumerate(keys):
        t = model.ayah_tokens(s, a)
        if t is None:
            t = model.tokenize(" ".join(quran.normalize(x["t"]) for x in quran.ayah(s, a)["tokens"] if not x.get("d")))
        ids += t
        owner += [k] * len(t)
    unk = {k for k, v in model.vocab.items() if v == "<unk>"}
    keep = [i for i, t in enumerate(ids) if t not in unk and t != model.blank]
    return [ids[i] for i in keep], [owner[i] for i in keep]


def segment(y16: np.ndarray, keys: list[tuple[int, int]], model: asr.CtcModel | None = None,
            block_seconds: float = 240.0) -> list[dict]:
    """Return [{surah, ayah, start, end, coverage, confidence, reliable}] in seconds, one per key."""
    from .ctc import forced_align, forced_frame_logps, segment_gop
    model = model or asr.load()
    rec = model.recognize_long(y16)
    fs = rec.frame_s
    dur = y16.size / SR
    rough = _rough(rec, model, keys, dur)

    # second pass: exact forced alignment of the text, block by block (memory grows with block size)
    blocks: list[list[int]] = [[]]
    acc = 0.0
    for i, r in enumerate(rough):
        d = r["end"] - r["start"]
        if blocks[-1] and acc + d > block_seconds:
            blocks.append([])
            acc = 0.0
        blocks[-1].append(i)
        acc += d
    out = [dict(r) for r in rough]
    T = rec.logp.shape[0]
    for bi, blk in enumerate(blocks):
        first, last = blk[0], blk[-1]
        w0 = 0.0 if first == 0 else (rough[first - 1]["end"] + rough[first]["start"]) / 2
        w1 = dur if last == len(rough) - 1 else (rough[last]["end"] + rough[last + 1]["start"]) / 2
        f0, f1 = max(0, int(w0 / fs)), min(T, int(np.ceil(w1 / fs)) + 1)
        lp = rec.logp[f0:f1]
        sub = [keys[i] for i in blk]
        options = [False]
        s0, a0 = sub[0]
        if first == 0 and a0 == 1 and s0 not in (1, 9):
            options = [False, True]
        best = None
        for with_bas in options:
            ids, owner = _block_tokens(model, sub, with_bas)
            try:
                spans, score = forced_align(lp, ids, rec.blank)
            except ValueError:
                continue
            if best is None or score > best[0]:
                best = (score, ids, owner, spans)
        if best is None:
            continue  # keep the rough placement for this block
        _, ids, owner, spans = best
        frame_lp = forced_frame_logps(lp, spans, rec.blank)
        for k, i in enumerate(blk):
            mine = [sp for sp, o in zip(spans, owner) if o == k and sp.start >= 0]
            if not mine:
                continue
            a, b = mine[0].start, mine[-1].end
            gop = segment_gop(lp, a, b, float(frame_lp[a:b + 1].sum()))
            out[i]["start"] = (f0 + a) * fs
            out[i]["end"] = (f0 + b + 1) * fs
            out[i]["confidence"] = round(float(min(1.0, np.exp(gop / 1.5))), 2)

    # move boundaries into the pause between consecutive ayahs when there is one
    gaps = _gaps(y16)
    for i in range(len(out) - 1):
        cur, nxt = out[i], out[i + 1]
        lo, hi = cur["end"] - 0.3, nxt["start"] + 0.3
        cands = [(g0, g1) for g0, g1 in gaps if g1 > lo and g0 < hi]
        if cands:
            g0, g1 = max(cands, key=lambda g: g[1] - g[0])
            mid = min(max((g0 + g1) / 2, cur["end"] - 0.3), nxt["start"] + 0.3)
        else:
            mid = (cur["end"] + nxt["start"]) / 2
        cur["end"], nxt["start"] = mid, mid
    if out:
        out[0]["start"] = max(0.0, out[0]["start"] - 0.25)
        out[-1]["end"] = min(dur, out[-1]["end"] + 0.4)
    for seg in out:
        seg["start"] = round(float(seg["start"]), 3)
        seg["end"] = round(float(max(seg["end"], seg["start"])), 3)
        seg["coverage"] = round(float(seg["coverage"]), 2)
        seg.setdefault("confidence", None)
        seg["reliable"] = (seg["confidence"] or 0) >= 0.5 or seg["coverage"] >= 0.6
    return out


def _gaps(y16: np.ndarray, min_gap: float = 0.2) -> list[tuple[float, float]]:
    segs = speech_segments(y16, SR, min_silence=min_gap)
    return [(segs[i][1], segs[i + 1][0]) for i in range(len(segs) - 1) if segs[i + 1][0] - segs[i][1] >= min_gap]
