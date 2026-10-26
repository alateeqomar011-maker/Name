"""Measured vocal characteristics of a recording.

Everything here is a measurement with a documented method, so the Voice Studio can show a user how
their voice compares with a reference reciter and the style-transfer stage can compute targets.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np
from scipy.linalg import solve_toeplitz
from scipy.signal import find_peaks, lfilter

from . import world
from .io import resample
from .vad import speech_segments


def hz_to_st(f: np.ndarray | float) -> np.ndarray | float:
    """Semitones relative to 55 Hz (A1)."""
    return 12.0 * np.log2(np.asarray(f) / 55.0)


def st_to_hz(s: np.ndarray | float) -> np.ndarray | float:
    return 55.0 * 2.0 ** (np.asarray(s) / 12.0)


@dataclass
class VoiceProfile:
    duration_s: float
    speech_s: float
    pause_ratio: float
    mean_phrase_s: float
    # pitch
    f0_median_hz: float
    f0_p10_hz: float
    f0_p90_hz: float
    range_st: float
    melodic_activity_st_per_s: float
    vibrato_rate_hz: float | None
    vibrato_extent_cents: float | None
    sustained_ratio: float
    jitter_pct: float
    # timbre
    hnr_db: float
    spectral_tilt_db_per_oct: float
    centroid_hz: float
    warmth_db: float
    formants_hz: list[float]
    vtl_cm: float | None
    # timing
    syllable_rate: float

    def to_dict(self) -> dict:
        d = asdict(self)
        return {k: (round(v, 3) if isinstance(v, float) else v) for k, v in d.items()}


def _runs(mask: np.ndarray) -> list[tuple[int, int]]:
    """Index ranges [a, b) where mask is True."""
    if mask.size == 0:
        return []
    m = np.concatenate([[False], mask.astype(bool), [False]])
    d = np.diff(m.astype(np.int8))
    starts = np.flatnonzero(d == 1)
    ends = np.flatnonzero(d == -1)
    return list(zip(starts.tolist(), ends.tolist()))


def clean_f0_st(f0: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Pitch in semitones with octave errors folded back and short glitches removed.
    Returns (st, voiced_mask); st is 0 where unvoiced."""
    from scipy.signal import medfilt
    voiced = f0 > 0
    st = np.zeros_like(f0, dtype=np.float64)
    if voiced.sum() < 5:
        return st, voiced
    st[voiced] = hz_to_st(f0[voiced])
    m = float(np.median(st[voiced]))
    hi = voiced & (st > m + 9)
    lo = voiced & (st < m - 9)
    st[hi] -= 12.0
    st[lo] += 12.0
    for a, b in _runs(voiced):
        if b - a >= 5:
            st[a:b] = medfilt(st[a:b], 5)
    keep = voiced & (np.abs(st - m) < 14)
    st[~keep] = 0.0
    return st, keep


def _vibrato(f0_st: np.ndarray, voiced: np.ndarray, fp_s: float) -> tuple[float | None, float | None, float]:
    """Vibrato on held notes: dominant 3.5–9 Hz oscillation of the detrended pitch.
    Returns (rate_hz, extent_cents, sustained_ratio)."""
    rates, extents, sustained = [], [], 0
    total_voiced = int(voiced.sum()) or 1
    win = max(3, int(0.15 / fp_s))
    for a, b in _runs(voiced):
        n = b - a
        if n * fp_s < 0.35:
            continue
        seg = f0_st[a:b]
        # a "held note": pitch stays within 1.5 semitones of its running mean
        trend = np.convolve(seg, np.ones(win) / win, mode="same")
        resid = seg - trend
        held = np.abs(seg - np.median(seg)) < 1.5
        if held.mean() > 0.8:
            sustained += n
        if n * fp_s < 0.5:
            continue
        r = resid[win:-win] if n > 3 * win else resid
        if r.size < 16:
            continue
        r = r - r.mean()
        spec = np.abs(np.fft.rfft(r * np.hanning(r.size), n=1024))
        freqs = np.fft.rfftfreq(1024, fp_s)
        band = (freqs >= 3.5) & (freqs <= 9.0)
        if not band.any():
            continue
        k = np.argmax(spec[band])
        peak = spec[band][k]
        rest = np.median(spec[(freqs > 0.5) & (freqs < 20)]) + 1e-9
        if peak / rest > 4.0:
            rates.append(freqs[band][k])
            extents.append(np.percentile(np.abs(r), 90) * 100)
    rate = float(np.median(rates)) if rates else None
    extent = float(np.median(extents)) if extents else None
    return rate, extent, sustained / total_voiced


def _formants(y: np.ndarray, sr: int, f0: np.ndarray, fp_s: float) -> tuple[list[float], float | None]:
    """Median F1–F3 from LPC on voiced frames (Burg-free autocorrelation method at 10 kHz)."""
    y10 = resample(y, sr, 10000).astype(np.float64)
    y10 = lfilter([1, -0.97], [1], y10)
    frame = int(0.025 * 10000)
    order = 12
    win = np.hamming(frame)
    found: list[list[float]] = []
    times = np.flatnonzero(f0 > 0) * fp_s
    if times.size == 0:
        return [], None
    # sample at most ~400 voiced frames for speed
    step = max(1, times.size // 400)
    energy_ref = np.sqrt(np.mean(y10 ** 2)) + 1e-9
    for t in times[::step]:
        c = int(t * 10000)
        a, b = c - frame // 2, c + frame // 2
        if a < 0 or b > y10.size:
            continue
        x = y10[a:b] * win
        if np.sqrt(np.mean(x ** 2)) < 0.3 * energy_ref:
            continue
        r = np.correlate(x, x, mode="full")[frame - 1:frame + order]
        if r[0] <= 0:
            continue
        r[0] *= 1.0 + 1e-9
        try:
            lpc = solve_toeplitz(r[:-1], r[1:])
        except np.linalg.LinAlgError:
            continue
        roots = np.roots(np.concatenate([[1.0], -lpc]))
        roots = roots[np.imag(roots) > 0]
        freqs = np.angle(roots) * 10000 / (2 * np.pi)
        bws = -np.log(np.abs(roots)) * 10000 / np.pi
        sel = sorted(f for f, bw in zip(freqs, bws) if 200 < f < 4500 and bw < 400)
        if len(sel) >= 3:
            found.append(sel[:3])
    if len(found) < 5:
        return [], None
    fm = np.median(np.array(found), axis=0)
    # vocal tract length from average formant spacing of a uniform tube: F_n = (2n-1) c / 4L
    c = 35000.0  # cm/s
    est = [(2 * (i + 1) - 1) * c / (4 * f) for i, f in enumerate(fm)]
    return [round(float(f), 1) for f in fm], float(np.median(est))


def _syllable_rate(y: np.ndarray, sr: int, speech_s: float) -> float:
    """Syllable nuclei per second of speech: peaks in the smoothed band-limited intensity
    contour that rise at least 2 dB above the preceding dip (after De Jong & Wempe, 2009)."""
    if speech_s <= 0.2:
        return 0.0
    from scipy.signal import butter, sosfiltfilt
    sos = butter(4, [300, 3000], btype="band", fs=sr, output="sos")
    z = sosfiltfilt(sos, y.astype(np.float64))
    hop = int(0.01 * sr)
    n = z.size // hop
    if n < 5:
        return 0.0
    env = np.sqrt(np.mean(z[: n * hop].reshape(n, hop) ** 2, axis=1))
    env_db = 20 * np.log10(env + 1e-8)
    k = np.hanning(7)
    env_db = np.convolve(env_db, k / k.sum(), mode="same")
    floor = np.percentile(env_db, 20)
    peaks, _ = find_peaks(env_db, prominence=2.0, distance=8, height=floor + 6)
    return float(len(peaks) / speech_s)


def profile(y: np.ndarray, sr: int, params: world.WorldParams | None = None) -> VoiceProfile:
    """Measure a recording. `params` may be passed in to reuse an existing WORLD analysis."""
    p = params or world.analyze(y, sr, accurate=y.size / sr < 90)
    fp_s = p.frame_period / 1000.0
    dur = y.size / sr
    y16 = resample(y, sr, 16000) if sr != 16000 else y
    segs = speech_segments(y16, 16000)
    speech_s = float(sum(b - a for a, b in segs))
    pause_ratio = float(1 - speech_s / dur) if dur > 0 else 0.0
    mean_phrase = float(np.mean([b - a for a, b in segs])) if segs else 0.0

    st, voiced = clean_f0_st(p.f0)
    if voiced.sum() < 10:
        raise ValueError("Not enough voiced audio to analyse. Recite a little louder or longer.")
    f0v = st_to_hz(st[voiced])
    p10, p50, p90 = np.percentile(f0v, [10, 50, 90])

    # melodic activity: mean absolute pitch movement inside voiced runs, in semitones per second,
    # on a 25 ms-smoothed contour and ignoring frame-to-frame jumps too fast to be sung
    moves = []
    k = max(1, int(0.025 / fp_s))
    for a, b in _runs(voiced):
        if (b - a) * fp_s >= 0.1:
            seg = np.convolve(st[a:b], np.ones(k) / k, mode="valid")
            d = np.abs(np.diff(seg))
            d = d[d < 1.0]
            moves.append(d.sum() / (seg.size * fp_s))
    activity = float(np.median(moves)) if moves else 0.0
    vib_rate, vib_ext, sustained = _vibrato(st, voiced, fp_s)

    # jitter: mean absolute difference between consecutive periods relative to mean period
    periods = 1.0 / p.f0[voiced]
    jitter = float(np.mean(np.abs(np.diff(periods))) / np.mean(periods) * 100) if periods.size > 2 else 0.0

    # harmonic-to-noise ratio from WORLD aperiodicity below 4 kHz in voiced frames
    fft = p.sp.shape[1]
    freqs = np.linspace(0, p.sr / 2, fft)
    band = (freqs > 100) & (freqs < 4000)
    apv = np.clip(p.ap[voiced][:, band], 1e-4, 1 - 1e-4)
    hnr = float(np.median(10 * np.log10((1 - apv ** 2) / apv ** 2)))

    # long-term average envelope of voiced frames (dB)
    env = 10 * np.log10(np.mean(p.sp[voiced], axis=0) + 1e-16)
    sel = (freqs >= 300) & (freqs <= 5000)
    slope = np.polyfit(np.log2(freqs[sel]), env[sel], 1)[0]
    lin = 10 ** (env / 10)
    amp = np.sqrt(lin)
    centroid = float(np.sum(freqs * amp) / np.sum(amp))
    low = np.mean(lin[(freqs >= 100) & (freqs < 1000)])
    mid = np.mean(lin[(freqs >= 1000) & (freqs < 4000)])
    warmth = float(10 * np.log10(low / (mid + 1e-16)))

    formants, vtl = _formants(y, sr, p.f0, fp_s)
    return VoiceProfile(
        duration_s=dur, speech_s=speech_s, pause_ratio=pause_ratio, mean_phrase_s=mean_phrase,
        f0_median_hz=float(p50), f0_p10_hz=float(p10), f0_p90_hz=float(p90),
        range_st=float(hz_to_st(p90) - hz_to_st(p10)), melodic_activity_st_per_s=activity,
        vibrato_rate_hz=vib_rate, vibrato_extent_cents=vib_ext, sustained_ratio=float(sustained),
        jitter_pct=jitter, hnr_db=hnr, spectral_tilt_db_per_oct=float(slope), centroid_hz=centroid,
        warmth_db=warmth, formants_hz=formants, vtl_cm=vtl,
        syllable_rate=_syllable_rate(y, sr, speech_s),
    )


def _scale(v: float | None, lo: float, hi: float) -> int | None:
    if v is None:
        return None
    return int(round(100 * min(1.0, max(0.0, (v - lo) / (hi - lo)))))


def descriptors(vp: VoiceProfile) -> dict:
    """0–100 scales for display. The ranges are chosen to cover adult recitation; they are display
    scales, not judgements."""
    return {
        "pitch": _scale(float(hz_to_st(vp.f0_median_hz)), float(hz_to_st(70)), float(hz_to_st(320))),
        "range": _scale(vp.range_st, 2, 18),
        "melody": _scale(vp.melodic_activity_st_per_s, 10, 60),
        "warmth": _scale(vp.warmth_db, 0, 30),
        "brightness": _scale(vp.centroid_hz, 400, 2200),
        "smoothness": _scale(-vp.jitter_pct, -4, -0.3),
        "clarity": _scale(vp.hnr_db, 0, 25),
        "pace": _scale(vp.syllable_rate, 2, 7),
        "sustain": _scale(vp.sustained_ratio, 0.05, 0.6),
        "resonance": _scale(vp.vtl_cm, 13, 19.5) if vp.vtl_cm else None,
    }


def compare(user: VoiceProfile, ref: VoiceProfile) -> list[dict]:
    """Plain-language differences between a user and a reference (used in the Voice Studio)."""
    out = []
    d_st = float(hz_to_st(ref.f0_median_hz) - hz_to_st(user.f0_median_hz))
    out.append({"key": "pitch", "delta": round(d_st, 1), "unit": "semitones",
                "en": f"The reference sits {abs(d_st):.1f} semitones {'higher' if d_st > 0 else 'lower'} than you." if abs(d_st) >= 0.5 else "Your register is close to the reference.",
                "ar": f"طبقة القارئ المرجعي {'أعلى' if d_st > 0 else 'أخفض'} من طبقتك بنحو {abs(d_st):.1f} نصف درجة." if abs(d_st) >= 0.5 else "طبقة صوتك قريبة من القارئ المرجعي."})
    d_r = ref.range_st - user.range_st
    out.append({"key": "range", "delta": round(d_r, 1), "unit": "semitones",
                "en": ("The reference uses a wider melodic range." if d_r > 1 else "The reference uses a narrower melodic range." if d_r < -1 else "Your melodic range is similar."),
                "ar": ("يستخدم القارئ المرجعي مدى نغميًّا أوسع." if d_r > 1 else "يستخدم القارئ المرجعي مدى نغميًّا أضيق." if d_r < -1 else "مداك النغمي مشابه.")})
    if user.syllable_rate > 0 and ref.syllable_rate > 0:
        ratio = ref.syllable_rate / user.syllable_rate
        out.append({"key": "pace", "delta": round(ratio, 2), "unit": "ratio",
                    "en": ("The reference recites more slowly." if ratio < 0.9 else "The reference recites faster." if ratio > 1.1 else "Your pace is similar."),
                    "ar": ("القارئ المرجعي أبطأ في التلاوة." if ratio < 0.9 else "القارئ المرجعي أسرع في التلاوة." if ratio > 1.1 else "سرعتك مشابهة.")})
    d_w = ref.warmth_db - user.warmth_db
    out.append({"key": "warmth", "delta": round(d_w, 1), "unit": "dB",
                "en": ("The reference has a warmer, darker tone." if d_w > 2 else "The reference has a brighter tone." if d_w < -2 else "Tone colour is similar."),
                "ar": ("نبرة القارئ المرجعي أدفأ وأعمق." if d_w > 2 else "نبرة القارئ المرجعي أكثر إشراقًا." if d_w < -2 else "لون النبرة متقارب.")})
    if user.vtl_cm and ref.vtl_cm:
        d_v = ref.vtl_cm - user.vtl_cm
        out.append({"key": "resonance", "delta": round(d_v, 1), "unit": "cm",
                    "en": ("The reference resonates deeper (longer vocal tract)." if d_v > 0.7 else "The reference resonates higher (shorter vocal tract)." if d_v < -0.7 else "Resonance is similar."),
                    "ar": ("رنين القارئ المرجعي أعمق." if d_v > 0.7 else "رنين القارئ المرجعي أعلى." if d_v < -0.7 else "الرنين متقارب.")})
    if ref.vibrato_rate_hz and not user.vibrato_rate_hz:
        out.append({"key": "vibrato", "delta": None, "unit": None,
                    "en": "The reference adds a gentle vibrato on held vowels; yours is steady.",
                    "ar": "يضيف القارئ المرجعي اهتزازًا خفيفًا في المدود، وصوتك ثابت."})
    return out
