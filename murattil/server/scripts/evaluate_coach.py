#!/usr/bin/env python3
"""Evaluate the Tajweed Coach on real recitations.

Corpus: the public benchmark of the Tilawa project (https://github.com/yazinsai/tilawa,
lab/benchmark/test_corpus*): EveryAyah reciters (Alafasy, Husary and others), crowd-sourced
recitations (RetaSy, TLOG) and a few phone recordings. The audio is downloaded on demand and is not
part of this repository.

Three measurements:
  1. genuine recitations — how often the coach flags something on recitations that are correct
     (professional reciters are taken as correct; crowd-sourced ones are reported separately because
     they may contain real mistakes);
  2. controlled word mistakes — a word is removed, replaced by another word, or repeated in
     professional recitations, and we measure whether the coach flags that exact word (and what
     else it flags);
  3. controlled madd mistakes — the held vowel of a 4–6 count madd is shortened to about 1.5
     counts by cutting out its middle, and we measure whether the coach reports it as short.

Every word's features (alignment confidence, text distance, duration) and every acoustic
measurement are saved, so `--rescore` can re-apply the coach's current thresholds to a saved run
without recomputing (that is how the thresholds in murattil/tajweed/coach.py were chosen).

Usage:
  python scripts/evaluate_coach.py --corpus /path/to/corpus --download      # fetch audio first
  python scripts/evaluate_coach.py --corpus /path/to/corpus --out report.json
  python scripts/evaluate_coach.py --rescore report.json
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

BASE = "https://raw.githubusercontent.com/yazinsai/tilawa/main/lab/benchmark"
VERSIONS = ["test_corpus", "test_corpus_v2", "test_corpus_v3"]
# labels the corpus authors document as wrong or ambiguous (KNOWN_LABEL_ISSUES.md, also_accept)
EXCLUDE = {"tlog_m043_010_043", "tlog_m044_010_043", "tlog_m008_107_001"}
SR = 16000


def download(root: Path) -> None:
    jobs = []
    for v in VERSIONS:
        (root / v).mkdir(parents=True, exist_ok=True)
        mf = root / f"{v}.manifest.json"
        if not mf.is_file():
            urllib.request.urlretrieve(f"{BASE}/{v}/manifest.json", mf)
        for s in json.loads(mf.read_text())["samples"]:
            dst = root / v / s["file"]
            if not dst.is_file():
                jobs.append((f"{BASE}/{v}/{s['file']}", dst))

    def get(j):
        url, dst = j
        with urllib.request.urlopen(url, timeout=120) as r:
            dst.write_bytes(r.read())
    with ThreadPoolExecutor(8) as ex:
        list(ex.map(get, jobs))
    print(f"downloaded {len(jobs)} files")


def samples(root: Path, max_seconds: float) -> list[dict]:
    from murattil.audio.io import decode
    seen = set()
    out = []
    for v in VERSIONS:
        for s in json.loads((root / f"{v}.manifest.json").read_text())["samples"]:
            if s["id"] in EXCLUDE or s.get("also_accept"):
                continue
            p = root / v / s["file"]
            data = p.read_bytes()
            key = hash(data)
            if key in seen:
                continue
            seen.add(key)
            dur = decode(data, sr=SR).size / SR
            if dur > max_seconds:
                continue
            out.append({"id": s["id"], "path": str(p), "surah": s["surah"], "from": s["ayah"],
                        "to": s.get("ayah_end") or s["ayah"], "source": s["source"],
                        "reciter": s.get("reciter"), "duration": dur})
    return out


def flagged(w: dict) -> bool:
    return w["status"] != "ok"


def analyze(audio: bytes, s: dict) -> dict:
    from murattil.tajweed import coach
    return coach.analyze(audio, s["surah"], s["from"], s["to"], max_seconds=400)


def features(w: dict) -> dict:
    """What the word verdict depends on (see coach.word_verdict)."""
    seg = w.get("seg")
    return {"c": w["confidence"], "tc": w.get("textCost"), "del": w.get("heard") is None,
            "d": round(seg[1] - seg[0], 3) if seg else 0.0}


def genuine_pass(items: list[dict]) -> list[dict]:
    rows = []
    for i, s in enumerate(items):
        t = time.time()
        try:
            r = analyze(Path(s["path"]).read_bytes(), s)
        except Exception as e:  # report and continue
            rows.append({**s, "error": str(e)})
            continue
        words = [w for w in r["words"] if w["ayah"] > 0]
        rows.append({
            **s, "seconds": round(time.time() - t, 2), "mode": r["mode"],
            "words": len(words), "flaggedWords": sum(flagged(w) for w in words),
            "wordAccuracy": r["scores"]["wordAccuracy"],
            "findings": Counter(f["kind"] for f in r["findings"]),
            "tajweedChecks": r["scores"]["tajweedChecks"],
            "wordFeatures": [features(w) for w in words],
            "measurements": r.get("measurements", []),
            "harakah": r["scores"].get("harakahSeconds"),
            "report": r,
        })
        if (i + 1) % 25 == 0:
            print(f"  genuine {i + 1}/{len(items)}", flush=True)
    return rows


def _cut_points(words: list[dict], i: int) -> tuple[float, float]:
    a = (words[i - 1]["core"][1] + words[i]["core"][0]) / 2
    b = (words[i]["core"][1] + words[i + 1]["core"][0]) / 2
    return a, b


def _join(parts: list[np.ndarray]) -> np.ndarray:
    """Concatenate with 10 ms cross-fades so the edits do not click."""
    fade = int(0.01 * SR)
    out = parts[0].copy()
    for p in parts[1:]:
        if out.size > fade and p.size > fade:
            ramp = np.linspace(0, 1, fade, dtype=np.float32)
            out[-fade:] = out[-fade:] * (1 - ramp) + p[:fade] * ramp
            out = np.concatenate([out, p[fade:]])
        else:
            out = np.concatenate([out, p])
    return out


def mistakes_pass(rows: list[dict], rng: random.Random) -> list[dict]:
    from murattil.audio.io import decode, encode_wav
    from murattil.quran import normalize
    results = []
    pro = [r for r in rows if r.get("source") == "everyayah" and r.get("mode") == "full" and r["flaggedWords"] == 0]
    for n, r in enumerate(pro):
        words = [w for w in r["report"]["words"] if w["ayah"] > 0 and w.get("core")]
        if len(words) < 5:
            continue
        y = decode(Path(r["path"]).read_bytes(), sr=SR)
        i = rng.randrange(1, len(words) - 1)
        a, b = _cut_points(words, i)
        ia, ib = int(a * SR), int(b * SR)
        if ib - ia < int(0.15 * SR):
            continue
        # a replacement word from elsewhere in the passage with a clearly different spelling
        cands = [j for j in range(1, len(words) - 1)
                 if abs(j - i) > 1 and normalize(words[j]["text"]) != normalize(words[i]["text"])]
        edits = {"deleted": _join([y[:ia], y[ib:]]), "repeated": _join([y[:ib], y[ia:ib], y[ib:]])}
        if cands:
            j = rng.choice(cands)
            ja, jb = (int(t * SR) for t in _cut_points(words, j))
            edits["substituted"] = _join([y[:ia], y[ja:jb], y[ib:]])
        target = (words[i]["ayah"], words[i]["word"])
        for kind, z in edits.items():
            rep = analyze(encode_wav(z, SR), r)
            ws = {(w["ayah"], w["word"]): w for w in rep["words"] if w["ayah"] > 0}
            order = [k for k in ws]
            ti = order.index(target)
            near = set(order[max(0, ti - 1): ti + 2])
            if kind == "repeated":
                hit = any(f["kind"] == "extra_word" and (f.get("ayah"), f.get("word")) in near for f in rep["findings"]) \
                    or any(flagged(ws[k]) for k in near)
            else:
                hit = flagged(ws[target])
            collateral = sum(flagged(w) for k, w in ws.items() if k not in near)
            extra_near = any(f["kind"] == "extra_word" and (f.get("ayah"), f.get("word")) in near for f in rep["findings"])
            results.append({"id": r["id"], "kind": kind, "detected": bool(hit), "collateral": collateral,
                            "targetStatus": ws[target]["status"], "word": words[i]["text"],
                            "target": features(ws[target]), "near": [features(ws[k]) for k in near],
                            "extraNear": extra_near, "others": [features(w) for k, w in ws.items() if k not in near]})
        if (n + 1) % 20 == 0:
            print(f"  mistakes {n + 1}/{len(pro)}", flush=True)
    return results


def madd_pass(rows: list[dict], rng: random.Random) -> list[dict]:
    """Shorten one long madd per professional recording and see whether the coach notices."""
    from murattil.audio.io import decode, encode_wav
    from murattil.tajweed import checks
    results = []
    pro = [r for r in rows if r.get("source") == "everyayah" and r.get("mode") == "full" and r.get("harakah")]
    for n, r in enumerate(pro):
        cands = [m for m in r["measurements"] if m["kind"] == "madd" and m["counts"] >= 0.8 * m["required"][0]]
        if not cands:
            continue
        m = rng.choice(cands)
        w = next(w for w in r["report"]["words"] if (w["ayah"], w["word"]) == (m["ayah"], m["word"]))
        y = decode(Path(r["path"]).read_bytes(), sr=SR)
        f = checks.frame_features(y)
        start, length = checks.sustained_vowel_span(f, int(w["seg"][0] / checks.HOP), int(w["seg"][1] / checks.HOP))
        unit = r["harakah"]
        keep = int(0.75 * unit / checks.HOP)              # 0.75 count either side of the cut = 1.5 counts
        if length * checks.HOP < 2.5 * unit or length < 2 * keep + 4:
            continue
        a, b = (start + keep) * checks.HOP, (start + length - keep) * checks.HOP
        z = _join([y[:int(a * SR)], y[int(b * SR):]])
        rep = analyze(encode_wav(z, SR), r)
        after = next((x for x in rep.get("measurements", []) if x["kind"] == "madd"
                      and (x["ayah"], x["word"]) == (m["ayah"], m["word"])), None)
        results.append({"id": r["id"], "hukm": m["hukm"], "required": m["required"], "before": m["counts"],
                        "after": None if after is None else after["counts"], "cutSeconds": round(b - a, 2),
                        "flagged": any(x["kind"] == "madd_short" and (x.get("ayah"), x.get("word")) == (m["ayah"], m["word"])
                                       for x in rep["findings"])})
        if (n + 1) % 20 == 0:
            print(f"  madd {n + 1}/{len(pro)}", flush=True)
    return results


def _status(fe: dict) -> str:
    from murattil.tajweed.coach import word_verdict
    return word_verdict("del" if fe["del"] else "sub", fe["tc"], fe["c"], fe["d"])


def summarise(rows: list[dict], mistakes: list[dict], madds: list[dict]) -> dict:
    """Apply the coach's current thresholds to the saved features."""
    from murattil.tajweed import coach
    by_src = defaultdict(list)
    for r in rows:
        if "error" not in r:
            by_src[r["source"]].append(r)
    out = {"genuine": {}, "mistakes": {}, "madd": {}, "errors": [r["id"] for r in rows if "error" in r]}
    for src, rs in by_src.items():
        total_words = sum(r["words"] for r in rs)
        flagged_per = [sum(_status(fe) != "ok" for fe in r["wordFeatures"]) for r in rs]
        status = Counter(_status(fe) for r in rs for fe in r["wordFeatures"])
        meas = [m for r in rs for m in r["measurements"]]
        madd = [m for m in meas if m["kind"] == "madd"]
        qal = [m for m in meas if m["kind"] == "qalqalah"]
        gh = [m for m in meas if m["kind"] == "ghunnah"]
        out["genuine"][src] = {
            "recordings": len(rs),
            "audioMinutes": round(sum(r["duration"] for r in rs) / 60, 1),
            "words": total_words,
            "wordsFlagged": sum(flagged_per),
            "wordFlagRate": round(sum(flagged_per) / max(1, total_words), 4),
            "wordStatus": dict(status),
            "recordingsWithAnyWordFlag": sum(1 for x in flagged_per if x > 0),
            "extraWordFindings": sum(r["findings"].get("extra_word", 0) for r in rs),
            "maddChecks": len(madd),
            "maddShortRate": round(sum(m["counts"] < coach.MADD_SHORT * m["required"][0] for m in madd) / max(1, len(madd)), 3),
            "maddLongRate": round(sum(m["counts"] > coach.MADD_LONG * m["required"][1] for m in madd) / max(1, len(madd)), 3),
            "qalqalahChecks": len(qal),
            "qalqalahMissingRate": round(sum(not m["burst"] for m in qal) / max(1, len(qal)), 3),
            "ghunnahChecks": len(gh),
            "ghunnahShortRate": round(sum(m["counts"] < 0.8 for m in gh) / max(1, len(gh)), 3),
            "midwordPauses": sum(1 for m in meas if m["kind"] == "waqf_midword"),
            "medianSeconds": float(np.median([r["seconds"] for r in rs])),
        }
    for kind in ("deleted", "substituted", "repeated"):
        ms = [m for m in mistakes if m["kind"] == kind]
        if not ms:
            continue
        if kind == "repeated":
            hits = [m["extraNear"] or any(_status(fe) != "ok" for fe in m["near"]) for m in ms]
        else:
            hits = [_status(m["target"]) != "ok" for m in ms]
        out["mistakes"][kind] = {"trials": len(ms), "detected": sum(hits), "detectionRate": round(sum(hits) / len(ms), 3),
                                 "trialsWithCollateralFlags": sum(1 for m in ms if any(_status(fe) != "ok" for fe in m["others"])),
                                 "targetStatus": dict(Counter(_status(m["target"]) for m in ms))}
    if madds:
        ok = [m for m in madds if m["after"] is not None]
        out["madd"] = {"trials": len(madds), "measuredAfterCut": len(ok),
                       "detected": sum(m["after"] < coach.MADD_SHORT * m["required"][0] for m in ok),
                       "detectionRate": round(sum(m["after"] < coach.MADD_SHORT * m["required"][0] for m in ok) / max(1, len(madds)), 3),
                       "medianCountsBefore": float(np.median([m["before"] for m in madds])),
                       "medianCountsAfter": float(np.median([m["after"] for m in ok])) if ok else None}
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus")
    ap.add_argument("--download", action="store_true")
    ap.add_argument("--out", default="coach_eval.json")
    ap.add_argument("--max-seconds", type=float, default=90)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--rescore", help="re-apply the current thresholds to a saved run")
    a = ap.parse_args()
    if a.rescore:
        d = json.loads(Path(a.rescore).read_text())
        for r in d["rows"]:
            r["findings"] = Counter(r.get("findings") or {})
        print(json.dumps(summarise(d["rows"], d["mistakes"], d.get("madd", [])), ensure_ascii=False, indent=1))
        return 0
    if not a.corpus:
        ap.error("--corpus is required")
    root = Path(a.corpus)
    if a.download:
        download(root)
    os.environ.setdefault("MURATTIL_VAR_DIR", str(root / "_var"))
    items = samples(root, a.max_seconds)
    print(f"{len(items)} recordings")
    t0 = time.time()
    rows = genuine_pass(items)
    mistakes = mistakes_pass(rows, random.Random(a.seed))
    madds = madd_pass(rows, random.Random(a.seed + 1))
    summary = summarise(rows, mistakes, madds)
    summary["wallMinutes"] = round((time.time() - t0) / 60, 1)
    Path(a.out).write_text(json.dumps({"summary": summary, "mistakes": mistakes, "madd": madds,
                                       "rows": [{k: v for k, v in r.items() if k != "report"} for r in rows]},
                                      ensure_ascii=False, indent=1, default=dict))
    print(json.dumps(summary, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
