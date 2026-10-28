"""Acoustic Tajweed checks inside aligned word segments.

These are measurements with deliberately conservative thresholds, not a model trained to judge
tajweed. Each finding carries a confidence; none is ever reported as certain:

  madd      longest sustained vowel inside the word, in counts (harakat) of the reciter's own
            tempo, compared with the length the rule requires
  ghunnah   longest nasal-murmur stretch (low-frequency dominated, voiced, steady) around the
            noon/meem, compared with ~2 counts
  qalqalah  a closure followed by a release burst near the qalqalah letter
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

HOP = 0.01
SR = 16000
STEADY = 1.0   # a held vowel's frames change less than the recording's median voiced frame

SHORT_VOWELS = set("َُِ")
TANWEEN = set("ًࣰٌࣱٍࣲ")
SHADDA = "ّ"
LONG_MARKS = set("ٰۥۦ")


@dataclass
class Frames:
    energy_db: np.ndarray
    voiced: np.ndarray
    low_ratio: np.ndarray   # share of 0–4 kHz energy below 500 Hz
    centroid: np.ndarray
    flux: np.ndarray        # spectral change between frames, on smoothed (mel-band) spectra
    flux_ref: float         # median flux of this recording's voiced frames: "steady" is judged against it


def frame_features(y: np.ndarray, sr: int = SR) -> Frames:
    from ..audio import world
    hop = int(HOP * sr)
    win = int(0.025 * sr)
    n = max(1, 1 + (y.size - win) // hop)
    idx = np.arange(win)[None, :] + hop * np.arange(n)[:, None]
    idx = np.minimum(idx, y.size - 1)
    fr = y[idx] * np.hanning(win)[None, :]
    spec = np.abs(np.fft.rfft(fr, n=512, axis=1)) ** 2
    freqs = np.fft.rfftfreq(512, 1 / sr)
    e = 10 * np.log10(spec.sum(axis=1) + 1e-10)
    band = spec[:, freqs < 4000]
    low = spec[:, freqs < 500].sum(axis=1) / (band.sum(axis=1) + 1e-10)
    cen = (spec[:, freqs < 4000] * freqs[freqs < 4000]).sum(axis=1) / (band.sum(axis=1) + 1e-10)
    # Spectral change is measured on 24 mel bands (a per-bin log spectrum changes too much from frame
    # to frame on real recordings to tell a held vowel from a transition), over +-1 frame.
    from librosa.filters import mel
    bands = np.log(spec @ mel(sr=sr, n_fft=512, n_mels=24, fmax=4000).T + 1e-8)
    bands -= bands.mean(axis=1, keepdims=True)
    flux = np.zeros(n)
    if n > 2:
        flux[1:-1] = np.sqrt(np.mean(((bands[2:] - bands[:-2]) / 2) ** 2, axis=1))
        flux[0], flux[-1] = flux[1], flux[-2]
    f0, _ = world.f0_only(y.astype(np.float64), sr, accurate=False)
    # WORLD frames are 5 ms; take every other one to match the 10 ms grid
    v = f0[::2][:n] > 0
    if v.size < n:
        v = np.pad(v, (0, n - v.size))
    ref = float(np.median(flux[v])) if v.any() else float(np.median(flux))
    return Frames(energy_db=e, voiced=v, low_ratio=low, centroid=cen, flux=flux, flux_ref=max(ref, 1e-3))


def _longest_run(mask: np.ndarray, max_gap: int = 2) -> tuple[int, int]:
    """Longest run of True allowing gaps of up to `max_gap` frames. Returns (start, length)."""
    best = (0, 0)
    start = None
    gap = 0
    last_true = -1
    for i, m in enumerate(mask):
        if m:
            if start is None:
                start = i
            gap = 0
            last_true = i
        elif start is not None:
            gap += 1
            if gap > max_gap:
                length = last_true - start + 1
                if length > best[1]:
                    best = (start, length)
                start = None
                gap = 0
    if start is not None:
        length = last_true - start + 1
        if length > best[1]:
            best = (start, length)
    return best


def sustained_vowel_span(f: Frames, a: int, b: int) -> tuple[int, int]:
    """(first frame, number of frames) of the longest steady, loud, voiced stretch in frames [a, b)."""
    if b - a < 3:
        return a, 0
    e = f.energy_db[a:b]
    # voiced, loud and steadier than this recording's typical voiced frame (vowels ī and ū have most
    # of their energy below 500 Hz, so the low-frequency share is not used here)
    m = f.voiced[a:b] & (e > e.max() - 14) & (f.flux[a:b] < STEADY * f.flux_ref)
    start, length = _longest_run(m)
    return a + start, length


def sustained_vowel(f: Frames, a: int, b: int) -> float:
    """Seconds of the longest steady, loud, voiced stretch in frames [a, b)."""
    return sustained_vowel_span(f, a, b)[1] * HOP


def nasal_murmur(f: Frames, a: int, b: int) -> float:
    if b - a < 3:
        return 0.0
    e = f.energy_db[a:b]
    m = (f.voiced[a:b] & (f.low_ratio[a:b] > 0.6) & (f.centroid[a:b] < 900) & (e > e.max() - 25)
         & (f.flux[a:b] < 1.2 * f.flux_ref))
    return _longest_run(m, max_gap=1)[1] * HOP


def release_burst(f: Frames, a: int, b: int) -> bool:
    """A closure (>=20 ms at least 15 dB below the local peak) followed within 40 ms by an
    energy rise of at least 9 dB."""
    if b - a < 6:
        return False
    e = f.energy_db[a:b]
    peak = e.max()
    closed = e < peak - 15
    for i in range(2, len(e) - 1):
        if closed[i - 2:i].all():
            j = min(len(e), i + 4)
            if e[i:j].max() - e[i - 1] >= 9:
                return True
    return False


def moras(word: str) -> int:
    """Approximate count of short-vowel units in a fully vowelled Uthmani word."""
    n = 0
    chars = list(word)
    for i, ch in enumerate(chars):
        if ch in SHORT_VOWELS or ch in TANWEEN:
            n += 1
        elif ch in LONG_MARKS:
            n += 1
        elif ch == SHADDA:
            n += 1
        elif ch in "اىوي" and i > 0:
            prev = next((c for c in reversed(chars[:i]) if c not in "ٓٔ"), "")
            if (ch in "اى" and prev == "َ") or (ch == "و" and prev == "ُ") or (ch == "ي" and prev == "ِ"):
                nxt = chars[i + 1] if i + 1 < len(chars) else ""
                if nxt not in SHORT_VOWELS and nxt != SHADDA:
                    n += 1
    return max(n, 1)


def harakah_unit(f: Frames, words: list[dict]) -> tuple[float | None, str]:
    """Estimate the reciter's own length of one count (harakah), in seconds.
    Prefers natural-madd vowels (2 counts each); falls back to vowel units per word."""
    natural = []
    for w in words:
        if w.get("seg_local") and w["rules"] == {"madd-tabee-kalimi"} and w["confidence"] >= 0.5:
            a, b = w["seg_local"]
            d = sustained_vowel(f, int(a / HOP), int(b / HOP))
            if d > 0.08:
                natural.append(d / 2)
    if len(natural) >= 3 and 0.07 <= np.median(natural) <= 0.5:
        return float(np.median(natural)), "natural-madd"
    per = []
    for w in words:
        if w.get("seg_local") and not (w["rules"] & {"madd-muttasil", "madd-munfasil", "madd-lazim-kalimi-muthaqqal",
                                               "madd-lazim-kalimi-mukhaffaf"}) and w["confidence"] >= 0.5:
            a, b = w["seg_local"]
            per.append((b - a) / moras(w["text"]))
    if len(per) >= 3:
        return float(np.clip(np.median(per), 0.07, 0.5)), "syllable-units"
    return None, "insufficient"
