"""Tests against the real model weights (downloaded by scripts/fetch_models.py into
server/models/). Skipped when the weights are not installed.

Run with:  MURATTIL_REAL_MODELS=1 pytest tests/test_real_models.py
"""
import os
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest
from conftest import FIXTURES, _RefHandler, load

REAL = Path(__file__).resolve().parents[1] / "models"
HAVE_ASR = (REAL / "asr" / "fastconformer_full_mixed.onnx").is_file()
HAVE_KNNVC = (REAL / "knnvc" / "WavLM-Large.pt").is_file() and (REAL / "knnvc" / "prematch_g_02500000.pt").is_file()

pytestmark = pytest.mark.skipif(os.environ.get("MURATTIL_REAL_MODELS") != "1",
                                reason="set MURATTIL_REAL_MODELS=1 to run tests against the downloaded weights")


@pytest.fixture
def real_models(monkeypatch):
    from murattil.config import settings
    from murattil.tajweed import asr
    from murattil.voice import neural
    object.__setattr__(settings, "models_dir", REAL)
    asr.set_model_for_tests(None)
    neural.unload_for_tests()
    yield
    asr.set_model_for_tests(None)
    neural.unload_for_tests()


@pytest.mark.skipif(not HAVE_ASR, reason="Quran ASR model not installed")
def test_real_asr_reads_synthetic_fatiha(real_models):
    from murattil.tajweed import coach
    r = coach.analyze((FIXTURES / "synthetic_fatiha_1_5.flac").read_bytes(), 1, 1, 5)
    assert r["mode"] == "full"
    assert r["scores"]["wordAccuracy"] >= 0.75
    assert not any(f["kind"] == "missed_word" for f in r["findings"])


@pytest.mark.skipif(not HAVE_ASR, reason="Quran ASR model not installed")
def test_real_asr_finds_the_omitted_word(real_models):
    from murattil.tajweed import coach
    r = coach.analyze((FIXTURES / "synthetic_fatiha_1_5_missing_word.flac").read_bytes(), 1, 1, 5)
    missed = [(f["ayah"], f["word"]) for f in r["findings"] if f["kind"] == "missed_word"]
    assert (5, 2) in missed


@pytest.mark.skipif(not HAVE_KNNVC, reason="kNN-VC weights not installed")
def test_real_knnvc(real_models):
    from murattil.voice import identity, neural
    a = load("speaker_a.ogg")
    b = load("speaker_b.ogg")
    ms = neural.matching_set_from_audio([b])
    ea, eb = identity.embed(a, 16000), identity.embed(b, 16000)
    resynth = identity.embed(neural.convert(a[: 16000 * 8], ms, 0.0), 16000)
    full = identity.embed(neural.convert(a[: 16000 * 8], ms, 1.0), 16000)
    blend = identity.embed(neural.convert(a[: 16000 * 8], ms, 0.35), 16000)
    assert identity.similarity(resynth, ea) > 0.9            # the vocoder reproduces the user
    assert identity.similarity(full, eb) > identity.similarity(full, ea)  # full conversion becomes B
    assert identity.check(blend, ea, eb).passed               # a capped blend stays the user


@pytest.mark.skipif(not HAVE_KNNVC, reason="kNN-VC weights not installed")
def test_real_engine_blend(real_models, monkeypatch):
    from murattil import reciters
    from murattil.voice import engine
    _RefHandler.voices = {"a": load("speaker_a.ogg"), "b": load("speaker_b.ogg")}
    srv = ThreadingHTTPServer(("127.0.0.1", 0), _RefHandler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}"
    monkeypatch.setattr(reciters, "EVERYAYAH", base + "/data/{folder}/{s:03d}{a:03d}.mp3")
    monkeypatch.setattr(reciters, "allowed_reference_url", lambda u: u.startswith(base))
    monkeypatch.setattr(reciters, "mp3quran_index", lambda force=False: {})
    try:
        res = engine.run((FIXTURES / "speaker_a.ogg").read_bytes(),
                         engine.TransformRequest(reciter_id="shatri", neural_mode="blend", neural_strength=0.35))
    finally:
        srv.shutdown()
    r = res.report
    assert r["engine"] == "blend" and r["neural"]["used"] and r["neural"]["blend"] <= engine.BLEND_CAP
    assert r["identity"]["passed"] is True
    assert "AI voice blend" in r["label"]["en"]


@pytest.mark.skipif(not HAVE_ASR, reason="Quran ASR model not installed")
def test_real_technique_measures_a_slower_recitation(real_models):
    """The same recitation slowed to 0.8x must measure ~0.8x the pace with the same melody."""
    import librosa
    from murattil.voice import technique
    y = load("synthetic_fatiha_1_5.flac")
    same = technique.compare(y, y, 1, 1, 5, {"en": "Ref", "ar": "المرجع"})
    assert same["scores"]["pace"] == 100 and same["scores"]["melody"] == 100
    slow = librosa.effects.time_stretch(y, rate=0.8)
    r = technique.compare(slow, y, 1, 1, 5, {"en": "Ref", "ar": "المرجع"})
    assert 0.72 <= r["pacing"]["ratio"] <= 0.9
    assert r["scores"]["melody"] >= 75
    assert r["wordsCompared"] >= r["wordsTotal"] // 2 and any(t["key"] == "pace" for t in r["tips"])
    assert all(w["userSeg"] and w["refSeg"] for w in r["words"] if w["usable"])


@pytest.mark.skipif(not HAVE_ASR, reason="Quran ASR model not installed")
def test_real_segmentation_of_a_continuous_recitation(real_models):
    """Ayah boundaries found in one continuous recording are in order and cover the recording."""
    import numpy as np
    from murattil.tajweed import segment
    y = load("synthetic_fatiha_1_5.flac")
    # remove the pauses between ayahs entirely: the segmenter must still find the ayahs from the words
    from murattil.audio.vad import speech_segments
    y = np.concatenate([y[int(a * 16000):int(b * 16000)] for a, b in speech_segments(y, 16000, min_silence=0.3)])
    segs = segment.segment(y, [(1, a) for a in range(1, 6)])
    assert [s["ayah"] for s in segs] == [1, 2, 3, 4, 5]
    assert all(s["reliable"] for s in segs)
    assert all(segs[i]["end"] <= segs[i + 1]["start"] + 1e-6 for i in range(4))
    assert segs[0]["start"] < 0.5 and segs[-1]["end"] > y.size / 16000 - 1.0
