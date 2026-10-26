"""Voice Studio engine tests. The reference reciter is served by a local stand-in for everyayah.com
(see conftest.py) that returns real human speech."""
import datetime as dt
import hashlib
import json

import numpy as np
import pytest
from conftest import FIXTURES, load

from murattil.voice import engine, identity, neural, registry


@pytest.fixture
def audio():
    return (FIXTURES / "speaker_a.ogg").read_bytes()


def test_style_only_when_neural_weights_missing(fake_reference, audio):
    res = engine.run(audio, engine.TransformRequest(reciter_id="alafasy", max_seconds=60))
    r = res.report
    assert r["engine"] == "style"
    assert "no neural voice conversion" in r["label"]["en"]
    assert "neural_engine_unavailable" in r["notes"]
    assert r["neural"]["used"] is False and "not installed" in r["neural"]["unavailableReason"]
    assert "not Mishary Rashid Alafasy's voice" in r["label"]["disclaimer_en"]
    assert b"not Mishary Rashid Alafasy's voice" in res.wav
    # the output is still recognisably the user's voice
    assert r["identity"]["passed"] is True
    assert r["identity"]["toUser"] > r["identity"]["toReference"]
    assert abs(r["durations"]["output"] / r["durations"]["input"] - r["styleApplied"].get("duration_ratio", 1)) < 0.05


def test_mismatched_passage_skips_melody_transfer(fake_reference, audio):
    res = engine.run(audio, engine.TransformRequest(reciter_id="alafasy", surah=1, ayah_from=1, ayah_to=3,
                                                    max_seconds=60, neural_mode="off"))
    r = res.report
    assert r["reference"]["passageUsed"] is True and len(r["reference"]["ayahs"]) == 3
    assert r["alignment"]["plausible"] is False
    assert "alignment_implausible" in r["notes"]
    assert "melody_transfer" not in r["styleApplied"]


def test_unknown_reciter(audio):
    with pytest.raises(engine.TransformError):
        engine.run(audio, engine.TransformRequest(reciter_id="nobody"))


def test_reference_unreachable_is_reported(fake_reference, monkeypatch, audio):
    from murattil import reciters
    monkeypatch.setattr(reciters, "EVERYAYAH", "http://127.0.0.1:9/data/{folder}/{s:03d}{a:03d}.mp3")
    monkeypatch.setattr(reciters, "allowed_reference_url", lambda u: True)
    engine_cache = engine.settings.cache_dir / "profiles" / "sudais.json"
    engine_cache.unlink(missing_ok=True)
    with pytest.raises(engine.TransformError, match="could not be loaded"):
        engine.run(audio, engine.TransformRequest(reciter_id="sudais", max_seconds=60))


def test_identity_guard_rejects_output_that_is_not_the_user(fake_reference, monkeypatch, audio):
    """With randomly initialised kNN-VC weights the 'converted' audio is noise; the guard must
    refuse it and fall back to the labelled signal-processing result instead of shipping it."""
    neural.unload_for_tests()
    neural.load(random_weights_for_tests=True)
    monkeypatch.setattr(neural, "status", lambda: neural.EngineStatus(True, None, "test"))
    try:
        res = engine.run(audio, engine.TransformRequest(reciter_id="alafasy", max_seconds=20, neural_mode="blend",
                                                        neural_strength=0.5))
    finally:
        neural.unload_for_tests()
    r = res.report
    assert "identity_guard_rejected_neural_output" in r["notes"]
    assert r["engine"] == "style" and r["neural"]["used"] is False


def test_blend_is_capped_for_unauthorised_reciters():
    assert engine.BLEND_CAP <= 0.5


def test_knn_match_and_blend_math():
    rng = np.random.default_rng(0)
    ms = rng.normal(size=(50, 8)).astype(np.float32)
    q = ms[[3, 7]] + 0.01
    out = neural.knn_match(q, ms, k=1)
    assert np.allclose(out, ms[[3, 7]])


def test_identity_separates_speakers():
    a1 = load("speaker_a.ogg")[: 16000 * 8]
    a2 = load("speaker_a.ogg")[16000 * 8:]
    b = load("speaker_b.ogg")
    ea1, ea2, eb = identity.embed(a1, 16000), identity.embed(a2, 16000), identity.embed(b, 16000)
    assert identity.similarity(ea1, ea2) > identity.similarity(ea1, eb) + 0.2
    chk = identity.check(ea2, ea1, eb)
    assert chk.passed is True


def _consent(tmp_path, **kw):
    doc = tmp_path / "consent.pdf"
    doc.write_bytes(b"%PDF signed consent")
    c = {"grantedBy": "Voice Owner", "signedAt": "2026-01-01", "scope": ["voice-conversion"],
         "documentSha256": hashlib.sha256(doc.read_bytes()).hexdigest(), "documentFile": "consent.pdf"}
    c.update(kw)
    return c, doc


def test_consent_validation(tmp_path):
    c, _ = _consent(tmp_path)
    assert registry.validate_consent(c, dt.date(2026, 6, 1)) is None
    assert "expired" in registry.validate_consent({**c, "expiresAt": "2026-02-01"}, dt.date(2026, 6, 1))
    assert "scope" in registry.validate_consent({**c, "scope": ["playback"]}, dt.date(2026, 6, 1))
    assert "revoked" in registry.validate_consent({**c, "revoked": "2026-03-01"}, dt.date(2026, 6, 1))
    assert "missing" in registry.validate_consent({k: v for k, v in c.items() if k != "grantedBy"})


def test_registry_loads_only_consented_models(tmp_path, monkeypatch):
    monkeypatch.setattr(registry, "root", lambda: tmp_path / "voices")
    good = tmp_path / "voices" / "good"
    bad = tmp_path / "voices" / "tampered"
    for d in (good, bad):
        d.mkdir(parents=True)
        c, doc = _consent(tmp_path)
        (d / "consent.pdf").write_bytes(doc.read_bytes())
        np.save(d / "matching_set.npy", np.zeros((10, 1024), dtype=np.float16))
        (d / "manifest.json").write_text(json.dumps({"id": d.name, "displayName": {"en": d.name}, "consent": c}))
    (bad / "consent.pdf").write_bytes(b"altered")
    ids = [m.id for m in registry.load_all()]
    assert ids == ["good"]
