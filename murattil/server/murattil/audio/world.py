"""Thin wrapper around the WORLD vocoder (pyworld): analysis into F0 / spectral envelope /
aperiodicity, and resynthesis. Everything in the style-transfer stage operates on these parameters."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pyworld as pw

FRAME_PERIOD_MS = 5.0
F0_FLOOR = 55.0
F0_CEIL = 800.0


@dataclass
class WorldParams:
    f0: np.ndarray  # (T,) Hz, 0 = unvoiced
    sp: np.ndarray  # (T, fft//2+1) power spectral envelope
    ap: np.ndarray  # (T, fft//2+1) aperiodicity 0..1
    sr: int
    frame_period: float = FRAME_PERIOD_MS

    @property
    def n_frames(self) -> int:
        return int(self.f0.shape[0])

    @property
    def times(self) -> np.ndarray:
        return np.arange(self.n_frames) * self.frame_period / 1000.0

    @property
    def voiced(self) -> np.ndarray:
        return self.f0 > 0


def analyze(y: np.ndarray, sr: int, accurate: bool = True, f0_floor: float = F0_FLOOR,
            f0_ceil: float = F0_CEIL) -> WorldParams:
    x = np.ascontiguousarray(y, dtype=np.float64)
    if accurate:
        f0, t = pw.harvest(x, sr, f0_floor=f0_floor, f0_ceil=f0_ceil, frame_period=FRAME_PERIOD_MS)
    else:
        f0, t = pw.dio(x, sr, f0_floor=f0_floor, f0_ceil=f0_ceil, frame_period=FRAME_PERIOD_MS)
        f0 = pw.stonemask(x, f0, t, sr)
    sp = pw.cheaptrick(x, f0, t, sr)
    ap = pw.d4c(x, f0, t, sr)
    return WorldParams(f0=f0, sp=sp, ap=ap, sr=sr)


def f0_only(y: np.ndarray, sr: int, accurate: bool = False) -> tuple[np.ndarray, np.ndarray]:
    x = np.ascontiguousarray(y, dtype=np.float64)
    if accurate:
        return pw.harvest(x, sr, f0_floor=F0_FLOOR, f0_ceil=F0_CEIL, frame_period=FRAME_PERIOD_MS)
    f0, t = pw.dio(x, sr, f0_floor=F0_FLOOR, f0_ceil=F0_CEIL, frame_period=FRAME_PERIOD_MS)
    return pw.stonemask(x, f0, t, sr), t


def synthesize(p: WorldParams) -> np.ndarray:
    f0 = np.ascontiguousarray(p.f0, dtype=np.float64)
    sp = np.ascontiguousarray(np.maximum(p.sp, 1e-16), dtype=np.float64)
    ap = np.ascontiguousarray(np.clip(p.ap, 0.0, 1.0), dtype=np.float64)
    return pw.synthesize(f0, sp, ap, p.sr, p.frame_period).astype(np.float32)


def fft_size(sr: int) -> int:
    return pw.get_cheaptrick_fft_size(sr, F0_FLOOR)
