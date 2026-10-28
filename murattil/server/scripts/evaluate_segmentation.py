#!/usr/bin/env python3
"""Evaluate ayah segmentation of long recordings (murattil/tajweed/segment.py).

Real single-ayah recordings of one reciter (from the Tilawa benchmark corpus, see
evaluate_coach.py) are concatenated into one long "surah-like" recording with known boundaries,
optionally with the pauses removed, and the segmenter has to find the boundaries again.

  python scripts/evaluate_segmentation.py --corpus /path/to/corpus [--trials 6]
"""
from __future__ import annotations

import argparse
import json
import random
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
SR = 16000


def main() -> int:
    from murattil.audio.io import decode
    from murattil.audio.vad import trim
    from murattil.tajweed import segment
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", required=True)
    ap.add_argument("--trials", type=int, default=6)
    ap.add_argument("--ayahs", type=int, default=12)
    ap.add_argument("--seed", type=int, default=3)
    ap.add_argument("--out", default="segmentation_eval.json")
    a = ap.parse_args()
    rng = random.Random(a.seed)
    root = Path(a.corpus)
    man = json.loads((root / "test_corpus_v3.manifest.json").read_text())["samples"]
    singles = {}
    for s in man:
        if s["source"] == "everyayah" and not s.get("ayah_end"):
            singles.setdefault(s["reciter"], []).append(s)
    results = []
    for t in range(a.trials):
        reciter = ["alafasy", "husary"][t % 2]
        pick = rng.sample(singles[reciter], a.ayahs)
        pauses = t % 3 != 2  # every third trial: no pauses at all between ayahs
        parts, truth, pos = [], [], 0.0
        for s in pick:
            y, _ = trim(decode((root / "test_corpus_v3" / s["file"]).read_bytes(), sr=SR), SR, pad=0.05)
            gap = rng.uniform(0.6, 1.4) if pauses else 0.0
            parts += [y, np.zeros(int(gap * SR), dtype=np.float32)]
            truth.append((pos, pos + y.size / SR))
            pos += y.size / SR + gap
        audio = np.concatenate(parts)
        t0 = time.time()
        segs = segment.segment(audio, [(s["surah"], s["ayah"]) for s in pick])
        took = time.time() - t0
        start_err = [abs(sg["start"] - tr[0]) for sg, tr in zip(segs, truth)]
        end_err = [abs(sg["end"] - tr[1]) for sg, tr in zip(segs, truth)]
        # what matters for playback: does the segment contain (most of) the true ayah and little else?
        overlap = []
        for sg, tr in zip(segs, truth):
            inter = max(0.0, min(sg["end"], tr[1]) - max(sg["start"], tr[0]))
            union = max(sg["end"], tr[1]) - min(sg["start"], tr[0])
            overlap.append(inter / union if union > 0 else 0)
        results.append({"trial": t, "reciter": reciter, "pauses": pauses, "minutes": round(pos / 60, 2),
                        "seconds": round(took, 1), "meanStartErr": round(float(np.mean(start_err)), 3),
                        "maxStartErr": round(float(np.max(start_err)), 3), "meanEndErr": round(float(np.mean(end_err)), 3),
                        "meanIoU": round(float(np.mean(overlap)), 3), "minIoU": round(float(np.min(overlap)), 3),
                        "reliable": sum(sg["reliable"] for sg in segs), "ayahs": len(segs)})
        print(results[-1], flush=True)
    summ = {k: round(float(np.mean([r[k] for r in results])), 3) for k in ("meanStartErr", "meanEndErr", "meanIoU", "minIoU")}
    summ["trials"] = len(results)
    Path(a.out).write_text(json.dumps({"summary": summ, "trials": results}, indent=1))
    print(json.dumps(summ, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
