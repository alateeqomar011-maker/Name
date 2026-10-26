"""Audio pipeline tests on real human speech (LibriSpeech fixtures)."""
import numpy as np
import pytest
from conftest import FIXTURES, load

from murattil.audio import align, analysis, io, style, world

SR = 24000


@pytest.fixture(scope="module")
def a():
    return load("speaker_a.ogg", SR)


@pytest.fixture(scope="module")
def a_params(a):
    return world.analyze(a, SR)


def _median_st(y):
    p = world.analyze(y, SR, accurate=False)
    st, v = analysis.clean_f0_st(p.f0)
    return float(np.median(st[v])), st, v


def test_decode_any_format_and_limits():
    data = (FIXTURES / "speaker_a.ogg").read_bytes()
    y = io.decode(data, sr=16000)
    assert abs(y.size / 16000 - 16.745) < 0.05
    with pytest.raises(io.AudioError):
        io.decode(data, sr=16000, max_seconds=5)
    with pytest.raises(io.AudioError):
        io.decode(b"not audio at all", sr=16000)


def test_loudness_normalisation(a):
    out = io.loudness_normalize(a * 0.05, SR, -18)
    assert abs(io.loudness_lufs(out, SR) - (-18)) < 0.6


def test_wav_comment_roundtrip():
    wav = io.encode_wav(np.zeros(1600, dtype=np.float32), 16000, comment="style-inspired, not the reciter")
    assert b"ICMT" in wav and b"not the reciter" in wav
    assert io.decode(wav, sr=16000).size == 1600


def test_profiles_distinguish_speakers():
    male = analysis.profile(load("speaker_b.ogg", SR), SR)
    female = analysis.profile(load("speaker_c.ogg", SR), SR)
    assert male.f0_median_hz < 110 < 150 < female.f0_median_hz
    assert male.vtl_cm > female.vtl_cm
    assert female.formants_hz[0] > male.formants_hz[0]


def test_controls_have_measured_effect(a, a_params):
    m0, _, _ = _median_st(a)
    out, rep = style.transfer(a, SR, style.StyleControls(pitch_shift_st=4), params=a_params)
    assert abs(_median_st(out)[0] - m0 - 4) < 0.4
    out, _ = style.transfer(a, SR, style.StyleControls(pace=1.25), params=a_params)
    assert abs(out.size / a.size - 1.25) < 0.02
    base = analysis.profile(a, SR, params=a_params)
    out, _ = style.transfer(a, SR, style.StyleControls(resonance=-1), params=a_params)
    deeper = analysis.profile(out, SR)
    ratio = np.array(deeper.formants_hz) / np.array(base.formants_hz)
    assert np.all((ratio > 0.82) & (ratio < 0.95))
    out, _ = style.transfer(a, SR, style.StyleControls(warmth=1), params=a_params)
    assert analysis.profile(out, SR).warmth_db > base.warmth_db + 2


def test_register_match_stays_in_users_octave(a, a_params):
    st, v = analysis.clean_f0_st(a_params.f0)
    m0 = float(np.median(st[v]))
    t = style.StyleTargets(ref_median_st=m0 - 11)  # a reference almost an octave lower
    out, rep = style.transfer(a, SR, style.StyleControls(register_match=1.0), targets=t, params=a_params)
    assert abs(rep.applied["pitch_shift_st"] - 1.0) < 0.05  # moved to the nearest octave, not down 11


def test_alignment_recovers_time_warp(a, a_params):
    y = a[: SR * 10]
    ref, _ = style.transfer(y, SR, style.StyleControls(pace=1.2, resonance=-0.8, pitch_shift_st=-5, expression=1.6))
    al = align.align_recordings(y, ref, SR)
    assert al.plausible
    t = np.linspace(0.5, 9.5, 10)
    assert np.max(np.abs(al.a_to_b_time(t) - 1.2 * t)) < 0.08


def test_alignment_rejects_different_content():
    y1 = load("speaker_a.ogg", SR)[: SR * 8]
    y2 = load("speaker_b.ogg", SR)[: SR * 8]
    assert not align.align_recordings(y1, y2, SR).plausible


def test_melody_transfer_follows_reference_contour(a):
    y = a[: SR * 10]
    p = world.analyze(y, SR)
    st, v = analysis.clean_f0_st(p.f0)
    med = np.median(st[v])
    inv = np.zeros_like(st)
    inv[v] = med - (st[v] - med) - 4  # mirrored melody, lower register
    q = world.WorldParams(f0=np.where(v, analysis.st_to_hz(inv), 0.0), sp=style._freq_warp(p.sp, 0.9), ap=p.ap, sr=SR)
    n = q.n_frames
    q = style._warp_frames(q, np.linspace(0, n - 1, int(n * 1.15)))
    ref = world.synthesize(q)
    al = align.align_recordings(y, ref, SR)
    out, rep = style.transfer(y, SR, style.StyleControls(melody_transfer=1.0, timing_match=1.0), params=p,
                              ref_params=world.analyze(ref, SR), alignment=al)
    _, so, vo = _median_st(out)
    _, sr_, vr = _median_st(ref)
    m = min(len(so), len(sr_))
    both = vo[:m] & vr[:m]
    corr = np.corrcoef(so[:m][both] - np.median(so[vo]), sr_[:m][both] - np.median(sr_[vr]))[0, 1]
    assert corr > 0.7
    assert abs(np.median(so[vo]) - med) < 1.0  # stays in the user's register


def test_suggest_is_bounded():
    p1 = analysis.profile(load("speaker_a.ogg", SR), SR)
    p2 = analysis.profile(load("speaker_c.ogg", SR), SR)
    c, t = style.suggest(p1, p2, strength=1.0)
    assert c == c.clamped()
    assert t.ref_median_st is not None
