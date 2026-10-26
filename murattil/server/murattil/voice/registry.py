"""Registry of *authorised* voice models.

A voice model lets the Voice Studio convert fully (not just blend) toward a specific person's
voice. It is only loaded when its manifest records documented consent from the voice owner (or
their legal representative) for voice conversion, and the consent has not expired or been revoked.
No voice model ships with Murattil: every reciter in the catalogue is offered as a style-inspired
transformation only.

Usage (operator CLI):
  python -m murattil.voice.registry add --id my-voice --name-en "..." --name-ar "..." \
      --audio-dir ./licensed_audio --consent-document consent.pdf --granted-by "Full Name" \
      --signed-at 2026-01-31 [--reciter-id alafasy] [--expires-at 2027-01-31]
  python -m murattil.voice.registry list
  python -m murattil.voice.registry revoke --id my-voice
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import logging
import re
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from ..config import settings

log = logging.getLogger(__name__)
REQUIRED_SCOPE = "voice-conversion"


@dataclass
class VoiceModel:
    id: str
    display_name: dict
    reciter_id: str | None
    consent: dict
    seconds: float
    path: Path

    def public(self) -> dict:
        return {"id": self.id, "name": self.display_name, "reciterId": self.reciter_id,
                "consent": {"grantedBy": self.consent.get("grantedBy"), "signedAt": self.consent.get("signedAt"),
                            "expiresAt": self.consent.get("expiresAt"), "scope": self.consent.get("scope")},
                "seconds": round(self.seconds, 1)}

    def matching_set(self) -> np.ndarray:
        return np.load(self.path / "matching_set.npy").astype(np.float32)


def root() -> Path:
    return settings.models_dir / "voices"


def validate_consent(c: dict, today: dt.date | None = None) -> str | None:
    """Return None when valid, else the reason the consent record is not acceptable."""
    today = today or dt.date.today()
    for k in ("grantedBy", "signedAt", "documentSha256", "scope"):
        if not c.get(k):
            return f"missing consent field {k}"
    if c.get("revoked"):
        return "consent revoked"
    if REQUIRED_SCOPE not in c["scope"]:
        return f"consent scope does not include {REQUIRED_SCOPE}"
    if not re.fullmatch(r"[0-9a-f]{64}", c["documentSha256"]):
        return "consent document hash is not a SHA-256 hex digest"
    try:
        signed = dt.date.fromisoformat(c["signedAt"])
    except ValueError:
        return "signedAt is not an ISO date"
    if signed > today:
        return "consent signed in the future"
    if c.get("expiresAt"):
        try:
            if dt.date.fromisoformat(c["expiresAt"]) < today:
                return "consent expired"
        except ValueError:
            return "expiresAt is not an ISO date"
    return None


def load_all() -> list[VoiceModel]:
    out = []
    if not root().is_dir():
        return out
    for d in sorted(root().iterdir()):
        mf = d / "manifest.json"
        if not mf.is_file() or not (d / "matching_set.npy").is_file():
            continue
        try:
            m = json.loads(mf.read_text("utf-8"))
        except ValueError:
            log.warning("unreadable voice manifest %s", mf)
            continue
        reason = validate_consent(m.get("consent") or {})
        if reason:
            log.warning("voice model %s not loaded: %s", d.name, reason)
            continue
        doc = d / m["consent"].get("documentFile", "")
        if not doc.is_file() or hashlib.sha256(doc.read_bytes()).hexdigest() != m["consent"]["documentSha256"]:
            log.warning("voice model %s not loaded: consent document missing or altered", d.name)
            continue
        out.append(VoiceModel(id=m["id"], display_name=m["displayName"], reciter_id=m.get("reciterId"),
                              consent=m["consent"], seconds=float(m.get("seconds", 0)), path=d))
    return out


def get(model_id: str) -> VoiceModel | None:
    for m in load_all():
        if m.id == model_id:
            return m
    return None


def _cmd_add(a) -> int:
    from ..audio.io import decode_file
    from . import neural
    mid = a.id
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,40}", mid):
        print("id must be lowercase letters, digits and dashes", file=sys.stderr)
        return 2
    doc = Path(a.consent_document)
    consent = {
        "grantedBy": a.granted_by, "role": a.role, "signedAt": a.signed_at, "expiresAt": a.expires_at,
        "scope": [REQUIRED_SCOPE], "documentFile": "consent" + doc.suffix,
        "documentSha256": hashlib.sha256(doc.read_bytes()).hexdigest(),
    }
    reason = validate_consent(consent)
    if reason:
        print(f"refusing: {reason}", file=sys.stderr)
        return 2
    files = sorted(p for p in Path(a.audio_dir).iterdir() if p.suffix.lower() in (".wav", ".mp3", ".flac", ".ogg", ".m4a"))
    wavs = [decode_file(p, sr=neural.SR) for p in files]
    seconds = sum(w.size for w in wavs) / neural.SR
    if seconds < 60:
        print("need at least 60 s of licensed audio (5–10 min recommended)", file=sys.stderr)
        return 2
    ms = neural.matching_set_from_audio(wavs)
    d = root() / mid
    d.mkdir(parents=True, exist_ok=True)
    np.save(d / "matching_set.npy", ms.astype(np.float16))
    shutil.copyfile(doc, d / consent["documentFile"])
    manifest = {"id": mid, "displayName": {"en": a.name_en, "ar": a.name_ar or a.name_en},
                "reciterId": a.reciter_id, "consent": consent, "seconds": seconds,
                "createdAt": dt.datetime.now(dt.timezone.utc).isoformat()}
    (d / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), "utf-8")
    print(f"registered voice model {mid} ({seconds:.0f} s of audio, {len(ms)} frames)")
    return 0


def _cmd_list(_a) -> int:
    for m in load_all():
        print(json.dumps(m.public(), ensure_ascii=False))
    return 0


def _cmd_revoke(a) -> int:
    mf = root() / a.id / "manifest.json"
    if not mf.is_file():
        print("no such voice model", file=sys.stderr)
        return 1
    m = json.loads(mf.read_text("utf-8"))
    m["consent"]["revoked"] = dt.datetime.now(dt.timezone.utc).isoformat()
    mf.write_text(json.dumps(m, ensure_ascii=False, indent=2), "utf-8")
    (root() / a.id / "matching_set.npy").unlink(missing_ok=True)
    print(f"revoked {a.id}; its matching set was deleted")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m murattil.voice.registry")
    sub = p.add_subparsers(dest="cmd", required=True)
    add = sub.add_parser("add")
    add.add_argument("--id", required=True)
    add.add_argument("--name-en", required=True)
    add.add_argument("--name-ar")
    add.add_argument("--reciter-id")
    add.add_argument("--audio-dir", required=True)
    add.add_argument("--consent-document", required=True)
    add.add_argument("--granted-by", required=True)
    add.add_argument("--role", default="voice owner")
    add.add_argument("--signed-at", required=True)
    add.add_argument("--expires-at")
    add.set_defaults(fn=_cmd_add)
    sub.add_parser("list").set_defaults(fn=_cmd_list)
    rv = sub.add_parser("revoke")
    rv.add_argument("--id", required=True)
    rv.set_defaults(fn=_cmd_revoke)
    a = p.parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
