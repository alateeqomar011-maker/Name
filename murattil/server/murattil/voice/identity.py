"""Speaker-identity measurements with Resemblyzer (a GE2E speaker encoder; weights ship with the
`resemblyzer` package).

Used for two things:
  * the Voice Studio's "how similar is my voice to this reciter" comparison;
  * the identity guard: a style-inspired transformation of an unauthorised reciter must stay
    recognisably the user's voice — closer to the user's own embedding than to the reciter's.
"""
from __future__ import annotations

import logging
import threading
from dataclasses import dataclass

import numpy as np

log = logging.getLogger(__name__)
_lock = threading.Lock()
_encoder = None
_failed: str | None = None

# The output must be closer to the user than to the reference reciter by this margin...
GUARD_MARGIN = 0.05
# ...and similar enough to the user in absolute terms. Same-speaker utterances score ~0.9 with this
# encoder, different speakers ~0.5–0.65, and white noise ~0.5, so 0.70 means "recognisably you".
MIN_SIMILARITY_TO_USER = 0.70


def _get():
    global _encoder, _failed
    with _lock:
        if _encoder is None and _failed is None:
            try:
                from resemblyzer import VoiceEncoder
                _encoder = VoiceEncoder("cpu", verbose=False)
            except Exception as e:  # pragma: no cover
                _failed = str(e)
                log.warning("speaker encoder unavailable: %s", e)
        return _encoder


def available() -> bool:
    return _get() is not None


def embed(wav: np.ndarray, sr: int) -> np.ndarray | None:
    enc = _get()
    if enc is None:
        return None
    from resemblyzer import preprocess_wav
    w = preprocess_wav(np.asarray(wav, dtype=np.float32), source_sr=sr)
    if w.size < 16000 * 0.8:
        return None
    with _lock:  # the encoder is a torch module shared between worker threads
        return enc.embed_utterance(w).astype(np.float32)


def similarity(a: np.ndarray | None, b: np.ndarray | None) -> float | None:
    if a is None or b is None:
        return None
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))


@dataclass
class IdentityCheck:
    to_user: float | None
    to_reference: float | None
    user_reference_baseline: float | None
    passed: bool
    reason: str | None = None
    margin: float = GUARD_MARGIN

    def to_dict(self) -> dict:
        r = lambda v: None if v is None else round(v, 3)  # noqa: E731
        return {"toUser": r(self.to_user), "toReference": r(self.to_reference),
                "userVsReference": r(self.user_reference_baseline), "passed": self.passed,
                "reason": self.reason, "margin": self.margin, "minToUser": MIN_SIMILARITY_TO_USER}


def check(out_emb, user_emb, ref_emb) -> IdentityCheck:
    """Fails closed: if any embedding is missing the check does not pass."""
    tu, tr, base = similarity(out_emb, user_emb), similarity(out_emb, ref_emb), similarity(user_emb, ref_emb)
    if out_emb is None:
        return IdentityCheck(tu, tr, base, False, "no speech detected in the output")
    if user_emb is None or ref_emb is None:
        return IdentityCheck(tu, tr, base, False, "could not measure the user or reference voice")
    if tu < MIN_SIMILARITY_TO_USER:
        return IdentityCheck(tu, tr, base, False, "output is not similar enough to the user's voice")
    if tu - tr < GUARD_MARGIN:
        return IdentityCheck(tu, tr, base, False, "output is too close to the reference reciter's voice")
    return IdentityCheck(tu, tr, base, True)
