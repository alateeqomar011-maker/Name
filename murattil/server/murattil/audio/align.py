"""Time alignment of two recitations of the same passage (dynamic time warping).

Used to transfer a reference reciter's melodic contour and timing onto the user's recording.
Features are MFCCs with per-utterance mean/variance normalisation, which removes most of the
speaker-dependent spectral offset; when a phonetic posteriorgram from the ASR model is available it
is used instead because it is far more speaker independent.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

HOP_S = 0.02


@dataclass
class Alignment:
    path: np.ndarray        # (K, 2) frame index pairs (a, b), monotonic
    hop_s: float
    n_a: int
    n_b: int
    cost: float             # mean local cost along the path (cosine distance, 0..2)
    plausible: bool         # False when the recordings do not look like the same passage
    cost_ratio: float = 0.0  # cost relative to aligning with the time-reversed reference

    def a_to_b_time(self, t_a: np.ndarray) -> np.ndarray:
        """Map times (s) in recording A to times in recording B (piecewise linear, monotonic)."""
        ta, tb = self._knots()
        return np.interp(t_a, ta, tb)

    def b_to_a_time(self, t_b: np.ndarray) -> np.ndarray:
        ta, tb = self._knots()
        return np.interp(t_b, tb, ta)

    def _knots(self) -> tuple[np.ndarray, np.ndarray]:
        # collapse runs of repeated indices so the map is strictly increasing in both directions
        a = self.path[:, 0].astype(np.float64)
        b = self.path[:, 1].astype(np.float64)
        ua, inv = np.unique(a, return_inverse=True)
        bm = np.bincount(inv, weights=b) / np.bincount(inv)
        bm = np.maximum.accumulate(bm)
        # keep strictly increasing b as well
        keep = np.concatenate([[True], np.diff(bm) > 1e-9])
        return ua[keep] * self.hop_s, bm[keep] * self.hop_s


def mfcc_features(y: np.ndarray, sr: int) -> np.ndarray:
    import librosa
    hop = int(HOP_S * sr)
    m = librosa.feature.mfcc(y=y.astype(np.float32), sr=sr, n_mfcc=20, hop_length=hop, n_fft=int(0.04 * sr),
                             n_mels=40, fmin=60, fmax=min(7600, sr // 2))
    m = m[1:]  # drop c0 (loudness)
    d = librosa.feature.delta(m)
    f = np.vstack([m, d]).T
    f = (f - f.mean(0)) / (f.std(0) + 1e-6)
    return f.astype(np.float32)


# Plausibility: the alignment cost must be clearly lower than the cost of aligning against the
# time-reversed reference (same sounds, no shared order). On the test material, recordings of the
# same content score 0.54–0.59 of the reversed baseline and different content 0.88–0.92.
MAX_COST_RATIO = 0.8


def dtw(fa: np.ndarray, fb: np.ndarray, band: float = 0.35, hop_s: float = HOP_S) -> Alignment:
    """DTW with a Sakoe–Chiba-style band around the diagonal (fraction of the longer sequence)."""
    na, nb = len(fa), len(fb)
    if na < 2 or nb < 2:
        raise ValueError("recording too short to align")
    import librosa
    a = fa / (np.linalg.norm(fa, axis=1, keepdims=True) + 1e-9)
    b = fb / (np.linalg.norm(fb, axis=1, keepdims=True) + 1e-9)
    C = (1.0 - a @ b.T).astype(np.float64)  # cosine distance
    # librosa's DTW (numba-compiled) with the symmetric step pattern and a band around the diagonal
    D, wp = librosa.sequence.dtw(C=C, global_constraints=True, band_rad=band, backtrack=True)
    path = np.asarray(wp[::-1], dtype=np.int64)
    finite_end = bool(np.isfinite(D[-1, -1]))
    local = C[path[:, 0], path[:, 1]]
    cost = float(np.mean(local[np.isfinite(local)])) if np.isfinite(local).any() else float("inf")
    _, wp0 = librosa.sequence.dtw(C=C[:, ::-1].copy(), global_constraints=True, band_rad=band, backtrack=True)
    null = float(np.mean(C[:, ::-1][wp0[:, 0], wp0[:, 1]]))
    ratio = cost / max(null, 1e-6)
    # a plausible alignment of the same text never stalls for long on one side either
    stalls = _max_stall(path) * hop_s
    plausible = finite_end and ratio < MAX_COST_RATIO and stalls < 2.5
    return Alignment(path=path, hop_s=hop_s, n_a=na, n_b=nb, cost=cost, plausible=bool(plausible),
                     cost_ratio=float(ratio))


def _max_stall(path: np.ndarray) -> int:
    best = 0
    for col in (0, 1):
        v = path[:, col]
        run = 1
        for k in range(1, len(v)):
            run = run + 1 if v[k] == v[k - 1] else 1
            best = max(best, run)
    return best


def align_recordings(ya: np.ndarray, yb: np.ndarray, sr: int, band: float = 0.35) -> Alignment:
    return dtw(mfcc_features(ya, sr), mfcc_features(yb, sr), band=band)
