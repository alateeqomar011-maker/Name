#!/usr/bin/env python3
"""Download the AI model weights Murattil uses. Run once per server:

    python scripts/fetch_models.py            # everything
    python scripts/fetch_models.py --only asr # just the Quran recogniser

Models (none are bundled in the repository):
  knnvc/  kNN-VC voice conversion (Baas et al., 2023), MIT licence
          https://github.com/bshall/knn-vc — WavLM-Large encoder + HiFi-GAN vocoder trained on
          prematched WavLM features
  asr/    Quran FastConformer CTC from the Tilawa project, MIT / NVIDIA CC-BY-4.0
          https://github.com/yazinsai/tilawa (release v0.2.0)

The speaker encoder (Resemblyzer) and the VAD (Silero) ship inside their pip packages.

SHA-256 digests are recorded in models/MANIFEST.json the first time each file is fetched and
verified on later runs, so a silently replaced upstream file is detected.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import urllib.request
from pathlib import Path

MODELS = {
    "knnvc": [
        ("WavLM-Large.pt", "https://github.com/bshall/knn-vc/releases/download/v0.1/WavLM-Large.pt"),
        ("prematch_g_02500000.pt", "https://github.com/bshall/knn-vc/releases/download/v0.1/prematch_g_02500000.pt"),
    ],
    "asr": [
        ("fastconformer_full_mixed.onnx", "https://github.com/yazinsai/tilawa/releases/download/v0.2.0/fastconformer_full_mixed.onnx"),
        ("vocab.json", "https://github.com/yazinsai/tilawa/releases/download/v0.2.0/vocab.json"),
        ("quran_ctc_tokens.json", "https://github.com/yazinsai/tilawa/releases/download/v0.2.0/quran_ctc_tokens.json"),
    ],
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download(url: str, dest: Path) -> None:
    tmp = dest.with_suffix(dest.suffix + ".part")
    req = urllib.request.Request(url, headers={"User-Agent": "murattil-fetch-models/1"})
    with urllib.request.urlopen(req, timeout=60) as r, open(tmp, "wb") as f:
        total = int(r.headers.get("Content-Length") or 0)
        done = 0
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
            done += len(chunk)
            if total:
                print(f"\r  {dest.name}: {done / 1e6:.0f} / {total / 1e6:.0f} MB", end="", flush=True)
    print()
    tmp.replace(dest)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=sorted(MODELS))
    ap.add_argument("--dir", default=os.environ.get("MURATTIL_MODELS_DIR", str(Path(__file__).resolve().parents[1] / "models")))
    ap.add_argument("--force", action="store_true", help="re-download even if present")
    a = ap.parse_args()
    root = Path(a.dir)
    manifest_path = root / "MANIFEST.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.is_file() else {}
    failed = False
    for group, files in MODELS.items():
        if a.only and group != a.only:
            continue
        d = root / group
        d.mkdir(parents=True, exist_ok=True)
        for name, url in files:
            dest = d / name
            key = f"{group}/{name}"
            if a.force or not dest.is_file():
                print(f"downloading {key}")
                try:
                    download(url, dest)
                except Exception as e:  # network errors, HTTP errors
                    print(f"  FAILED: {e}", file=sys.stderr)
                    failed = True
                    continue
            digest = sha256(dest)
            if key in manifest and manifest[key]["sha256"] != digest:
                print(f"  CHECKSUM MISMATCH for {key}: expected {manifest[key]['sha256']}, got {digest}", file=sys.stderr)
                failed = True
                continue
            manifest[key] = {"sha256": digest, "url": url, "bytes": dest.stat().st_size}
            print(f"  ok {key} sha256={digest[:16]}…")
    root.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
