"""Reciter-inspired prosody and timbre transfer in the WORLD vocoder domain.

The user's recording is decomposed into pitch (F0), spectral envelope and aperiodicity. Each control
changes one of these in a principled way, then the signal is resynthesised:

  pitch / register   F0 shifted in semitones; "register match" moves toward the reference's
                     register *in the user's own octave* (a woman matching a male reciter is not
                     pushed down an octave)
  melody transfer    F0 follows the reference reciter's melodic contour, time-aligned by DTW, kept
                     relative to the reference's own register (requires the same passage)
  expression         pitch movement around the median is widened or narrowed
  pacing / timing    frames are resampled in time (pitch unchanged); "timing match" follows the
                     reference's timing through the DTW path
  resonance          spectral envelope frequency-warped (formants up = shorter vocal tract)
  warmth             spectral tilt of the envelope
  smoothness         pitch micro-variation smoothed and aperiodicity (breathiness) reduced
  vibrato            reference-like vibrato added to held notes (madd)

None of this changes which words are said: the phonetic content lives in the spectral envelope
sequence, which is only warped in frequency or resampled in time, never replaced.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field

import numpy as np

from . import world
from .align import Alignment
from .analysis import VoiceProfile, _runs, clean_f0_st, hz_to_st, st_to_hz
from .io import loudness_normalize


@dataclass
class StyleControls:
    pitch_shift_st: float = 0.0     # manual pitch offset, -7..+7 semitones
    register_match: float = 0.0     # 0..1 toward the reference register (octave-aware)
    melody_transfer: float = 0.0    # 0..1 toward the reference melodic contour (needs alignment)
    expression: float = 1.0         # 0.5..1.8 scale of pitch movement around the median
    pace: float = 1.0               # 0.75..1.33 duration factor (>1 = slower, longer)
    timing_match: float = 0.0       # 0..1 follow the reference timing (needs alignment)
    resonance: float = 0.0          # -1..1 formant shift (negative = deeper, longer vocal tract)
    warmth: float = 0.0             # -1..1 spectral tilt (positive = warmer, darker)
    smoothness: float = 0.0         # 0..1
    vibrato: float = 0.0            # 0..1

    @classmethod
    def from_dict(cls, d: dict) -> "StyleControls":
        c = cls(**{k: float(v) for k, v in d.items() if k in cls.__dataclass_fields__})
        return c.clamped()

    def clamped(self) -> "StyleControls":
        def cl(v, lo, hi):
            return float(min(hi, max(lo, v)))
        return StyleControls(
            pitch_shift_st=cl(self.pitch_shift_st, -7, 7),
            register_match=cl(self.register_match, 0, 1),
            melody_transfer=cl(self.melody_transfer, 0, 1),
            expression=cl(self.expression, 0.5, 1.8),
            pace=cl(self.pace, 0.75, 1.33),
            timing_match=cl(self.timing_match, 0, 1),
            resonance=cl(self.resonance, -1, 1),
            warmth=cl(self.warmth, -1, 1),
            smoothness=cl(self.smoothness, 0, 1),
            vibrato=cl(self.vibrato, 0, 1),
        )

    def to_dict(self) -> dict:
        return {k: round(v, 3) for k, v in asdict(self).items()}


@dataclass
class StyleTargets:
    """Reference-derived quantities the controls interpolate toward."""
    ref_median_st: float | None = None
    ref_range_st: float | None = None
    ref_vibrato_rate: float | None = None
    ref_vibrato_cents: float | None = None
    resonance_ratio: float | None = None   # formant scale that would match the reference
    warmth_delta_db: float | None = None
    pace_ratio: float | None = None        # duration factor that would match the reference pace


@dataclass
class StyleReport:
    applied: dict = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)


def suggest(user: VoiceProfile, ref: VoiceProfile, strength: float = 0.6) -> tuple[StyleControls, StyleTargets]:
    """Suggested control values that move the user part of the way toward the reference style."""
    s = float(min(1.0, max(0.0, strength)))
    t = StyleTargets(
        ref_median_st=float(hz_to_st(ref.f0_median_hz)),
        ref_range_st=ref.range_st,
        ref_vibrato_rate=ref.vibrato_rate_hz,
        ref_vibrato_cents=ref.vibrato_extent_cents,
        resonance_ratio=(user.vtl_cm / ref.vtl_cm) if (user.vtl_cm and ref.vtl_cm) else None,
        warmth_delta_db=ref.warmth_db - user.warmth_db,
        pace_ratio=(user.syllable_rate / ref.syllable_rate) if (user.syllable_rate > 0 and ref.syllable_rate > 0) else None,
    )
    expr = 1.0
    if user.range_st > 0.5:
        expr = float(np.clip(1 + s * (ref.range_st / user.range_st - 1), 0.6, 1.6))
    res = 0.0
    if t.resonance_ratio:
        # resonance control maps -1..1 to formant ratio 0.88..1.12
        res = float(np.clip(s * (t.resonance_ratio - 1) / 0.12, -1, 1))
    warm = float(np.clip(s * (t.warmth_delta_db or 0) / 8.0, -1, 1))
    pace = 1.0
    if t.pace_ratio:
        pace = float(np.clip(1 + s * (t.pace_ratio - 1), 0.8, 1.25))
    c = StyleControls(
        register_match=0.5 * s, melody_transfer=0.7 * s, expression=expr, pace=pace,
        timing_match=0.5 * s, resonance=res, warmth=warm, smoothness=0.3 * s,
        vibrato=s if ref.vibrato_rate_hz else 0.0,
    )
    return c.clamped(), t


def _nearest_octave(target_st: float, around_st: float) -> float:
    return target_st + 12.0 * round((around_st - target_st) / 12.0)


def _warp_frames(p: world.WorldParams, src_pos: np.ndarray) -> world.WorldParams:
    """Resample WORLD frames: output frame k takes its parameters from (fractional) input frame src_pos[k]."""
    n = p.n_frames
    src_pos = np.clip(src_pos, 0, n - 1)
    i0 = np.floor(src_pos).astype(int)
    i1 = np.minimum(i0 + 1, n - 1)
    w = (src_pos - i0)[:, None]
    logsp = np.log(np.maximum(p.sp, 1e-16))
    sp = np.exp((1 - w) * logsp[i0] + w * logsp[i1])
    ap = (1 - w) * p.ap[i0] + w * p.ap[i1]
    near = np.where(w[:, 0] < 0.5, i0, i1)
    f0 = p.f0[near].copy()
    both = (p.f0[i0] > 0) & (p.f0[i1] > 0)
    f0[both] = np.exp((1 - w[both, 0]) * np.log(p.f0[i0][both]) + w[both, 0] * np.log(p.f0[i1][both]))
    return world.WorldParams(f0=f0, sp=sp, ap=ap, sr=p.sr, frame_period=p.frame_period)


def _freq_warp(sp: np.ndarray, ratio: float) -> np.ndarray:
    """Scale formant frequencies by `ratio` (new envelope at f equals old envelope at f / ratio)."""
    if abs(ratio - 1) < 1e-3:
        return sp
    nb = sp.shape[1]
    bins = np.arange(nb, dtype=np.float64)
    src = np.clip(bins / ratio, 0, nb - 1)
    i0 = np.floor(src).astype(int)
    i1 = np.minimum(i0 + 1, nb - 1)
    w = src - i0
    logsp = np.log(np.maximum(sp, 1e-16))
    return np.exp((1 - w) * logsp[:, i0] + w * logsp[:, i1])


def _tilt(sp: np.ndarray, sr: int, warmth: float) -> np.ndarray:
    if abs(warmth) < 1e-3:
        return sp
    nb = sp.shape[1]
    f = np.linspace(0, sr / 2, nb)
    octs = np.log2(np.maximum(f, 1.0) / 600.0)
    # warmer: up to -3 dB/octave above 600 Hz and +2 dB shelf below 300 Hz
    gain_db = np.where(octs > 0, -3.0 * warmth * octs, 0.0) + np.where(f < 300, 2.0 * warmth, 0.0)
    return sp * (10 ** (gain_db / 10))[None, :]


def transfer(
    y: np.ndarray, sr: int, c: StyleControls, targets: StyleTargets | None = None,
    params: world.WorldParams | None = None, ref_params: world.WorldParams | None = None,
    alignment: Alignment | None = None,
) -> tuple[np.ndarray, StyleReport]:
    """Apply the controls to recording `y`. `alignment` maps user time (A) to reference time (B) and,
    with `ref_params`, enables melody and timing transfer."""
    c = c.clamped()
    t = targets or StyleTargets()
    rep = StyleReport()
    p = params or world.analyze(y, sr, accurate=True)
    fp = p.frame_period / 1000.0

    st, voiced = clean_f0_st(p.f0)
    if voiced.sum() < 10:
        raise ValueError("Not enough voiced audio to transform.")
    user_med = float(np.median(st[voiced]))
    new_st = st.copy()

    # 1. expression: scale movement around the median
    if abs(c.expression - 1) > 1e-3:
        new_st[voiced] = user_med + (st[voiced] - user_med) * c.expression
        rep.applied["expression"] = c.expression

    # 2. melody transfer from the aligned reference contour
    aligned = alignment is not None and ref_params is not None and alignment.plausible
    if c.melody_transfer > 0 and aligned:
        ref_st, ref_v = clean_f0_st(ref_params.f0)
        ref_med = float(np.median(ref_st[ref_v])) if ref_v.any() else user_med
        times = np.arange(p.n_frames) * fp
        rt = alignment.a_to_b_time(times)
        ridx = np.clip(np.round(rt / (ref_params.frame_period / 1000.0)).astype(int), 0, ref_params.n_frames - 1)
        ok = voiced & ref_v[ridx]
        # reference contour expressed relative to its own median, placed at the user's median
        ref_rel = ref_st[ridx] - ref_med + user_med
        a = c.melody_transfer
        blended = new_st.copy()
        blended[ok] = (1 - a) * new_st[ok] + a * ref_rel[ok]
        # soften the boundaries where the reference has no pitch but the user does
        mask = ok.astype(np.float64)
        k = max(1, int(0.04 / fp))
        soft = np.convolve(mask, np.ones(k) / k, mode="same")
        new_st[voiced] = (1 - soft[voiced]) * new_st[voiced] + soft[voiced] * blended[voiced]
        rep.applied["melody_transfer"] = a
        rep.applied["melody_frames_matched"] = round(float(ok.sum() / max(voiced.sum(), 1)), 3)
    elif c.melody_transfer > 0:
        rep.notes.append("melody_transfer_skipped_no_alignment")

    # 3. register: manual shift + octave-aware move toward the reference register
    shift = c.pitch_shift_st
    if c.register_match > 0 and t.ref_median_st is not None:
        target = _nearest_octave(t.ref_median_st, user_med)
        shift += float(np.clip(c.register_match * (target - user_med), -5, 5))
    if abs(shift) > 1e-3:
        new_st[voiced] += shift
        rep.applied["pitch_shift_st"] = round(shift, 2)

    # 4. smoothness: remove pitch micro-variation (<~12 Hz) and reduce breathiness
    ap = p.ap.copy()
    if c.smoothness > 0:
        k = max(1, int((0.02 + 0.06 * c.smoothness) / fp))
        for a0, b0 in _runs(voiced):
            if b0 - a0 > k:
                seg = new_st[a0:b0]
                pad = np.pad(seg, (k // 2, k - 1 - k // 2), mode="edge")
                new_st[a0:b0] = np.convolve(pad, np.ones(k) / k, mode="valid")
        ap[voiced] = ap[voiced] ** (1 + 1.5 * c.smoothness)
        rep.applied["smoothness"] = c.smoothness

    # 5. vibrato on held notes
    if c.vibrato > 0:
        rate = t.ref_vibrato_rate or 5.5
        depth_c = (t.ref_vibrato_cents or 35.0) * c.vibrato
        depth_c = min(depth_c, 60.0)
        added = 0
        for a0, b0 in _runs(voiced):
            n = b0 - a0
            if n * fp < 0.35:
                continue
            seg = new_st[a0:b0]
            if np.ptp(seg) > 2.0:  # not a held note
                continue
            tt = np.arange(n) * fp
            env = np.minimum(1.0, np.minimum(tt / 0.15, (tt[-1] - tt) / 0.15 + 1e-9))
            env = np.clip(env, 0, 1) * np.clip((tt - 0.08) / 0.12, 0, 1)  # vibrato starts after onset
            new_st[a0:b0] = seg + (depth_c / 100.0) * env * np.sin(2 * np.pi * rate * tt)
            added += 1
        rep.applied["vibrato_notes"] = added

    f0 = np.zeros_like(p.f0)
    f0[voiced] = st_to_hz(new_st[voiced])
    f0 = np.clip(f0, 0, 1100)
    # frames where clean_f0_st dropped an outlier but WORLD had pitch: keep them voiced, shifted
    dropped = (p.f0 > 0) & ~voiced
    if dropped.any():
        f0[dropped] = p.f0[dropped] * 2 ** (shift / 12)
    q = world.WorldParams(f0=f0, sp=p.sp.copy(), ap=ap, sr=p.sr, frame_period=p.frame_period)

    # 6. timbre: resonance (formant scaling) and warmth (tilt)
    ratio = 1.0 + 0.12 * c.resonance
    q.sp = _tilt(_freq_warp(q.sp, ratio), q.sr, c.warmth)
    if abs(ratio - 1) > 1e-3:
        rep.applied["formant_ratio"] = round(ratio, 3)
    if abs(c.warmth) > 1e-3:
        rep.applied["warmth"] = c.warmth

    # 7. timing: global pace and/or the reference timing
    n = q.n_frames
    times = np.arange(n) * fp
    out_times = times * c.pace
    if c.timing_match > 0 and aligned:
        ref_t = alignment.a_to_b_time(times)
        # scale the reference timeline to start where the user starts
        ref_t = ref_t - ref_t[0]
        target = (1 - c.timing_match) * out_times + c.timing_match * ref_t
        # keep it monotonic and limit local stretch to 0.5x..2x to avoid artefacts
        k = max(1, int(0.1 / fp))
        target = np.convolve(np.pad(target, (k // 2, k - 1 - k // 2), mode="edge"), np.ones(k) / k, mode="valid")
        d = np.clip(np.diff(target, prepend=0.0), 0.5 * fp * c.pace, 2.0 * fp * c.pace)
        d[0] = 0.0
        out_times = np.cumsum(d)
        rep.applied["timing_match"] = c.timing_match
    elif c.timing_match > 0:
        rep.notes.append("timing_match_skipped_no_alignment")
    if not np.allclose(out_times, times):
        total = out_times[-1]
        grid = np.arange(int(total / fp) + 1) * fp
        src = np.interp(grid, out_times, np.arange(n, dtype=np.float64))
        q = _warp_frames(q, src)
        rep.applied["duration_ratio"] = round(float(total / max(times[-1], fp)), 3)

    out = world.synthesize(q)
    out = loudness_normalize(out, sr, -18.0)
    return out, rep
