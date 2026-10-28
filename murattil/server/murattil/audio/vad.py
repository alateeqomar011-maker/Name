"""Voice activity detection: Silero VAD (neural, bundled with the `silero-vad` package) with an
energy-based fallback so the rest of the pipeline still works if the model cannot be loaded."""
from __future__ import annotations

import logging
import threading

import numpy as np

log = logging.getLogger(__name__)
_lock = threading.Lock()
_model = None
_model_failed = False


def _silero():
    global _model, _model_failed
    with _lock:
        if _model is None and not _model_failed:
            try:
                from silero_vad import load_silero_vad
                _model = load_silero_vad(onnx=True)
            except Exception as e:  # pragma: no cover - depends on the environment
                log.warning("Silero VAD unavailable, using energy VAD: %s", e)
                _model_failed = True
        return _model


def energy_segments(y: np.ndarray, sr: int, min_speech: float = 0.15, min_silence: float = 0.25) -> list[tuple[float, float]]:
    hop = int(0.01 * sr)
    win = int(0.03 * sr)
    if y.size < win:
        return []
    n = 1 + (y.size - win) // hop
    idx = np.arange(win)[None, :] + hop * np.arange(n)[:, None]
    e = 10 * np.log10(np.mean(y[idx] ** 2, axis=1) + 1e-10)
    floor = np.percentile(e, 10)
    peak = np.percentile(e, 95)
    thr = max(floor + 0.35 * (peak - floor), floor + 6)
    active = e > thr
    return _runs_to_segments(active, 0.01, min_speech, min_silence)


def _runs_to_segments(active: np.ndarray, step: float, min_speech: float, min_silence: float) -> list[tuple[float, float]]:
    segs: list[list[float]] = []
    start = None
    for i, a in enumerate(active):
        if a and start is None:
            start = i
        elif not a and start is not None:
            segs.append([start * step, i * step])
            start = None
    if start is not None:
        segs.append([start * step, len(active) * step])
    merged: list[list[float]] = []
    for s in segs:
        if merged and s[0] - merged[-1][1] < min_silence:
            merged[-1][1] = s[1]
        else:
            merged.append(s)
    return [(a, b) for a, b in merged if b - a >= min_speech]


def speech_segments(y: np.ndarray, sr: int = 16000, min_silence: float = 0.25) -> list[tuple[float, float]]:
    """Return [(start_s, end_s)] of speech. `y` must be 16 kHz (or 8 kHz) mono for Silero."""
    model = _silero() if sr in (8000, 16000) else None
    if model is None:
        return energy_segments(y, sr, min_silence=min_silence)
    import torch
    from silero_vad import get_speech_timestamps
    with _lock:  # the ONNX wrapper keeps recurrent state; serialise access
        ts = get_speech_timestamps(
            torch.from_numpy(np.ascontiguousarray(y, dtype=np.float32)), model, sampling_rate=sr,
            min_silence_duration_ms=int(min_silence * 1000), return_seconds=True,
        )
        model.reset_states()
    return [(float(t["start"]), float(t["end"])) for t in ts]


def trim(y: np.ndarray, sr: int, pad: float = 0.15) -> tuple[np.ndarray, float]:
    """Trim leading/trailing non-speech. Returns (trimmed, offset_seconds)."""
    y16 = y if sr == 16000 else _to16k(y, sr)
    segs = speech_segments(y16, 16000)
    if not segs:
        return y, 0.0
    a0, b0 = segs[0][0], segs[-1][1]
    # Silero can score a long held vowel (a 4–6 count madd at the end of an ayah) as non-speech;
    # never cut into sound that is continuous with the detected speech
    for e0, e1 in energy_segments(y16, 16000, min_silence=0.3):
        if e0 < a0 <= e1 + 0.3:
            a0 = e0
        if e0 - 0.3 <= b0 < e1:
            b0 = e1
    a = max(0.0, a0 - pad)
    b = min(y.size / sr, b0 + pad)
    return y[int(a * sr):int(b * sr)], a


def _to16k(y: np.ndarray, sr: int) -> np.ndarray:
    from .io import resample
    return resample(y, sr, 16000)


def _complement(segs: list[tuple[float, float]], dur: float) -> list[tuple[float, float]]:
    out, t = [], 0.0
    for a, b in segs:
        if a > t:
            out.append((t, a))
        t = max(t, b)
    if t < dur:
        out.append((t, dur))
    return out


def pauses(y: np.ndarray, sr: int = 16000, min_pause: float = 0.3) -> list[tuple[float, float]]:
    """[(start_s, end_s)] of pauses: stretches that both the neural VAD and the energy detector hear
    as silent. Silero alone can call a fricative or a long held vowel "silence"; energy alone counts
    room reverb as sound."""
    dur = y.size / sr
    a = _complement(speech_segments(y, sr, min_silence=0.1), dur)
    b = _complement(energy_segments(y, sr, min_speech=0.08, min_silence=0.1), dur)
    out = []
    for a0, a1 in a:
        for b0, b1 in b:
            lo, hi = max(a0, b0), min(a1, b1)
            if hi - lo >= min_pause:
                out.append((lo, hi))
    return out
